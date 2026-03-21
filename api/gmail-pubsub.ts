/*
 * Copyright (c) 2026 Javier Aldea
 * Todos los derechos reservados.
 * Este software es propiedad de Javier Aldea y solo es utilizable por Servimedia.
 * Queda prohibida su reproducción, distribución o uso sin autorización expresa.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processEmailContent, ProcessEmailResult } from './email-webhook';

// Vercel: needs enough time to fetch the email + run Gemini (same budget as email-webhook)
export const config = { maxDuration: 120, bodyParser: { sizeLimit: '1mb' } };

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

function buildHtmlEmail(result: ProcessEmailResult): string {
    const pr = result.pressRelease;
    const fi = result.fidelity;
    const now = new Date().toLocaleString('es-ES');

    const issuesHtml = (fi.issues ?? []).map(issue => {
        const label = issue.type === 'ok' ? 'OK' : issue.type === 'omission' ? 'OMISSION' : 'DISTORTION';
        const weight = issue.severity === 'high' ? 'high' : issue.severity === 'medium' ? 'medium' : 'low';
        return `<li style="margin-bottom:6px"><span style="color:#6b7280;font-weight:600">[${label} - ${weight}]</span> ${issue.description}</li>`;
    }).join('');

    const verdictBg = fi.fidelityScore >= 90 ? '#16a34a' : fi.fidelityScore >= 70 ? '#d97706' : '#dc2626';
    // Split on \n\n first; if Gemini returned a single block, fall back to \n
    const rawBodyParagraphs = (pr.body || '').split('\n\n').filter(p => p.trim());
    const bodyParagraphs = rawBodyParagraphs.length > 1
        ? rawBodyParagraphs
        : (pr.body || '').split('\n').filter(p => p.trim());
    const bodyHtml = bodyParagraphs
        .map(p => `<p style="margin:0 0 14px 0;font-size:15px;color:#333;line-height:1.8">${p.replace(/\n/g, '<br>')}</p>`)
        .join('');
    const originalHtml = (pr.originalText || '').split('\n')
        .filter(l => l.trim())
        .map(l => `<p style="margin:0 0 14px 0;font-size:14px;color:#444;line-height:1.8">${l}</p>`)
        .join('');

    return `<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden">

  <!-- Header -->
  <div style="background:#333333;padding:20px 28px">
    <div style="color:#e50051;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Servimedia &middot; IA</div>
    <div style="color:#fff;font-size:18px;font-weight:700;margin-top:4px">Nota de Prensa Generada</div>
  </div>

  <!-- Nota -->
  <div style="padding:28px">
    ${pr.antetitulo ? `<div style="color:#e50051;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">${pr.antetitulo}</div>` : ''}
    <h1 style="margin:0 0 10px 0;font-size:24px;font-weight:800;color:#1a1a1a;line-height:1.3">${pr.headline}</h1>
    ${pr.subtitulo ? `<h2 style="margin:0 0 20px 0;font-size:16px;font-weight:600;color:#444;border-left:4px solid #f28e1c;padding-left:12px;line-height:1.4">${pr.subtitulo}</h2>` : ''}
    <hr style="border:none;border-top:1px solid #eee;margin-bottom:20px">
    <p style="margin:0 0 16px 0;font-size:15px;font-weight:600;color:#222;line-height:1.7">${pr.lead}</p>
    <div style="font-size:15px;color:#333;line-height:1.8">${bodyHtml}</div>
  </div>

  <!-- Texto original -->
  <div style="background:#fffbf0;border-top:3px solid #f28e1c;padding:24px 28px">
    <div style="font-size:13px;font-weight:700;color:#333;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px">📎 Texto Original</div>
    <div style="border-left:3px solid #f28e1c;padding-left:16px">${originalHtml}</div>
  </div>

  <!-- Informe de fidelidad -->
  <div style="background:#f8f9fa;border-top:1px solid #eee;padding:24px 28px">
    <div style="font-size:13px;font-weight:700;color:#333;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px">📊 Informe de Fidelidad</div>
    <div style="display:inline-block;background:${verdictBg};color:#fff;font-weight:700;padding:6px 14px;border-radius:20px;font-size:13px;margin-bottom:8px">${fi.verdict} &middot; ${fi.fidelityScore}/100</div>
    <p style="margin:10px 0 16px 0;font-size:14px;color:#555">${fi.summary || ''}</p>
    ${issuesHtml ? `<ul style="margin:0;padding-left:18px;font-size:13px;color:#444">${issuesHtml}</ul>` : ''}
    <p style="margin:20px 0 0;font-size:11px;color:#aaa;text-align:center">Generado autom&aacute;ticamente por Servimedia-IA &middot; ${now}</p>
  </div>

</div>
</body></html>`;
}

function classifyError(err: Error): { title: string; explanation: string; action: string } {
    const msg = err.message?.toLowerCase() ?? '';

    if (msg.includes('timeout') || msg.includes('deadline') || msg.includes('timed out')) {
        return {
            title: 'La nota tardó demasiado en procesarse',
            explanation: 'El documento es demasiado extenso o la IA tardó más de lo permitido.',
            action: 'Reenvía el email. Si el error se repite, prueba con un documento más corto o en formato .docx.',
        };
    }
    if (msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('429')) {
        return {
            title: 'Cuota de la IA temporalmente agotada',
            explanation: 'El sistema ha procesado demasiadas notas en poco tiempo.',
            action: 'Espera unos minutos y reenvía el email.',
        };
    }
    if (msg.includes('invalid_argument') || msg.includes('unsupported') || msg.includes('inlinedata')) {
        return {
            title: 'Formato de archivo no compatible',
            explanation: 'El archivo adjunto está en un formato que la IA no puede leer (posiblemente .doc antiguo de Word 97-2003).',
            action: 'Abre el archivo en Word, guárdalo como <strong>.docx</strong> y reenvía el email.',
        };
    }
    if (msg.includes('oauth') || msg.includes('token') || msg.includes('unauthorized') || msg.includes('401')) {
        return {
            title: 'Error de autenticación del sistema',
            explanation: 'El sistema tuvo un problema interno de autenticación.',
            action: 'Reenvía el email. Si el error persiste, contacta con el administrador.',
        };
    }
    if (msg.includes('mammoth') || msg.includes('word') || msg.includes('doc')) {
        return {
            title: 'No se pudo leer el archivo Word',
            explanation: 'El archivo .doc o .docx adjunto no pudo procesarse correctamente.',
            action: 'Guarda el archivo como <strong>.docx</strong> desde Word y reenvía el email.',
        };
    }
    return {
        title: 'Error interno al procesar la nota',
        explanation: 'Se produjo un error inesperado en el sistema.',
        action: 'Reenvía el email original para volver a intentarlo. Si el error persiste, contacta con el administrador.',
    };
}

function buildErrorEmail(originalSubject: string, err?: Error): string {
    const now = new Date().toLocaleString('es-ES');
    const info = err ? classifyError(err) : {
        title: 'No se pudo procesar tu email',
        explanation: 'El sistema no pudo generar la nota de prensa.',
        action: 'Reenvía el email original para volver a intentarlo.',
    };

    return `<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden">

  <!-- Header -->
  <div style="background:#333333;padding:20px 28px">
    <div style="color:#e50051;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Servimedia &middot; IA</div>
    <div style="color:#fff;font-size:18px;font-weight:700;margin-top:4px">Error al generar nota</div>
  </div>

  <!-- Body -->
  <div style="padding:28px">
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px 20px;border-radius:4px;margin-bottom:24px">
      <div style="color:#dc2626;font-weight:700;font-size:15px;margin-bottom:8px">&#9888;&#65039; ${info.title}</div>
      <div style="color:#555;font-size:14px;line-height:1.6;margin-bottom:6px">Email: <strong>"${originalSubject}"</strong></div>
      <div style="color:#555;font-size:14px;line-height:1.6">${info.explanation}</div>
    </div>
    <div style="background:#f0f9ff;border-left:4px solid #0284c7;padding:14px 18px;border-radius:4px">
      <div style="color:#0284c7;font-weight:700;font-size:13px;margin-bottom:6px">&#128161; Qué hacer</div>
      <p style="color:#333;font-size:14px;line-height:1.7;margin:0">${info.action}</p>
    </div>
    <p style="color:#888;font-size:12px;margin:24px 0 0;text-align:center">Servimedia-IA &middot; ${now}</p>
  </div>

</div>
</body></html>`;
}

/**
 * Sends an HTML email reply via Gmail API using the existing OAuth token.
 */
async function sendGmailReply(
    toEmail: string,
    subject: string,
    htmlBody: string,
    accessToken: string
): Promise<void> {
    // Build RFC 2822 MIME message with HTML content type
    const boundary = 'boundary_servimedia_' + Date.now();
    const message = [
        `To: ${toEmail}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'MIME-Version: 1.0',
        `Content-Type: text/html; charset=UTF-8`,
        '',
        htmlBody,
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
            // Track sender so we can notify them on error even if processing fails mid-way
            let toEmail: string | null = null;
            let emailSubject = '';

            try {
                const email = await fetchAndParseMessage(userEmail, msgId, accessToken);
                console.log(`[gmail-pubsub] Processing: "${email.subject}" from ${email.from}`);

                // Extract plain email address from "Name <email>" format — needed for error emails too
                const toMatch = email.from.match(/<([^>]+)>/) || [null, email.from];
                toEmail = toMatch[1];
                emailSubject = email.subject;

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
                const replySubject = `✅ Nota generada: ${email.subject}`;
                const htmlBody = buildHtmlEmail(result);
                await sendGmailReply(toEmail, replySubject, htmlBody, accessToken);

            } catch (msgErr: any) {
                console.error(`[gmail-pubsub] Error processing message ${msgId}:`, msgErr.message);

                // ── Notify sender so they know to retry ──────────────────────
                if (toEmail) {
                    try {
                        const errSubject = `⚠️ Error al generar nota: ${emailSubject}`;
                        await sendGmailReply(toEmail, errSubject, buildErrorEmail(emailSubject, msgErr instanceof Error ? msgErr : new Error(String(msgErr))), accessToken);
                        console.log(`[gmail-pubsub] Error notification sent to ${toEmail}`);
                    } catch (notifyErr: any) {
                        console.error(`[gmail-pubsub] Could not send error notification:`, notifyErr.message);
                    }
                }
            }
        }

        return res.status(200).json({ ok: true });
    } catch (err: any) {
        console.error('[gmail-pubsub] Fatal error during email processing:', err.message);
        return res.status(200).json({ ok: false, reason: err.message });
    }
}
