

// Updated to strictly follow @google/genai initialization guidelines and remove unused Schema
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, PressReleaseResult, HistoryItem, AppMode } from "../types";
import mammoth from "mammoth";

// Helper to get API key from storage or env
const getApiKey = (): string => {
  const storedKey = localStorage.getItem('GEMINI_API_KEY');
  if (storedKey) return storedKey;

  // Fallback to env var if available (for local dev)
  if (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') {
    return process.env.API_KEY;
  }

  throw new Error("API Key no encontrada. Por favor, configura tu API Key en los ajustes.");
};

// Helper to get AI instance
const getAI = () => {
  return new GoogleGenAI({ apiKey: getApiKey() });
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
    throw error;
  }
}

// --- AUDIO/VIDEO PROCESSING ---
const processAudio = async (base64Audio: string, mimeType: string): Promise<AnalysisResult> => {
  let normalizedMimeType = mimeType;
  if (mimeType.includes('quicktime')) normalizedMimeType = 'video/quicktime';
  if (mimeType.includes('mp4')) normalizedMimeType = 'video/mp4';
  if (mimeType.includes('wav')) normalizedMimeType = 'audio/wav';
  if (mimeType.includes('mpeg')) normalizedMimeType = 'audio/mpeg';

  const operation = async () => {
    const response = await getAI().models.generateContent({
      model: "gemini-3-pro-preview",
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
    if (!text) throw new Error("La IA no devolvió contenido.");
    return JSON.parse(text) as AnalysisResult;
  };
  return await retryOperation(operation);
};


// --- GENERIC CHAT (WRITING ASSISTANT) ---
const genericChat = async (history: { role: string, text: string }[], message: string) => {
  const response = await getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] }
    ],
    config: {
      temperature: 0.7,
      systemInstruction: "Eres un Asistente de Redacción experto para la Agencia Servimedia. Tu objetivo es ayudar a periodistas a pulir sus textos, corregir faltas de ortografía, mejorar la gramática y responder consultas de investigación. Mantén un tono profesional, culto y preciso."
    }
  });
  return response.text;
};

// --- CHAT WITH SOURCE ---
const chatWithSource = async (history: { role: string, text: string }[], transcript: string, userQuestion: string) => {
  const response = await getAI().models.generateContent({
    model: "gemini-3-flash-preview",
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
  return response.text;
};

// --- PRESS RELEASE PROCESSING ---
const processPressRelease = async (
  base64Data: string,
  mimeType: string,
  userAngle?: string // Removed history?: HistoryItem[] parameter
): Promise<PressReleaseResult> => {
  const instructionText = `
    Eres un Redactor Jefe de la Agencia Servimedia. Tu misión es transformar este material en un TELETIPO DE AGENCIA PERFECTO.
    
    REGLAS DE ORO DE REDACCIÓN:
    1. REESCRITURA TOTAL: Adapta todo el texto al estilo de agencia.
    2. PASADO SIMPLE OBLIGATORIO: Utiliza siempre el pasado simple para hechos concluidos (ej. "dijo", "anunció").
    3. ESTRUCTURA: Titular, Lead y Cuerpo.
    4. FORMATO: DOBLE SALTO DE LÍNEA entre párrafos.
    
    ${userAngle ? `ÁNGULO EDITORIAL REQUERIDO: ${userAngle}` : ''}
    
    DEBES DEVOLVER UN JSON VÁLIDO CON: headline, lead, body.
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

    const response = await getAI().models.generateContent({
      model: "gemini-3-pro-preview",
      contents: { parts: contentParts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            lead: { type: Type.STRING },
            body: { type: Type.STRING },
            // originalText se gestiona en el cliente, no se solicita al modelo
          },
          required: ["headline", "lead", "body"], // originalText eliminado de los requeridos
        },
        temperature: 0.1,
      },
    });
    const parsedResult = JSON.parse(response.text || "{}");
    const result: PressReleaseResult = {
      headline: parsedResult.headline || "",
      lead: parsedResult.lead || "",
      body: parsedResult.body || "",
      originalText: sourceTextForDisplay,
      userAngle: userAngle,
    };
    return result;
  });
};

// --- MANUAL VERIFICATION ---
const verifyManualSelection = async (text: string): Promise<any> => {
  const operation = async () => {
    const response = await getAI().models.generateContent({
      model: "gemini-3-pro-preview", // Upgrading to Pro for better Grounding/Search support
      contents: {
        parts: [
          {
            text: `ERES UN VERIFICADOR DE DATOS (FACT-CHECKER) EXPERTO PARA SERVIMEDIA.
          
          TU TAREA: Analizar el siguiente fragmento de texto y verificar si las afirmaciones, cifras o datos citados son veraces, falsos o dudosos. 
          
          IMPORTANTE: Tienes acceso a GOOGLE SEARCH. Úsalo para buscar fuentes fiables, noticias recientes y datos oficiales que respalden o desmientan la afirmación.
          
          TEXTO A VERIFICAR: "${text}"
          
          INSTRUCCIONES:
          1. Identifica la afirmación principal.
          2. Usa búsqueda en tiempo real para contrastar el dato.
          3. Determina un veredicto: 'Verdadero', 'Falso', 'Engañoso', 'Inconsistente', 'Dudoso'.
          4. Proporciona una explicación breve y profesional.
          5. EXTRAE LOS ENLACES (URLs) de las fuentes que has consultado.
          
          DEBES DEVOLVER UN JSON VÁLIDO CON LA ESTRUCTURA SCHEMA DEFINIDA.` },
        ],
      },
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            claim: { type: Type.STRING },
            verdict: { type: Type.STRING, enum: ['Verdadero', 'Falso', 'Engañoso', 'Inconsistente', 'Dudoso'] },
            explanation: { type: Type.STRING },
            sources: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  url: { type: Type.STRING }
                },
                required: ["title", "url"]
              }
            }
          },
          required: ["claim", "verdict", "explanation"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("La IA no devolvió contenido.");
    return JSON.parse(resultText);
  };
  return await retryOperation(operation);
};

export const geminiService = { processAudio, processPressRelease, chatWithSource, genericChat, verifyManualSelection };

