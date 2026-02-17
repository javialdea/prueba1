// Global AudioContext instance to prevent memory leaks
// Browsers limit the number of AudioContext instances (typically 6)
let globalAudioContext: AudioContext | null = null;

/**
 * Gets or creates a global AudioContext instance
 * This prevents the "Too many AudioContext instances" error
 */
function getAudioContext(): AudioContext {
  if (!globalAudioContext || globalAudioContext.state === 'closed') {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  // Resume context if suspended (happens when tab is inactive)
  if (globalAudioContext.state === 'suspended') {
    globalAudioContext.resume().catch(err => {
      console.warn('Failed to resume AudioContext:', err);
    });
  }

  return globalAudioContext;
}

/**
 * Cleanup function to close the global AudioContext
 * Call this when the app is unmounting or no longer needs audio processing
 */
export function cleanupAudioContext() {
  if (globalAudioContext && globalAudioContext.state !== 'closed') {
    globalAudioContext.close().catch(err => {
      console.warn('Failed to close AudioContext:', err);
    });
    globalAudioContext = null;
  }
}

export async function extractAudioFromVideo(file: File): Promise<{ blob: Blob, base64: string }> {
  try {
    console.log(`[AudioUtils] Processing file: ${file.name} (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)}MB)`);

    const audioContext = getAudioContext();

    const arrayBuffer = await file.arrayBuffer();
    console.log('[AudioUtils] File loaded into ArrayBuffer');

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log(`[AudioUtils] Audio decoded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`);

    // Configuramos para 1 canal (mono) y 16000Hz para optimizar tamaño y calidad de voz
    const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();

    const renderedBuffer = await offlineContext.startRendering();
    console.log('[AudioUtils] Audio resampled to 16kHz mono');

    const wavBlob = bufferToWav(renderedBuffer);
    console.log(`[AudioUtils] WAV blob created: ${(wavBlob.size / 1024 / 1024).toFixed(2)}MB`);

    const base64 = await blobToBase64(wavBlob);
    console.log('[AudioUtils] Base64 encoding complete');

    return { blob: wavBlob, base64 };
  } catch (error) {
    console.error('[AudioUtils] Error processing audio:', error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.name === 'EncodingError') {
        throw new Error(`No se pudo decodificar el archivo de audio. Asegúrate de que sea un formato válido (MP3, WAV, etc.)`);
      } else if (error.message.includes('quota')) {
        throw new Error(`El archivo es demasiado grande para procesar. Intenta con un archivo más pequeño.`);
      }
    }

    throw new Error(`Error al procesar el audio: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // Escribir cabecera WAV
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  // Escribir samples intercalados
  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArray], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
