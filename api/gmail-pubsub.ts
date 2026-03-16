import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processEmailContent } from './email-webhook';

// Vercel: needs enough time to fetch the email + run Gemini (same budget as email-webhook)
export const config = { maxDuration: 60, bodyParser: { sizeLimit: '1mb' } };

// ─── Supabase state helpers (stores last processed historyId) ───────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STATE_KEY = 'gmail_last_history_id';

async function getLastHistoryId(): Promise<string | null> {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/gmail_state?key=eq.${STATE_KEY}&select=value`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        const rows = await res.json() as Array<{ value: string }>;
        return rows[0]?.value ?? null;
    } catch {
        return null;
    }
}

async function setLastHistoryId(historyId: string): Promise<void> {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/gmail_state`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({ key: STATE_KEY, value: historyId }),
        });
    } catch {
        // Non-fatal: worst case we process a duplicate on next run
    }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PubSubPushBody {
    message: {
        data: string;        // base64-encoded JSON payload from Gmail
        messageId: string;
        publishTime: string;
        attributes?: Record<string, string>;
    };
    subscription: string;
}

interface GmailPushPayload {
    emailAddress: string;
    historyId: number;
}

// ─── Gmail OAuth2 token management ─────────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * Gets a valid Gmail API access token using OAuth2 refresh token flow.
 * Caches the token in memory until it expires (Vercel function lifetime ~60s,
 * so in practice this rarely reuses a token — but it avoids extra round trips
 * if the function is kept warm).
 */
async function getGmailAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
        return cachedToken.accessToken;
    }

    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
            'Missing Gmail OAuth2 env vars: GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN'
        );
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`[gmail-pubsub] OAuth2 token refresh failed: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { access_token: string; expires_in: number };
    cachedToken = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.accessToken;
}

// ─── Gmail send helper ─────────────────────────────────────────────────────────

/**
 * Sends an email reply via Gmail API using the existing OAuth token.
 */
async function sendGmailReply(
    toEmail: string,
    subject: string,
    body: string,
    accessToken: string
): Promise<void> {
    // Build RFC 2822 message
    const message = [
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        body,
    ].join('\r\n');

    // Base64url encode
    const encoded = Buffer.from(message).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const resp = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: encoded }),
        }
    );

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`[gmail-pubsub] Failed to send email: ${resp.status} ${text}`);
    }
    console.log(`[gmail-pubsub] Reply sent to ${toEmail}`);
}

// ─── Gmail API helpers ─────────────────────────────────────────────────────────

/**
 * Calls gmail.users.history.list to find new messages since historyId.
 * Returns the list of new message IDs.
 */
async function getNewMessageIds(
    userEmail: string,
    historyId: string,
    accessToken: string
): Promise<string[]> {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userEmail)}/history`);
    url.searchParams.set('startHistoryId', historyId);
    url.searchParams.set('historyTypes', 'messageAdded');
    // Only look at INBOX messages — ignore Sent, Drafts, etc.
    url.searchParams.set('labelId', 'INBOX');

    const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (resp.status === 404) {
        // historyId expired (happens after watch creation or if too old). Safe to ignore.
        console.warn('[gmail-pubsub] historyId not found (expired or too old) — skipping');
        return [];
    }

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`[gmail-pubsub] history.list failed: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }> };
    const ids: string[] = [];
    for (const entry of data.history ?? []) {
        for (const added of entry.messagesAdded ?? []) {
            ids.push(added.message.id);
        }
    }
    // Deduplicate (Gmail can report the same message in multiple history entries)
    return [...new Set(ids)];
}

// ─── Email parsing helpers ─────────────────────────────────────────────────────

function decodeBase64Url(encoded: string): string {
    // Gmail uses base64url encoding (- instead of +, _ instead of /)
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
    return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

interface ParsedEmail {
    subject: string;
    from: string;
    body: string;
    attachments: Array<{ filename: string; mimeType: string; base64Data: string }>;
}

/**
 * Fetches a Gmail message and parses subject, from, plain-text body and attachments.
 */
async function fetchAndParseMessage(
    userEmail: string,
    messageId: string,
    accessToken: string
): Promise<ParsedEmail> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userEmail)}/messages/${messageId}?format=full`;
    const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`[gmail-pubsub] messages.get failed for ${messageId}: ${resp.status} ${text}`);
    }

    const msg = await resp.json() as any;
    const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
    const subject = getHeader(headers, 'Subject');
    const from = getHeader(headers, 'From');

    // Walk the MIME tree to extract plain text body and attachments
    let body = '';
    const attachments: ParsedEmail['attachments'] = [];

    function walkParts(parts: any[]): void {
        for (const part of parts ?? []) {
            if (part.parts) {
                walkParts(part.parts);
            } else if (part.mimeType === 'text/plain' && part.body?.data) {
                body += decodeBase64Url(part.body.data);
            } else if (part.filename && part.body) {
                // Attachment: data is either inline or referenced by attachmentId
                // For Pub/Sub notification the data may be inline (small files) or need a separate fetch.
                // We only support inline data here (base64 in body.data).
                // Large attachments come via body.attachmentId — fetch them separately.
                if (part.body.data) {
                    attachments.push({
                        filename: part.filename,
                        mimeType: part.mimeType,
                        base64Data: part.body.data.replace(/-/g, '+').replace(/_/g, '/'),
                    });
                } else if (part.body.attachmentId) {
                    // Defer large attachments — fetch inline
                    attachments.push({
                        filename: part.filename,
                        mimeType: part.mimeType,
                        // Will be fetched below after parsing
                        base64Data: `ATTACHMENT_ID:${part.body.attachmentId}:${messageId}`,
                    });
                }
            }
        }
    }

    // The root payload may itself be a part (for simple messages)
    if (msg.payload?.body?.data && msg.payload.mimeType === 'text/plain') {
        body = decodeBase64Url(msg.payload.body.data);
    } else {
        walkParts(msg.payload?.parts ?? []);
    }

    // Fetch large attachments that were referenced by attachmentId
    for (const att of attachments) {
        if (att.base64Data.startsWith('ATTACHMENT_ID:')) {
            const [, attId, msgId] = att.base64Data.split(':');
            const attUrl = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userEmail)}/messages/${msgId}/attachments/${attId}`;
            const attResp = await fetch(attUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (attResp.ok) {
                const attData = await attResp.json() as { data: string };
                // Convert base64url to standard base64
                att.base64Data = attData.data.replace(/-/g, '+').replace(/_/g, '/');
            } else {
                console.error(`[gmail-pubsub] Failed to fetch attachment ${attId}: ${attResp.status}`);
                att.base64Data = '';
            }
        }
    }

    return { subject, from, body, attachments };
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only accept POST from Pub/Sub
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Security: validate bearer token passed as query param ────────────────
    // Google Pub/Sub push subscriptions support attaching a token in the URL.
    // Configure the push endpoint as: https://your-app.vercel.app/api/gmail-pubsub?token=YOUR_SECRET
    const expectedToken = process.env.PUBSUB_TOKEN;
    const receivedToken = req.query.token as string | undefined;
    if (!expectedToken || receivedToken !== expectedToken) {
        console.warn('[gmail-pubsub] Unauthorized Pub/Sub push — invalid token');
        // Return 200 anyway so Pub/Sub doesn't keep retrying with invalid messages
        return res.status(200).json({ ok: false, reason: 'invalid_token' });
    }

    // ── Parse Pub/Sub push message ────────────────────────────────────────────
    const push = req.body as PubSubPushBody;
    if (!push?.message?.data) {
        console.warn('[gmail-pubsub] Missing message.data in Pub/Sub push body');
        return res.status(200).json({ ok: false, reason: 'missing_data' });
    }

    let gmailPayload: GmailPushPayload;
    try {
        const decoded = Buffer.from(push.message.data, 'base64').toString('utf-8');
        gmailPayload = JSON.parse(decoded);
        console.log(`[gmail-pubsub] Push for ${gmailPayload.emailAddress}, historyId=${gmailPayload.historyId}`);
    } catch (err: any) {
        console.error('[gmail-pubsub] Failed to decode Pub/Sub message:', err.message);
        return res.status(200).json({ ok: false, reason: 'bad_payload' });
    }

    const userEmail = process.env.GMAIL_USER_EMAIL || gmailPayload.emailAddress;

    // ── Process new emails, then ACK ─────────────────────────────────────────
    // Vercel terminates the function after res is sent, so we process first
    // and respond at the end. Pub/Sub ack deadline is 120s; function maxDuration is 60s.
    try {
        const currentHistoryId = String(gmailPayload.historyId);

        // Retrieve the previously stored historyId to use as startHistoryId in history.list.
        // history.list(startHistoryId=X) returns entries with id > X, so we pass the LAST
        // known id (not the current one) to get the messages added in between.
        const lastHistoryId = await getLastHistoryId();
        console.log(`[gmail-pubsub] lastHistoryId=${lastHistoryId} currentHistoryId=${currentHistoryId}`);

        // Always update stored historyId first to avoid reprocessing on retry
        await setLastHistoryId(currentHistoryId);

        if (!lastHistoryId) {
            // First run: no previous id stored, just save current and skip processing
            console.log('[gmail-pubsub] First run — storing historyId, skipping processing');
            return res.status(200).json({ ok: true, firstRun: true });
        }

        if (lastHistoryId === currentHistoryId) {
            console.log('[gmail-pubsub] historyId unchanged — skipping');
            return res.status(200).json({ ok: true, skipped: true });
        }

        const accessToken = await getGmailAccessToken();
        const newIds = await getNewMessageIds(userEmail, lastHistoryId, accessToken);
        console.log(`[gmail-pubsub] New message IDs: ${newIds.join(', ') || 'none'}`);

        for (const msgId of newIds) {
            try {
                const email = await fetchAndParseMessage(userEmail, msgId, accessToken);
                console.log(`[gmail-pubsub] Processing: "${email.subject}" from ${email.from}`);

                if (!email.subject && !email.body) {
                    console.warn(`[gmail-pubsub] Skipping empty message ${msgId}`);
                    continue;
                }

                const result = await processEmailContent({
                    subject: email.subject,
                    from: email.from,
                    body: email.body,
                    attachments: email.attachments.filter(a => a.base64Data),
                });

                console.log(
                    `[gmail-pubsub] Done for msg ${msgId}. ` +
                    `Verdict: ${result.fidelity.verdict} (${result.fidelity.fidelityScore}/100). ` +
                    `Source: ${result.contentSource}`
                );

                // ── Send reply with the generated press release ───────────────
                const pr = result.pressRelease;
                const replySubject = `TELETIPO: ${pr.headline || email.subject}`;
                const replyBody = [
                    pr.antetitulo ? `ANTETÍTULO: ${pr.antetitulo}` : '',
                    `TITULAR: ${pr.headline}`,
                    pr.subtitulo ? `SUBTÍTULO: ${pr.subtitulo}` : '',
                    '',
                    `ENTRADILLA: ${pr.lead}`,
                    '',
                    pr.body,
                    '',
                    '---',
                    `Fidelidad: ${result.fidelity.verdict} (${result.fidelity.fidelityScore}/100)`,
                    result.fidelity.summary ? `Resumen: ${result.fidelity.summary}` : '',
                ].filter(Boolean).join('\n');

                // Extract plain email address from "Name <email>" format
                const toMatch = email.from.match(/<([^>]+)>/) || [null, email.from];
                const toEmail = toMatch[1];

                await sendGmailReply(toEmail, replySubject, replyBody, accessToken);
            } catch (msgErr: any) {
                console.error(`[gmail-pubsub] Error processing message ${msgId}:`, msgErr.message);
            }
        }

        return res.status(200).json({ ok: true });
    } catch (err: any) {
        console.error('[gmail-pubsub] Fatal error during email processing:', err.message);
        return res.status(200).json({ ok: false, reason: err.message });
    }
}
