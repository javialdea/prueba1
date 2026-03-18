import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import mammoth from 'mammoth';

// Vercel: gemini-2.5-pro puede tardar 30-50 s — ampliamos a 120 s para no arriesgar timeout
export const config = { maxDuration: 120, bodyParser: { sizeLimit: '50mb' } };

export { processEmailContent };
export type { EmailWebhookPayload, ProcessEmailResult };

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttachmentPayload {
    filename: string;
    mimeType: string;
    base64Data: string;
}

interface EmailWebhookPayload {
    secret?: string;         // optional when called internally (already validated upstream)
    subject: string;
    from: string;
    body: string;           // plain-text body of the forwarded email
    attachments?: AttachmentPayload[];
}

interface ProcessEmailResult {
    ok: boolean;
    pressRelease: PressReleaseResult;
    fidelity: FidelityReport;
    contentSource: string;
}

interface PressReleaseResult {
    antetitulo: string;
    headline: string;
    subtitulo: string;
    lead: string;
    body: string;
    originalText: string;
}

interface FidelityIssue {
    type: 'omission' | 'distortion' | 'addition' | 'ok';
    severity: 'high' | 'medium' | 'low';
    description: string;
}

interface FidelityReport {
    verdict: 'Fiel' | 'Aceptable' | 'Problemático';
    summary: string;
    issues: FidelityIssue[];
    fidelityScore: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.5-pro';              // mismo modelo que la app para máxima calidad
const GEMINI_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isWord(mimeType: string, filename: string): boolean {
    return (
        mimeType.includes('word') ||
        mimeType.includes('officedocument.wordprocessingml') ||
        mimeType.includes('msword') ||
        /\.(doc|docx)$/i.test(filename)
    );
}

function isPdf(mimeType: string): boolean {
    return mimeType.includes('pdf');
}

async function extractWordText(base64Data: string): Promise<string | null> {
    try {
        // Node.js server: Buffer.from handles base64 WITH line breaks (from Apps Script).
        // Unlike atob(), Buffer.from ignores whitespace/newlines in base64 — critical here.
        // mammoth on Node.js expects { buffer: Buffer }, not { arrayBuffer }.
        const buf = Buffer.from(base64Data, 'base64');
        const result = await mammoth.extractRawText({ buffer: buf });
        const text = result.value?.trim() || null;
        console.log(`[email-webhook] mammoth extracted ${text?.length ?? 0} chars`);
        return text;
    } catch (err: any) {
        console.error('[email-webhook] mammoth extraction failed:', err.message);
        return null;
    }
}

// ─── Helpers para limpiar el cuerpo del email ────────────────────────────────

/**
 * Strips email forwarding headers (De:, Para:, Fecha:, Asunto:, ----...)
 * and returns only the actual press release body text.
 */
function cleanEmailBody(raw: string): string {
    // Remove common forwarding separator lines
    const separatorPattern = /(-{3,}.*?(mensaje original|forwarded message|original message).*?-{3,})/gi;
    let cleaned = raw.replace(separatorPattern, '\n');

    // Remove email header fields at the start of forwarded blocks
    cleaned = cleaned.replace(/^(De|From|Para|To|Fecha|Date|Enviado|Sent|Asunto|Subject|CC|BCC)\s*:.*$/gim, '');

    // Collapse multiple blank lines into at most two
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
}

// ─── Gemini Call 1: Nota de Prensa ───────────────────────────────────────────
// Prompt is IDENTICAL to processPressRelease in geminiService.ts

const PRESS_RELEASE_INSTRUCTION = `
Eres el Redactor Jefe de la Agencia de noticias Servimedia. Tu misión es transformar el material adjunto en un TELETIPO DE AGENCIA PERFECTO, siguiendo con absoluta precisión las normas del periodismo de agencia en español.

NORMAS DE REDACCIÓN OBLIGATORIAS — aplícalas todas sin excepción:

ORTOGRAFÍA Y PUNTUACIÓN
- Ortografía impecable, sin faltas ni tildes olvidadas.
- Usa siempre los signos de puntuación correctamente.
- Los prefijos se escriben unidos a la palabra: "exministro", "expresidente". Solo se separan si afectan a dos palabras: "ex secretario general".
- Cuando introduzcas las siglas de una organización, escribe primero el nombre completo y después las siglas entre paréntesis. Excepción: siglas muy conocidas (PP, CCOO, UGT).

MAYÚSCULAS Y MINÚSCULAS
- Nombres propios de instituciones, en mayúsculas: Guardia Civil, Policía Nacional, Ministerio de Educación.
- Cargos de personas, en minúscula: ministro, director, portavoz.
- Gentilicios y adjetivos, en minúscula: español, brasileño, europeo.
- Meses y días de la semana, siempre en minúscula: octubre, lunes.

PERSONA Y VOZ
- Prohibido el uso de primera persona. Nunca: "no sabemos", "nos confirma", "nuestro país".
- No uses la voz pasiva refleja ("se conoce", "se desconoce", "se ha podido acreditar", "se trataba"). Invierte la oración o añade un sujeto explícito.
- Evita los verbos reflexivos al inicio de oración, titular o entradilla.

TIEMPOS VERBALES
- TITULAR y SUBTÍTULO: verbo en PRESENTE ("El Gobierno aprueba...", "El presidente anuncia..."). Esto transmite inmediatez.
- ENTRADILLA y CUERPO: verbo en PASADO. Usa preferentemente el pretérito perfecto simple ("dijo", "anunció", "presentó"), propio de la prensa escrita de agencia.
- NUNCA uses el presente en el cuerpo del texto fuera del titular/subtítulo.

ESTRUCTURA DEL TITULAR
- Debe contener un verbo conjugado en presente.
- Debe ser claro, directo y factual. Sin sensacionalismo.

ENTRADILLA (LEAD)
- Empieza siempre con el SUJETO. Nunca empieces con complemento circunstancial de tiempo, modo u otro.
- Nunca empieces con "Ayer", "Hoy", "El pasado…", "En la tarde de…".
- Recoge quién, qué, cuándo, dónde y por qué en pocas oraciones.

CUERPO DEL TELETIPO
- Oraciones cortas y sencillas. Evita subordinadas largas y complejas.
- Sujeto y verbo principal NUNCA separados por coma.
- Evita los gerundios. Solo son correctos en tiempos continuos ("estaba hablando").
- Al mencionar el tiempo, usa la forma más breve posible: "ayer", nunca "ayer 12 de octubre" ni "el pasado 12 de octubre".
- Máximo ~500 palabras en el cuerpo.

CITAS Y DECLARACIONES
- Un cargo es aposición explicativa (entre comas) cuando corresponde a una única persona.
  BIEN: "El ministro del Interior, Juan Ignacio Zoido, dijo..."
- No lleva comas cuando el cargo lo tienen varias personas.
  BIEN: "El exministro del Interior Jorge Fernández Díaz dijo..."
- NUNCA mezcles estilo directo e indirecto en la misma oración. Elige uno u otro.
  MAL: "Se ha mostrado crítico con frases como 'nuestra abstención le permitirá gobernar'"
  BIEN: "Se ha mostrado muy crítico. Ha asegurado que la abstención 'permitirá gobernar', pero ha advertido de que no implica 'un acuerdo'"

DEBES DEVOLVER UN JSON VÁLIDO CON LOS SIGUIENTES CAMPOS:
1. antetitulo: El antetítulo (3-6 palabras, sin verbo, enmarca el tema: "Economía", "Política exterior", "Acuerdo laboral"…).
2. headline: El titular (verbo en presente, claro y factual).
3. subtitulo: El subtítulo (complementa el titular con un dato clave, verbo en presente, máx 20 palabras).
4. lead: La entradilla (empieza por sujeto, pasado, responde a las 5W).
5. body: El cuerpo del teletipo (pasado, oraciones breves, máx ~500 palabras).
6. originalText: Transcripción limpia y completa del texto original proporcionado.
`;

async function generatePressRelease(ai: GoogleGenAI, contentParts: any[]): Promise<PressReleaseResult> {
    const parts = [...contentParts, { text: PRESS_RELEASE_INSTRUCTION }];
    const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    antetitulo: { type: Type.STRING },
                    headline: { type: Type.STRING },
                    subtitulo: { type: Type.STRING },
                    lead: { type: Type.STRING },
                    body: { type: Type.STRING },
                    originalText: { type: Type.STRING },
                },
                required: ['antetitulo', 'headline', 'subtitulo', 'lead', 'body', 'originalText'],
            },
        },
    });
    console.log(`[tokens:press-release] in=${response.usageMetadata?.promptTokenCount} out=${response.usageMetadata?.candidatesTokenCount}`);
    const p = JSON.parse(response.text || '{}');
    return {
        antetitulo: p.antetitulo || '',
        headline: p.headline || '',
        subtitulo: p.subtitulo || '',
        lead: p.lead || '',
        body: p.body || '',
        originalText: p.originalText || '',
    };
}

// ─── Gemini Call 2: Informe de Fidelidad ─────────────────────────────────────

async function generateFidelityReport(
    ai: GoogleGenAI,
    originalText: string,
    nota: PressReleaseResult
): Promise<FidelityReport> {
    const notaFormatted = [
        `ANTETÍTULO: ${nota.antetitulo}`,
        `TITULAR: ${nota.headline}`,
        `SUBTÍTULO: ${nota.subtitulo}`,
        `ENTRADILLA: ${nota.lead}`,
        `CUERPO:\n${nota.body}`,
    ].join('\n\n');

    const prompt = `Eres un editor de calidad periodística de la agencia Servimedia. Compara el texto original con la nota de agencia generada por IA y evalúa la fidelidad informativa.

TEXTO ORIGINAL:
---
${originalText}
---

NOTA DE AGENCIA GENERADA:
---
${notaFormatted}
---

Detecta:
1. OMISIONES: datos, cifras, declaraciones relevantes presentes en el original pero ausentes en la nota.
2. DISTORSIONES: información presente en ambos textos pero con significado alterado, cifras cambiadas o contexto que modifica el sentido.
3. ADICIONES: información que aparece en la nota pero NO está en el original (inventada o extrapolada incorrectamente).
4. CORRECTOS: elementos bien trasladados del original a la nota.

Para cada issue: type (omission|distortion|addition|ok), severity (high|medium|low), description (explicación concreta).

fidelityScore 0-100: 90-100 sin errores, 70-89 aceptable, 50-69 problemático, 0-49 inutilizable.
verdict: "Fiel" si score≥85, "Aceptable" si 60-84, "Problemático" si <60.

Devuelve exclusivamente JSON válido.`;

    const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    verdict: { type: Type.STRING, enum: ['Fiel', 'Aceptable', 'Problemático'] },
                    summary: { type: Type.STRING },
                    issues: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING, enum: ['omission', 'distortion', 'addition', 'ok'] },
                                severity: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                                description: { type: Type.STRING },
                            },
                            required: ['type', 'severity', 'description'],
                        },
                    },
                    fidelityScore: { type: Type.NUMBER },
                },
                required: ['verdict', 'summary', 'issues', 'fidelityScore'],
            },
        },
    });
    console.log(`[tokens:fidelity] in=${response.usageMetadata?.promptTokenCount} out=${response.usageMetadata?.candidatesTokenCount}`);
    return JSON.parse(response.text || '{}') as FidelityReport;
}

// ─── Shared Processing Logic (also used by gmail-pubsub.ts) ──────────────────

async function processEmailContent(payload: EmailWebhookPayload): Promise<ProcessEmailResult> {
    const gcpProject = process.env.GOOGLE_CLOUD_PROJECT;
    const gcpCredentialsBase64 = process.env.GCP_SERVICE_ACCOUNT_JSON_BASE64;
    if (!gcpProject || !gcpCredentialsBase64) {
        throw new Error('Missing GOOGLE_CLOUD_PROJECT or GCP_SERVICE_ACCOUNT_JSON_BASE64 env vars');
    }

    const credentials = JSON.parse(
        Buffer.from(gcpCredentialsBase64, 'base64').toString('utf-8')
    );
    const ai = new GoogleGenAI({
        vertexai: true,
        project: gcpProject,
        location: GEMINI_LOCATION,
        googleAuthOptions: { credentials },
    });

    // ── Build Gemini content parts ────────────────────────────────────────────
    let contentParts: any[] = [];
    let contentSource = 'cuerpo del email';
    const attachmentCount = payload.attachments?.length ?? 0;
    console.log(`[email-webhook] Attachments received: ${attachmentCount}`);

    if (attachmentCount > 0) {
        // Find the first PDF or Word attachment, skipping inline images
        const att = payload.attachments!.find(a =>
            isPdf(a.mimeType) ||
            isWord(a.mimeType, a.filename) ||
            a.filename.match(/\.(doc|docx|pdf)$/i)
        ) ?? payload.attachments![0];
        console.log(`[email-webhook] Processing attachment: ${att.filename} (${att.mimeType})`);
        contentSource = att.filename;

        if (isWord(att.mimeType, att.filename)) {
            const text = await extractWordText(att.base64Data);
            if (text) {
                contentParts.push({ text: `TEXTO WORD EXTRAÍDO:\n${text}` });
            } else {
                console.warn('[email-webhook] mammoth returned empty — sending as inlineData');
                contentParts.push({ inlineData: { mimeType: att.mimeType, data: att.base64Data } });
            }
        } else if (isPdf(att.mimeType)) {
            contentParts.push({ inlineData: { mimeType: 'application/pdf', data: att.base64Data } });
        } else if (att.filename.match(/\.(doc|docx|pdf)$/i)) {
            if (att.filename.match(/\.(doc|docx)$/i)) {
                const text = await extractWordText(att.base64Data);
                if (text) {
                    contentParts.push({ text: `TEXTO WORD EXTRAÍDO:\n${text}` });
                } else {
                    contentParts.push({ inlineData: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: att.base64Data } });
                }
            } else {
                contentParts.push({ inlineData: { mimeType: 'application/pdf', data: att.base64Data } });
            }
        } else {
            contentSource = 'cuerpo del email (adjunto no reconocido)';
            const cleanBody = cleanEmailBody(payload.body);
            console.warn(`[email-webhook] Unrecognised attachment type ${att.mimeType} — falling back to body`);
            contentParts.push({ text: `TEXTO NOTA DE PRENSA:\n${cleanBody}` });
        }
    } else {
        const cleanBody = cleanEmailBody(payload.body);
        console.log(`[email-webhook] No attachment. Cleaned body: ${cleanBody.length} chars`);
        contentParts.push({ text: `TEXTO NOTA DE PRENSA:\n${cleanBody}` });
    }

    // ── Call 1: generate press release ───────────────────────────────────────
    console.log('[email-webhook] Generating nota de prensa...');
    const pressRelease = await generatePressRelease(ai, contentParts);

    // ── Call 2: fidelity report ───────────────────────────────────────────────
    console.log('[email-webhook] Generating fidelity report...');
    const originalForFidelity = pressRelease.originalText || payload.body;
    const fidelity = await generateFidelityReport(ai, originalForFidelity, pressRelease);

    console.log(`[email-webhook] Done. Verdict: ${fidelity.verdict} (${fidelity.fidelityScore}/100)`);

    return { ok: true, pressRelease, fidelity, contentSource };
}

// ─── HTTP Handler (called by Apps Script / manual webhook) ────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const payload = req.body as EmailWebhookPayload;
    const expectedSecret = process.env.EMAIL_WEBHOOK_SECRET;
    if (!expectedSecret || payload?.secret !== expectedSecret) {
        console.warn('[email-webhook] Unauthorized request');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!payload.subject || typeof payload.body !== 'string') {
        return res.status(400).json({ error: 'Missing subject or body' });
    }

    try {
        const result = await processEmailContent(payload);
        return res.status(200).json(result);
    } catch (err: any) {
        console.error('[email-webhook] Error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
}
