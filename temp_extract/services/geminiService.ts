

// Updated to strictly follow @google/genai initialization guidelines and remove unused Schema
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, PressReleaseResult, HistoryItem, AppMode, PressSummaryResult } from "../types";
import mammoth from "mammoth";

// Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

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
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: normalizedMimeType, data: base64Audio } },
          { text: `ERES UN TRANSCRIPTOR PERIODÍSTICO EXPERTO DE ÉLITE PARA SERVIMEDIA. 
          
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

// --- MADRID PRESS SUMMARY ---
const fetchMadridPressSummary = async (): Promise<PressSummaryResult> => {
  const prompt = `
    Visita cada una de estas URLs de las secciones de Madrid de los diarios. Para cada URL, extrae los 5 primeros titulares de noticias que encuentres en la página. Asegúrate de que sean titulares textuales de noticias. Para cada titular, proporciona un resumen muy breve (una frase) y su URL si está disponible.

    URLs a consultar:
    - Europa Press Madrid: https://www.europapress.es/madrid/
    - El Mundo Madrid: https://www.elmundo.es/madrid.html
    - El Diario Madrid: https://www.eldiario.es/madrid/
    - 20 Minutos Madrid: https://www.20minutos.es/madrid/
    - El País Madrid: https://elpais.com/espana/madrid/

    DEBES DEVOLVER UN JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA:
    {
      "date": "Fecha de hoy",
      "summaries": [
        {
          "source": "Nombre del diario",
          "news": [
            { "headline": "Titular", "summary": "Resumen", "url": "URL si está disponible" }
          ]
        }
      ]
    }
  `;

  return await retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            summaries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING },
                  news: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        headline: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        url: { type: Type.STRING }
                      },
                      required: ["headline", "summary"]
                    }
                  }
                },
                required: ["source", "news"]
              }
            }
          },
          required: ["date", "summaries"]
        }
      },
    });

    const text = response.text;
    if (!text) throw new Error("No se pudo obtener el resumen de prensa.");
    return JSON.parse(text) as PressSummaryResult;
  });
};

// --- GENERIC CHAT (WRITING ASSISTANT) ---
const genericChat = async (history: {role: string, text: string}[], message: string) => {
  const response = await ai.models.generateContent({
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
const chatWithSource = async (history: {role: string, text: string}[], transcript: string, userQuestion: string) => {
  const response = await ai.models.generateContent({
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

    const response = await ai.models.generateContent({
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
        originalText: sourceTextForDisplay, // Se pobla este campo desde el lado del cliente
        userAngle: userAngle,
    };
    return result;
  });
};

export const geminiService = { processAudio, processPressRelease, chatWithSource, genericChat, fetchMadridPressSummary };
