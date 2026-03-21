/*
 * Copyright (c) 2026 Javier Aldea
 * Todos los derechos reservados.
 * Este software es propiedad de Javier Aldea y solo es utilizable por Servimedia.
 * Queda prohibida su reproducción, distribución o uso sin autorización expresa.
 */
﻿
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AnalysisResult, PressReleaseResult, TopicDetail, TranscriptionSegment } from "../types";
import mammoth from "mammoth";
import { supabase } from "./supabase";
import { GEMINI_2_5_PRO_PRICING, GEMINI_2_5_FLASH_PRICING } from '../utils/costCalculator';
import { addTokenEntry } from '../utils/tokenStore';

// In-memory cache: avoids hitting /api/gemini-key on every call
let cachedKey: string | null = null;
let cacheExpiry = 0;

// Fetches the Gemini API key from the serverless proxy, authenticated via Supabase JWT.
// Falls back to localStorage for local development without the Vercel function available.
const getApiKey = async (): Promise<string> => {
  const now = Date.now();

  // Return cached key if still valid (5 minutes)
  if (cachedKey && now < cacheExpiry) return cachedKey;

  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      const response = await fetch('/api/gemini-key', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        const { key } = await response.json();
        cachedKey = key;
        cacheExpiry = now + 5 * 60 * 1000; // cache for 5 minutes
        return key;
      }
    }
  } catch (err) {
    console.warn('[geminiService] Could not fetch key from server, using localStorage fallback:', err);
  }

  // Local dev fallback: key stored in localStorage by the admin panel
  const storedKey = localStorage.getItem('GEMINI_API_KEY');
  if (storedKey) return storedKey;

  return ''; // Return empty instead of throwing to avoid blank page
};

// Helper to get AI instance (async now because getApiKey is async)
const getAI = async () => {
  return new GoogleGenAI({ apiKey: await getApiKey() });
};

// --- UTILS ---
const normalizeMimeType = (mimeType: string): string => {
  if (mimeType.includes('quicktime')) return 'video/quicktime';
  if (mimeType.includes('mp4')) return 'video/mp4';
  if (mimeType.includes('wav')) return 'audio/wav';
  if (mimeType.includes('mpeg')) return 'audio/mpeg';
  return mimeType;
};

const DEFAULT_MODELS = {
  PRO: "gemini-2.5-pro",
  FLASH: "gemini-2.5-flash"
};

// ─── Token Usage Logger ─────────────────────────────────────────────────────
// Reads usageMetadata (free on every Gemini response), calculates the real cost
// in EUR using the billing-account pricing tables, and persists the entry to
// tokenStore so the Admin Panel can display it in real time.

// Operations that use Gemini 2.5 Pro
const PRO_OPERATIONS = new Set([
  'processAudio', 'processPressRelease', 'verifyManualSelection',
]);
// Operations where input tokens are audio (Pro audio pricing)
const AUDIO_INPUT_OPERATIONS = new Set(['processAudio']);

const logTokenUsage = (operation: string, response: any): void => {
  const meta = response.usageMetadata;
  if (!meta) return;

  const input = meta.promptTokenCount ?? 0;
  const output = meta.candidatesTokenCount ?? 0;
  const total = meta.totalTokenCount ?? 0;

  console.log(`[tokens:${operation}] entrada=${input} | salida=${output} | total=${total}`);

  // Calculate real cost in EUR
  const isPro = PRO_OPERATIONS.has(operation);
  const isAudio = AUDIO_INPUT_OPERATIONS.has(operation);
  const pricing = isPro ? GEMINI_2_5_PRO_PRICING.paid : GEMINI_2_5_FLASH_PRICING.paid;
  const inputPrice = (isAudio && pricing.audioInputPrice) ? pricing.audioInputPrice : pricing.inputPrice;

  const costEUR =
    (input / 1_000_000) * inputPrice +
    (output / 1_000_000) * pricing.outputPrice;

  addTokenEntry({ operation, inputTokens: input, outputTokens: output, totalTokens: total, costEUR });
};

async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    console.error("Error en operación Gemini:", error);
    const isRetryable = error.message?.includes("500") || error.message?.includes("503") || error.status === 500 || error.message?.includes("quota");
    if (retries > 0 && isRetryable) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryOperation(operation, retries - 1, delay * 2);
    }
    // Translate error to Spanish before throwing
    throw new Error(translateGeminiError(error));
  }
}

// Translates Gemini API errors to friendly Spanish messages
function translateGeminiError(error: any): string {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('429')) {
    return 'Se ha agotado la cuota de la API de Gemini. Espera unos minutos e inténtalo de nuevo, o contacta con el administrador.';
  }
  if (msg.includes('api key') || msg.includes('api_key') || msg.includes('401') || msg.includes('403') || msg.includes('permission')) {
    return 'La clave de API de Gemini no es válida o no tiene permisos. Contacta con el administrador.';
  }
  if (msg.includes('500') || msg.includes('internal')) {
    return 'Error interno del servidor de Gemini. Se ha reintentado automáticamente. Por favor, inténtalo de nuevo.';
  }
  if (msg.includes('503') || msg.includes('unavailable') || msg.includes('overloaded')) {
    return 'El servicio de Gemini está temporalmente saturado. Inténtalo de nuevo en unos minutos.';
  }
  if (msg.includes('timeout') || msg.includes('deadline')) {
    return 'La operación ha tardado demasiado. El archivo puede ser demasiado largo. Inténtalo con un fragmento más corto.';
  }
  if (msg.includes('file too large') || msg.includes('too large')) {
    return 'El archivo es demasiado grande para procesarlo. Utiliza un archivo de menos de 100MB.';
  }
  if (msg.includes('json') || msg.includes('parse')) {
    return 'Error al procesar la respuesta de la IA. Inténtalo de nuevo.';
  }
  return `Error al procesar con Gemini: ${error.message || 'Error desconocido'}. Inténtalo de nuevo.`;
}


// --- AUDIO/VIDEO PROCESSING ---
const processAudio = async (base64Audio: string, mimeType: string): Promise<AnalysisResult> => {
  const normalizedMimeType = normalizeMimeType(mimeType);

  const operation = async () => {
    const response = await (await getAI()).models.generateContent({
      model: DEFAULT_MODELS.PRO,
      contents: {
        parts: [
          { inlineData: { mimeType: normalizedMimeType, data: base64Audio } },
          {
            text: `ERES UN TRANSCRIPTOR PERIODÍSTICO EXPERTO DE ÉLITE PARA SERVIMEDIA. 
          
          INSTRUCCIONES CRÍTICAS DE TRANSCRIPCIÓN:
          1. TRANSCRIPCIÓN ÍNTEGRA: Escribe PALABRA POR PALABRA todo el audio. No resumas.
          2. FORMATO: Identifica tiempos (MM:SS).
          
          INSTRUCCIONES DE ANÁLISIS (Diferenciación de Contenido):
          3. TEMAS CLAVE: Define de qué ha hablado el sujeto. No des una lista de palabras sueltas. Crea un objeto para cada tema con un 'name' (Título corto del tema) y una 'description' (Resumen de 1-2 frases de qué ha dicho exactamente sobre ese tema).
          4. VERIFICACIÓN: Analiza inconsistencias en los datos citados.
          5. PERIODISMO: Genera titulares e hilos de RRSS con contexto.
          
          DEBES DEVOLVER UN JSON VÁLIDO CON LA ESTRUCTURA SCHEMA DEFINIDA.` },
        ],
      },
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING },
                  text: { type: Type.STRING }
                },
                required: ["timestamp", "text"]
              }
            },
            factChecks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  claim: { type: Type.STRING },
                  verdict: { type: Type.STRING, enum: ['Verdadero', 'Falso', 'Engañoso', 'Inconsistente', 'Dudoso'] },
                  explanation: { type: Type.STRING }
                },
                required: ["claim", "verdict", "explanation"]
              }
            },
            topics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["name", "description"]
              }
            },
            suggestedHeadlines: { type: Type.ARRAY, items: { type: Type.STRING } },
            socialThreads: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["transcription", "factChecks", "topics", "suggestedHeadlines", "socialThreads"]
        }
      }
    });

    const text = response.text;
    logTokenUsage('processAudio', response);
    if (!text) throw new Error("La IA no devolvió contenido.");
    return JSON.parse(text) as AnalysisResult;
  };
  return await retryOperation(operation);
};


// --- GENERIC CHAT (WRITING ASSISTANT) ---
const genericChat = async (history: { role: string, text: string }[], message: string) => {
  const response = await (await getAI()).models.generateContent({
    model: DEFAULT_MODELS.FLASH,
    contents: [
      ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] }
    ],
    config: {
      temperature: 0.1,
      systemInstruction: `Eres un corrector de textos y asistente de redacción experto para la Agencia Servimedia. Tu objetivo principal es ayudar a los redactores a pulir sus textos, garantizando la máxima calidad lingüística.

NORMAS ABSOLUTAS:
1. ORTOGRAFÍA Y GRAMÁTICA: Corrige proactivamente todos los errores de ortografía, acentuación, puntuación y gramática aplicando estrictamente la normativa de la Real Academia Española (RAE).
2. RESPETO AL ESTILO ORIGINAL: Conserva el tono, el vocabulario y la estructura original del autor en la medida de lo posible, realizando únicamente los cambios necesarios para garantizar la corrección lingüística y la fluidez.
3. INSTRUCCIONES ESPECÍFICAS: Si el usuario te pide una tarea específica (ej: "resume esto", "cambia el tono", "corrige solo la ortografía"), prioriza esa instrucción manteniendo siempre la corrección ortotipográfica.

FORMATO DE RESPUESTA:
- Devuelve SIEMPRE el texto COMPLETO con los cambios aplicados.
- Usa la etiqueta <u>palabra</u> para envolver CADA palabra o frase que hayas modificado o corregido, de forma que el redactor pueda identificar los cambios fácilmente.
- NO uses asteriscos (* o **) ni negritas (<b>) para marcar los cambios, usa EXCLUSIVAMENTE <u>.
- Al final de tu respuesta, añade siempre una breve sección titulada "💡 Sugerencias Fundéu:" (si aplica al texto), donde ofrezcas 1 o 2 recomendaciones de estilo, precisión léxica o uso normativo basadas en las directrices de la Fundación del Español Urgente (Fundéu) que sean relevantes para el texto analizado.`
    }
  });
  logTokenUsage('genericChat', response);
  return response.text;
};

// --- CHAT WITH MULTIPLE DOCUMENTS (NOTEBOOK LM MODE) ---
const chatWithDocuments = async (
  history: { role: string, text: string }[],
  message: string,
  sources: { name: string, base64: string, mimeType: string }[]
) => {
  const contentParts: any[] = [];

  // System context for documents
  contentParts.push({ text: "CONTEXTO DOCUMENTAL ADJUNTO PARA LA CONSULTA:" });

  for (const src of sources) {
    if (src.mimeType.includes('word') || src.mimeType.includes('officedocument')) {
      try {
        const arrayBuffer = Uint8Array.from(atob(src.base64), c => c.charCodeAt(0)).buffer;
        const res = await mammoth.extractRawText({ arrayBuffer });
        contentParts.push({ text: `CONTENIDO DE "${src.name}":\n${res.value}` });
      } catch (e) {
        contentParts.push({ inlineData: { mimeType: src.mimeType, data: src.base64 } });
      }
    } else {
      contentParts.push({ inlineData: { mimeType: src.mimeType, data: src.base64 } });
    }
  }

  contentParts.push({ text: `MENSAJE DEL USUARIO: ${message}` });

  const response = await (await getAI()).models.generateContent({
    model: DEFAULT_MODELS.FLASH,
    contents: [
      ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
      { role: 'user', parts: contentParts }
    ],
    config: {
      temperature: 0.5,
      systemInstruction: "Eres un asistente de investigación estilo Notebook LM para Servimedia. Tu misión es responder preguntas basándote en los documentos proporcionados.\n\nNORMAS ABSOLUTAS:\n1. BASARSE EN DOCUMENTOS: Si la respuesta no está en los documentos, indícalo, pero intenta ser lo más útil posible relacionando conceptos si es pertinente. Cita nombres de archivos si mencionas datos específicos.\n2. ORTOGRAFÍA Y GRAMÁTICA: Si el usuario te pide que corrijas un texto o su consulta implica redacción, corrige proactivamente todos los errores aplicando estrictamente la normativa de la Real Academia Española (RAE).\n\nFORMATO DE RESPUESTA:\n- REGLA DE FORMATO CRÍTICA: No uses asteriscos (* o **) ni negritas (<b>) para enfatizar o marcar cambios. Usa EXCLUSIVAMENTE etiquetas <u> para subrayado directamente.\n- Al final de tu respuesta, añade siempre una breve sección titulada \"💡 Sugerencias Fundéu:\" (si aplica al texto o contexto), donde ofrezcas 1 o 2 recomendaciones de estilo o uso normativo basadas en la Fundación del Español Urgente (Fundéu)."
    }
  });
  logTokenUsage('chatWithDocuments', response);
  return response.text;
};

// --- CHAT WITH SOURCE ---
const chatWithSource = async (history: { role: string, text: string }[], transcript: string, userQuestion: string) => {
  const response = await (await getAI()).models.generateContent({
    model: DEFAULT_MODELS.FLASH,
    contents: [
      { role: 'user', parts: [{ text: `CONTEXTO (Transcripción íntegra de la entrevista):\n${transcript}` }] },
      ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: userQuestion }] }
    ],
    config: {
      temperature: 0.7,
      systemInstruction: "Eres un asistente para periodistas de Servimedia. Responde preguntas basándote únicamente en la transcripción proporcionada. Sé conciso y cita frases textuales."
    }
  });
  logTokenUsage('chatWithSource', response);
  return response.text;
};

// --- PRESS RELEASE PROCESSING ---
const processPressRelease = async (
  base64Data: string,
  mimeType: string,
  userAngle?: string
): Promise<PressReleaseResult> => {
  const instructionText = `
Eres el Redactor Jefe de la Agencia de noticias Servimedia. Tu misión es transformar el material adjunto en un TELETIPO DE AGENCIA PERFECTO, siguiendo con absoluta precisión las normas del periodismo de agencia en español.

IDIOMA DE SALIDA: Redacta el teletipo SIEMPRE en castellano, independientemente del idioma del documento fuente (inglés, francés, catalán, gallego, euskera, etc.). El original puede estar en cualquier lengua — la nota de agencia siempre se produce en español.

FIDELIDAD A LA FUENTE — NORMA ABSOLUTA E INAMOVIBLE:
- Usa ÚNICAMENTE la información contenida en el documento proporcionado. Nada más.
- PROHIBIDO inventar, suponer, completar o enriquecer con datos de tu conocimiento previo: ni cifras, ni fechas, ni nombres, ni cargos, ni declaraciones, ni contexto externo.
- Si un dato no aparece explícitamente en el documento fuente, NO lo incluyas en el teletipo.
- Las citas textuales deben reproducir exactamente lo que dice el documento. Nunca atribuyas declaraciones que no estén en el texto original.
- Si el documento fuente es escaso en información, el teletipo será más corto. Es preferible un teletipo breve y fiel a uno largo con datos inventados.

${userAngle ? `ÁNGULO EDITORIAL REQUERIDO: ${userAngle}\n` : ''}
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

TIEMPOS VERBALES — ANALIZA LA TEMPORALIDAD ANTES DE REDACTAR:
PASO 1 — Determina si el documento es una NOTA DE AGENDA (anuncia un evento futuro: estreno, presentación, congreso, jornada, entrega de premios...) o una CRÓNICA/NOTICIA (relata algo ya ocurrido).

Si es NOTA DE AGENDA (evento aún no celebrado):
- TITULAR y SUBTÍTULO: verbo en PRESENTE ("Mercedes de Córdoba estrena...", "El Gobierno presenta...").
- ENTRADILLA: anuncia el evento con pasado periodístico o presente.
- CUERPO — descripción del evento (contenido, propuesta, participantes, características): PRESENTE ("el espectáculo utiliza...", "la propuesta parte de...", "en el escenario la acompañan...").
- CUERPO — actos que aún no han ocurrido: FUTURO ("se celebrará un coloquio...").
- CUERPO — datos biográficos o hechos ya consumados en el pasado: PASADO ("recibió en 2013 el Premio Nacional...").

Si es CRÓNICA/NOTICIA (evento ya ocurrido):
- TITULAR y SUBTÍTULO: verbo en PRESENTE.
- ENTRADILLA y CUERPO: verbo en PASADO. Usa preferentemente el pretérito perfecto simple ("dijo", "anunció", "presentó"), propio de la prensa escrita de agencia.
- ESTILO INDIRECTO — REALIDAD VIGENTE: cuando en una subordinada se describe una situación que SIGUE SIENDO VERDAD en el momento de escribir, usa PRESENTE aunque el verbo principal sea pasado.
  BIEN: "explicó que lleva años reclamando..." (sigue reclamando hoy)
  BIEN: "insistió en que el recinto debe tener las condiciones..." (sigue siendo necesario)
  BIEN: "afirmó que la seguridad es lo primero" (principio permanente)
  MAL:  "explicó que llevaba años reclamando..." (implica que ya no reclama)
  MAL:  "insistió en que el recinto debía tener..." (implica que ya no es necesario)
  REGLA: pregúntate si la acción subordinada es todavía cierta HOY. Si lo es → PRESENTE. Si solo fue cierta en el pasado → PASADO.

NUNCA uses verbos en pasado para describir las características o el contenido de un evento que todavía no ha tenido lugar.

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
2. headline: El titular PRINCIPAL — versión 1 (verbo en presente, claro y factual).
3. subtitulo: El subtítulo (complementa el titular con un dato clave, verbo en presente, máx 20 palabras).
4. lead: La entradilla PRINCIPAL — versión 1 (empieza por sujeto, pasado, responde a las 5W).
5. body: El cuerpo del teletipo (pasado, oraciones breves, máx ~500 palabras).
6. originalText: Transcripción limpia y completa del texto original proporcionado.
7. alternatives: Array con exactamente 2 versiones alternativas del titular y la entradilla.
   - Versión 2: mismo hecho, distinta estructura sintáctica o ángulo de enfoque del titular.
   - Versión 3: mismo hecho, distinto protagonista o dato clave destacado en el titular.
   Cada objeto contiene: "headline" (verbo en presente) y "lead" (empieza por sujeto, en pasado).
   Las tres versiones deben ser claramente distintas entre sí.
  `;

  return await retryOperation(async () => {
    let contentParts: any[] = [];
    let sourceTextForDisplay: string = ""; // Variable para almacenar el texto que se mostrará como originalText

    if (mimeType.includes('word') || mimeType.includes('officedocument')) {
      try {
        const arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (result.value && result.value.trim().length > 0) {
          sourceTextForDisplay = result.value;
          contentParts.push({ text: `TEXTO WORD EXTRAÍDO:\n${result.value}` });
        } else {
          console.warn("Mammoth devolvió texto vacío para el documento Word. Se enviará como inlineData de respaldo.");
          sourceTextForDisplay = "Documento Word (procesado como binario, extracción de texto fallida)"; // Placeholder
          contentParts.push({ inlineData: { mimeType, data: base64Data } });
        }
      } catch (error) {
        console.error("Error al extraer texto con Mammoth, recurriendo a inlineData:", error);
        sourceTextForDisplay = "Documento Word (procesado como binario, error de extracción)"; // Placeholder en caso de error
        contentParts.push({ inlineData: { mimeType, data: base64Data } });
      }
    } else {
      // Para PDF y otros tipos de documentos soportados, se envía como inlineData
      // Gemini a menudo puede extraer texto de PDFs de forma nativa.
      sourceTextForDisplay = "Documento (PDF/Otro - procesado como binario)"; // Placeholder para visualización
      contentParts.push({ inlineData: { mimeType, data: base64Data } });
    }
    contentParts.push({ text: instructionText });

    const response = await (await getAI()).models.generateContent({
      model: DEFAULT_MODELS.PRO,
      contents: { parts: contentParts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            antetitulo: { type: Type.STRING },
            headline: { type: Type.STRING },
            subtitulo: { type: Type.STRING },
            lead: { type: Type.STRING },
            body: { type: Type.STRING },
            originalText: { type: Type.STRING },
            alternatives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  lead: { type: Type.STRING },
                },
                required: ["headline", "lead"],
              },
            },
          },
          required: ["antetitulo", "headline", "subtitulo", "lead", "body", "originalText", "alternatives"],
        },
        temperature: 0.3,
      },
    });
    logTokenUsage('processPressRelease', response);
    const parsedResult = JSON.parse(response.text || "{}");
    const result: PressReleaseResult = {
      antetitulo: parsedResult.antetitulo || "",
      headline: parsedResult.headline || "",
      subtitulo: parsedResult.subtitulo || "",
      lead: parsedResult.lead || "",
      body: parsedResult.body || "",
      originalText: parsedResult.originalText || sourceTextForDisplay,
      userAngle: userAngle,
      alternatives: parsedResult.alternatives || [],
    };
    return result;
  });
};

// --- MANUAL VERIFICATION ---
const verifyManualSelection = async (text: string): Promise<any> => {
  const operation = async () => {
    console.log(`[Gemini] Requesting manual verification for: "${text.substring(0, 50)}..."`);
    try {
      const response = await (await getAI()).models.generateContent({
        model: DEFAULT_MODELS.PRO,
        contents: {
          parts: [
            {
              text: `ERES UN VERIFICADOR DE DATOS (FACT-CHECKER) EXPERTO PARA SERVIMEDIA.
            
            TU TAREA: Analizar el siguiente fragmento de texto y verificar si las afirmaciones, cifras o datos citados son veraces, falsos o dudosos. 
            
            IMPORTANTE: Tienes acceso a GOOGLE SEARCH. Úsalo para buscar fuentes fiables, noticias recientes y datos oficiales que respalden o desmientan la afirmación.
            
            TEXTO A VERIFICAR: "${text}"
            
            INSTRUCCIONES:
            1. Identifica la afirmación principal.
            2. Usa búsqueda en tiempo real para contrastar el dato con GOOGLE SEARCH.
            3. Determina un veredicto: 'Verdadero', 'Falso', 'Engañoso', 'Inconsistente', 'Dudoso'.
            4. Proporciona una explicación breve y profesional.
            5. EXTRAE LOS ENLACES (URLs) de las fuentes que has consultado.
            
            FORMATO DE SALIDA OBLIGATORIO (JSON PURO, SIN MARKDOWN):
            {
              "claim": "string",
              "verdict": "Verdadero" | "Falso" | "Engañoso" | "Inconsistente" | "Dudoso",
              "explanation": "string",
              "sources": [
                { "title": "string", "url": "string" }
              ]
            }` },
          ],
        },
        config: {
          temperature: 0.1,
          tools: [{ googleSearch: {} }]
        }
      });

      let resultText = response.text;
      logTokenUsage('verifyManualSelection', response);
      if (!resultText) throw new Error("La IA no devolvió contenido.");

      console.log("[Gemini] Raw verification response:", resultText);

      // Clean markdown if present
      if (resultText.includes('```')) {
        resultText = resultText.replace(/```json\n?|```/g, '').trim();
      }

      return JSON.parse(resultText);
    } catch (err) {
      console.error("[Gemini] Verification failed:", err);
      throw err;
    }
  };
  return await retryOperation(operation);
};

// --- SUGGEST HEADLINES FOR TOPIC ---
// Given a topic and full transcription, returns 3 alternative headlines with different angles
const suggestHeadlinesForTopic = async (
  topic: TopicDetail,
  transcription: TranscriptionSegment[]
): Promise<string[]> => {
  const transcriptionText = transcription.map(s => `[${s.timestamp}] ${s.text}`).join('\n');
  const response = await (await getAI()).models.generateContent({
    model: DEFAULT_MODELS.FLASH,
    contents: {
      parts: [{
        text: `Eres un editor jefe de la Agencia Servimedia. Basándote en el siguiente tema y transcripción, propón exactamente 3 titulares periodísticos con enfoques distintos.

TEMA: ${topic.name}
DESCRIPCIÓN DEL TEMA: ${topic.description}

TRANSCRIPCIÓN:
${transcriptionText}

NORMAS PARA LOS TITULARES:
- Verbo conjugado en PRESENTE (transmite inmediatez)
- Estilo teletipo de agencia: directo, factual, sin sensacionalismo
- Cada titular debe tener un enfoque distinto:
  1. FACTUAL: datos concretos y cifras del tema
  2. CONTEXTUAL: consecuencias o implicaciones del tema
  3. DE IMPACTO: el dato o declaración más llamativa del tema

Devuelve ÚNICAMENTE un JSON válido: { "headlines": ["titular1", "titular2", "titular3"] }`
      }]
    },
    config: {
      temperature: 0.4,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headlines: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["headlines"]
      }
    }
  });
  logTokenUsage('suggestHeadlinesForTopic', response);
  const parsed = JSON.parse(response.text || '{"headlines":[]}');
  return parsed.headlines || [];
};

// --- EXTRACT RELEVANT FRAGMENTS ---
// Given a full transcription and a custom headline, extracts only the fragments
// directly relevant to that headline, discarding unrelated topics.
const extractRelevantFragments = async (
  transcriptionText: string,
  headline: string
): Promise<string> => {
  const response = await (await getAI()).models.generateContent({
    model: DEFAULT_MODELS.FLASH,
    contents: {
      parts: [{
        text: `Eres un editor de la Agencia Servimedia. A partir de la transcripción siguiente, extrae ÚNICAMENTE los fragmentos necesarios para redactar un teletipo sobre este titular:

TITULAR: "${headline}"

INSTRUCCIONES:
1. Lee la transcripción completa con sus timestamps.
2. Selecciona SOLO los fragmentos que hablen directamente del tema del titular. Descarta todo lo que sea sobre otros asuntos.
3. Para cada fragmento, indica quién habla si puedes inferirlo (periodista, político, nombre, cargo). Usa el formato [HABLANTE: X] antes del fragmento. Si no puedes inferirlo, omite la indicación.
4. Mantén los timestamps originales tal como aparecen.
5. Si varios intervinientes hablan sobre el mismo tema, inclúyelos todos y diferéncialos.
6. No resumas ni parafrasees — copia el texto literal de cada fragmento seleccionado.

TRANSCRIPCIÓN COMPLETA:
${transcriptionText}

Devuelve únicamente los fragmentos seleccionados con sus timestamps. No añadas explicaciones ni comentarios.`
      }]
    },
    config: { temperature: 0.1 }
  });
  logTokenUsage('extractRelevantFragments', response);
  return response.text?.trim() || transcriptionText;
};

// --- GENERATE TELETIPO FROM TEXT ---
// Generates a full press release teletipo from transcription text + a pre-selected headline
const generateTeletipoFromText = async (
  transcriptionText: string,
  topicContext: string,
  selectedHeadline: string,
  speakerContext?: string
): Promise<PressReleaseResult> => {
  const instructionText = `Eres el Redactor Jefe de la Agencia de noticias Servimedia. Tu misión es redactar un TELETIPO DE AGENCIA PERFECTO a partir de la transcripción adjunta.

TITULAR OBLIGATORIO: Debes usar EXACTAMENTE este titular, sin modificarlo: "${selectedHeadline}"
${topicContext ? `TEMA A DESARROLLAR: ${topicContext}\n` : ''}${speakerContext ? `CONTEXTO DE LOS HABLANTES (úsalo para identificar quién declara cada cosa y mencionarlo correctamente con cargo y nombre completo):\n${speakerContext}\n` : ''}
NORMAS DE REDACCIÓN OBLIGATORIAS — aplícalas todas sin excepción:

ORTOGRAFÍA Y PUNTUACIÓN
- Ortografía impecable, sin faltas ni tildes olvidadas.
- Los prefijos se escriben unidos a la palabra: "exministro", "expresidente". Solo se separan si afectan a dos palabras: "ex secretario general".
- Cuando introduzcas las siglas de una organización, escribe primero el nombre completo y después las siglas entre paréntesis. Excepción: siglas muy conocidas (PP, CCOO, UGT).

MAYÚSCULAS Y MINÚSCULAS
- Nombres propios de instituciones, en mayúsculas: Guardia Civil, Policía Nacional, Ministerio de Educación.
- Cargos de personas, en minúscula: ministro, director, portavoz.
- Gentilicios y adjetivos, en minúscula: español, brasileño, europeo.
- Meses y días de la semana, siempre en minúscula.

PERSONA Y VOZ
- Prohibido el uso de primera persona. Nunca: "no sabemos", "nos confirma", "nuestro país".
- No uses la voz pasiva refleja ("se conoce", "se desconoce"). Invierte la oración o añade un sujeto explícito.

TIEMPOS VERBALES — ANALIZA LA TEMPORALIDAD ANTES DE REDACTAR:
Si es NOTA DE AGENDA (evento futuro): CUERPO en PRESENTE para describir el evento ("el espectáculo utiliza...", "la acompañan..."), FUTURO para actos pendientes ("se celebrará..."), PASADO solo para biografía/hechos consumados.
Si es CRÓNICA/NOTICIA (evento pasado): ENTRADILLA y CUERPO en PASADO, pretérito perfecto simple ("dijo", "anunció", "presentó"). ESTILO INDIRECTO — si la subordinada describe algo que sigue siendo cierto HOY, usa PRESENTE: "explicó que lleva años reclamando" (no "llevaba"), "insistió en que debe hacerse" (no "debía").
NUNCA uses verbos en pasado para describir un evento que todavía no ha tenido lugar.

ENTRADILLA (LEAD)
- Empieza siempre con el SUJETO. Nunca empieces con complemento circunstancial de tiempo.
- Nunca empieces con "Ayer", "Hoy", "El pasado…".
- Recoge quién, qué, cuándo, dónde y por qué en pocas oraciones.

CUERPO DEL TELETIPO
- Oraciones cortas y sencillas. Evita subordinadas largas y complejas.
- Sujeto y verbo principal NUNCA separados por coma.
- Evita los gerundios. Solo son correctos en tiempos continuos.
- Máximo ~500 palabras en el cuerpo.

DEBES DEVOLVER UN JSON VÁLIDO CON LOS SIGUIENTES CAMPOS:
1. antetitulo: El antetítulo (3-6 palabras, sin verbo, enmarca el tema).
2. headline: El titular EXACTO proporcionado arriba (no lo modifiques).
3. subtitulo: El subtítulo (complementa el titular con un dato clave, verbo en presente, máx 20 palabras).
4. lead: La entradilla (empieza por sujeto, pasado, responde a las 5W).
5. body: El cuerpo del teletipo (pasado, oraciones breves, máx ~500 palabras).
6. originalText: La transcripción completa proporcionada como fuente.`;

  return await retryOperation(async () => {
    const response = await (await getAI()).models.generateContent({
      model: DEFAULT_MODELS.FLASH,
      contents: {
        parts: [
          { text: `TRANSCRIPCIÓN FUENTE:\n${transcriptionText}` },
          { text: instructionText }
        ]
      },
      config: {
        responseMimeType: "application/json",
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
          required: ["antetitulo", "headline", "subtitulo", "lead", "body", "originalText"],
        },
        temperature: 0.1,
      },
    });
    logTokenUsage('generateTeletipoFromText', response);
    const parsed = JSON.parse(response.text || '{}');
    return {
      antetitulo: parsed.antetitulo || '',
      headline: parsed.headline || selectedHeadline,
      subtitulo: parsed.subtitulo || '',
      lead: parsed.lead || '',
      body: parsed.body || '',
      originalText: parsed.originalText || transcriptionText,
    };
  });
};

// --- LIVE TRANSCRIPTION (system audio, real-time PCM streaming via WebSocket) ---
// Mirrors Web Speech API behaviour: fires interim (isFinal=false) and final (isFinal=true) events
const startLiveTranscription = async (
  onText: (text: string, isFinal: boolean) => void,
  onError: (error: string) => void,
  onClose: () => void
): Promise<any> => {
  const ai = await getAI();
  const session = await ai.live.connect({
    model: 'gemini-2.0-flash-live-001',
    callbacks: {
      onmessage: (message: any) => {
        // Primary path: inputAudioTranscription events — mirrors Web Speech API interim/final
        const t = message.serverContent?.inputTranscription;
        if (t?.text) {
          onText(t.text, t.finished === true);
          return;
        }
        // Fallback: plain model-turn text chunks
        for (const part of (message.serverContent?.modelTurn?.parts ?? [])) {
          if (part.text) onText(part.text, true);
        }
      },
      onerror: (error: any) => {
        onError(error?.message ?? 'Error en transcripción en directo');
      },
      onclose: onClose,
    },
    config: {
      responseModalities: [Modality.TEXT],
      inputAudioTranscription: {}, // enables word-by-word input transcription events
      systemInstruction: {
        parts: [{ text: 'Eres un transcriptor. Transcribe el audio de entrada en español, palabra a palabra. Devuelve únicamente el texto transcrito, sin comentarios ni explicaciones.' }],
      },
    },
  });
  return session;
};

export const geminiService = { processAudio, processPressRelease, chatWithSource, genericChat, chatWithDocuments, verifyManualSelection, startLiveTranscription, suggestHeadlinesForTopic, extractRelevantFragments, generateTeletipoFromText };
