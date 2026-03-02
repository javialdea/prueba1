import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Monitor, Square, Circle, AlertCircle, Copy, Check, RotateCcw, Send } from 'lucide-react';
import { FileState } from '../types';
import { geminiService } from '../services/geminiService';

interface LiveRecorderProps {
  onFileSelected: (fileState: FileState) => void;
  onError?: (error: string) => void;
}

type RecorderSource = 'mic' | 'system';
type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'done';

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export const LiveRecorder: React.FC<LiveRecorderProps> = ({ onFileSelected, onError }) => {
  const [source, setSource] = useState<RecorderSource>('mic');
  const [state, setState] = useState<RecorderState>('idle');
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fragmentSent, setFragmentSent] = useState(false);
  const [hasChunks, setHasChunks] = useState(false);

  // Audio capture (both modes)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  // Mic-specific: Web Speech API
  const recognitionRef = useRef<any>(null);

  // System audio-specific: Gemini Live + AudioContext pipeline
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Guards
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLiveRef = useRef(false); // prevents final-flush chunk from being processed on stop

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state === 'recording') {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (state === 'idle') setSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── Cleanup everything ───────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    isLiveRef.current = false;

    // Close Gemini Live session (system audio)
    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.sendRealtimeInput({ audioStreamEnd: true });
        liveSessionRef.current.close();
      } catch (_) {}
      liveSessionRef.current = null;
    }

    // Disconnect AudioContext pipeline (system audio)
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (_) {}
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch (_) {}
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }

    // Stop Web Speech API (mic)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

    // Stop all media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => {
    setState('stopping');
    isLiveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop(); // triggers onstop → onFileSelected → setState('done')
    }
    stopAll();
  }, [stopAll]);

  // ── Send fragment: ships accumulated audio to queue, keeps recording going ──
  const handleSendFragment = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    const currentMimeType = mimeTypeRef.current;
    const blob = new Blob(chunksRef.current, { type: currentMimeType });
    const file = new File([blob], `fragmento-${Date.now()}.webm`, { type: currentMimeType });
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      onFileSelected({ file, base64, mimeType: currentMimeType, blob });
    };
    reader.readAsDataURL(blob);
    chunksRef.current = [];
    setHasChunks(false);
    setFragmentSent(true);
    setTimeout(() => setFragmentSent(false), 2500);
  }, [onFileSelected]);

  const handleNewRecording = () => {
    setFinalText('');
    setInterimText('');
    setSeconds(0);
    setHasChunks(false);
    setState('idle');
  };

  const handleCopyTranscript = () => {
    navigator.clipboard.writeText(finalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── MICROPHONE ─────────────────────────────────────────────────────────
  // Model: MediaRecorder (full audio) + Web Speech API (live word-by-word)
  const startMic = async () => {
    setError(null);
    setFinalText('');
    setInterimText('');
    setHasChunks(false);
    setState('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) { chunksRef.current.push(e.data); setHasChunks(true); }
      };
      recorder.onstop = () => {
        setInterimText('');
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const file = new File([blob], `grabacion-microfono-${Date.now()}.webm`, { type: mimeType });
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            onFileSelected({ file, base64, mimeType, blob });
          };
          reader.readAsDataURL(blob);
        }
        setState('done');
      };

      recorder.start(1000); // 1-second timeslice for responsive fragment sending

      // Web Speech API: live word-by-word transcription (interim + final)
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-ES';

        recognition.onresult = (event: any) => {
          let interim = '';
          let newFinal = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) newFinal += t + ' ';
            else interim += t;
          }
          if (newFinal) setFinalText(prev => prev + newFinal);
          setInterimText(interim);
        };

        recognition.onerror = (e: any) => {
          if (e.error === 'no-speech') return;
          console.warn('[LiveRecorder] SpeechRecognition error:', e.error);
        };

        recognition.onend = () => {
          if (mediaRecorderRef.current?.state === 'recording') {
            try { recognition.start(); } catch (_) {}
          }
        };

        recognition.start();
      }

      isLiveRef.current = true;
      setState('recording');
    } catch (err: any) {
      stopAll();
      setState('idle');
      const msg = err.name === 'NotAllowedError'
        ? 'Permiso de micrófono denegado. Actívalo en la configuración del navegador.'
        : `Error al acceder al micrófono: ${err.message}`;
      setError(msg);
      if (onError) onError(msg);
    }
  };

  // ── SYSTEM AUDIO ───────────────────────────────────────────────────────
  // Model: MediaRecorder (full audio) + Gemini Live API (live word-by-word via PCM streaming)
  // Mirrors the mic model exactly: same interim/final text pattern, same UX
  const startSystem = async () => {
    setError(null);
    setFinalText('');
    setInterimText('');
    setHasChunks(false);
    setState('requesting');

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = displayStream;

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach(t => t.stop());
        const msg = 'No se detectó audio. Asegúrate de activar "Compartir audio de la pestaña" al compartir pantalla.';
        setError(msg);
        if (onError) onError(msg);
        setState('idle');
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      displayStream.getVideoTracks().forEach(t => t.stop());

      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mimeTypeRef.current = mimeType;

      // ── MediaRecorder: captures the full audio for final Gemini analysis ──
      const recorder = new MediaRecorder(audioStream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) { chunksRef.current.push(e.data); setHasChunks(true); }
      };
      recorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const file = new File([blob], `grabacion-sistema-${Date.now()}.webm`, { type: mimeType });
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            onFileSelected({ file, base64, mimeType, blob });
          };
          reader.readAsDataURL(blob);
        }
        setState('done');
      };

      recorder.start(1000);

      // ── Gemini Live API: real-time transcription via PCM streaming (≡ Web Speech API for system audio) ──
      try {
        const liveSession = await geminiService.startLiveTranscription(
          (text, isFinal) => {
            // isFinal=false → interim (shown grey, overwritten on each event)
            // isFinal=true  → final  (appended to transcript, interim cleared)
            if (isFinal) {
              setFinalText(prev => prev ? prev + ' ' + text : text);
              setInterimText('');
            } else {
              setInterimText(text);
            }
          },
          (err) => console.warn('[LiveRecorder] Live API error:', err),
          () => {} // onClose — session closed gracefully
        );
        liveSessionRef.current = liveSession;

        // ── AudioContext → ScriptProcessor → PCM chunks → Gemini Live ──
        // Converts the MediaStream audio to raw 16kHz PCM and streams it in real time
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        const source = audioCtx.createMediaStreamSource(audioStream);
        // eslint-disable-next-line deprecation/deprecation
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
          if (!isLiveRef.current || !liveSessionRef.current) return;

          // Resample to 16 kHz if AudioContext used a different rate
          let float32 = e.inputBuffer.getChannelData(0);
          const ctxRate = e.inputBuffer.sampleRate;
          if (ctxRate !== 16000) {
            const ratio = ctxRate / 16000;
            const resampled = new Float32Array(Math.round(float32.length / ratio));
            for (let i = 0; i < resampled.length; i++) {
              resampled[i] = float32[Math.floor(i * ratio)];
            }
            float32 = resampled;
          }

          // Convert Float32 → Int16 PCM
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 32768 : s * 32767;
          }

          try {
            liveSessionRef.current.sendRealtimeInput({
              audio: new Blob([int16.buffer], { type: 'audio/pcm' }),
            });
          } catch (_) {}
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        audioContextRef.current = audioCtx;
        processorRef.current = processor;
        sourceNodeRef.current = source;

      } catch (liveErr) {
        // Live API unavailable (API key, network, quota…) — recording still works,
        // the full transcript is produced by Gemini when the user stops/sends fragment
        console.warn('[LiveRecorder] Gemini Live unavailable, live transcript disabled:', liveErr);
      }

      // Stop gracefully if the user ends the screen share from the browser UI
      audioTracks[0]?.addEventListener('ended', handleStop);

      isLiveRef.current = true;
      setState('recording');
    } catch (err: any) {
      stopAll();
      setState('idle');
      if (err.name === 'NotAllowedError') return;
      const msg = `Error al capturar audio del sistema: ${err.message}`;
      setError(msg);
      if (onError) onError(msg);
    }
  };

  const handleStart = () => source === 'mic' ? startMic() : startSystem();

  const isRecording = state === 'recording';
  const isRequesting = state === 'requesting';
  const isDone = state === 'done';
  const hasText = !!(finalText || interimText);

  return (
    <div className="w-full max-w-3xl mx-auto">

      {/* Source selector — only in idle */}
      {state === 'idle' && (
        <div className="flex gap-3 justify-center mb-8">
          <button
            onClick={() => setSource('mic')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
              source === 'mic'
                ? 'bg-servimedia-pink text-white shadow-lg shadow-servimedia-pink/20'
                : 'bg-white border border-servimedia-border text-servimedia-gray/40 hover:border-servimedia-pink/30'
            }`}
          >
            <Mic className="w-4 h-4" /> Micrófono
          </button>
          <button
            onClick={() => setSource('system')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
              source === 'system'
                ? 'bg-servimedia-pink text-white shadow-lg shadow-servimedia-pink/20'
                : 'bg-white border border-servimedia-border text-servimedia-gray/40 hover:border-servimedia-pink/30'
            }`}
          >
            <Monitor className="w-4 h-4" /> Audio del sistema
          </button>
        </div>
      )}

      {/* System audio info — only in idle */}
      {state === 'idle' && source === 'system' && (
        <div className="flex items-start gap-3 p-4 bg-servimedia-orange/5 border border-servimedia-orange/20 rounded-2xl mb-6 max-w-xl mx-auto">
          <AlertCircle className="w-4 h-4 text-servimedia-orange mt-0.5 shrink-0" />
          <p className="text-[11px] text-servimedia-gray/60 leading-relaxed">
            Solo funciona en <strong>Chrome desktop</strong>. Al compartir, elige una pestaña del navegador y activa <strong>"Compartir audio de la pestaña"</strong>. La transcripción aparece en tiempo real durante la grabación.
          </p>
        </div>
      )}

      {/* Recording area */}
      <div className={`w-full border-2 border-dashed rounded-3xl transition-all duration-500 overflow-hidden ${
        isRecording
          ? 'border-servimedia-pink bg-servimedia-pink/[0.02]'
          : 'border-servimedia-border bg-white'
      }`}>

        {/* Header bar */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-servimedia-border/50">
          <div className="flex items-center gap-3">
            {isRecording && (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-servimedia-pink opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-servimedia-pink"></span>
              </span>
            )}
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-servimedia-gray/30">
              {isRecording
                ? (source === 'mic' ? 'Grabando micrófono' : 'Grabando sistema')
                : isRequesting ? 'Solicitando permisos...'
                : state === 'stopping' ? 'Finalizando...'
                : isDone ? 'Transcripción · Audio en análisis'
                : 'Grabación en directo'}
            </span>
          </div>
          {(isRecording || isDone) && seconds > 0 && (
            <span className={`font-black text-lg tracking-tighter tabular-nums ${isRecording ? 'text-servimedia-pink' : 'text-servimedia-gray/20'}`}>
              {formatTime(seconds)}
            </span>
          )}
        </div>

        {/* Transcript area */}
        {(isRecording || state === 'stopping' || isDone) && (
          <div className="px-10 py-8 min-h-[180px]">
            {hasText ? (
              <div className="font-serif text-xl leading-relaxed text-servimedia-gray">
                {finalText && <span>{finalText}</span>}
                {interimText && (
                  <span className="text-servimedia-gray/30 italic"> {interimText}</span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[120px] gap-4">
                {isRecording ? (
                  <span className="text-servimedia-gray/20 italic text-xl font-serif">
                    Escuchando...
                  </span>
                ) : isDone ? (
                  <p className="text-[11px] text-servimedia-gray/30 text-center">
                    Grabación enviada para análisis completo con Gemini.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Idle / requesting placeholder */}
        {(state === 'idle' || isRequesting) && (
          <div className="flex flex-col items-center justify-center py-16 gap-6">
            {!isRequesting ? (
              <>
                {source === 'mic'
                  ? <Mic className="w-14 h-14 text-servimedia-gray/10" />
                  : <Monitor className="w-14 h-14 text-servimedia-gray/10" />
                }
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-servimedia-gray/30">
                  {source === 'mic' ? 'Listo para grabar tu voz' : 'Listo para capturar audio del sistema'}
                </p>
              </>
            ) : (
              <p className="text-[11px] font-black uppercase tracking-widest text-servimedia-gray/30 animate-pulse">
                Solicitando permisos...
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-center pb-8 pt-2 gap-3 flex-wrap">
          {!isRecording && state !== 'stopping' && !isDone ? (
            <button
              onClick={handleStart}
              disabled={isRequesting}
              className="flex items-center gap-3 px-10 py-4 bg-servimedia-pink text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-servimedia-pink/90 transition-all shadow-lg shadow-servimedia-pink/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Circle className="w-4 h-4" /> Iniciar grabación
            </button>
          ) : isRecording ? (
            <>
              {/* Enviar fragmento: sends accumulated audio, recording & transcript continue */}
              <button
                onClick={handleSendFragment}
                disabled={!hasChunks}
                className={`flex items-center gap-2 px-7 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                  fragmentSent
                    ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                    : hasChunks
                      ? 'bg-white border border-servimedia-border text-servimedia-gray/60 hover:border-servimedia-pink/40 hover:text-servimedia-pink'
                      : 'bg-white border border-servimedia-border text-servimedia-gray/20 cursor-not-allowed'
                }`}
              >
                {fragmentSent
                  ? <><Check className="w-4 h-4" /> Enviado ✓</>
                  : <><Send className="w-4 h-4" /> Enviar fragmento</>
                }
              </button>
              {/* Detener: stops everything completely */}
              <button
                onClick={handleStop}
                className="flex items-center gap-3 px-8 py-4 bg-servimedia-gray text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-servimedia-gray/80 transition-all"
              >
                <Square className="w-4 h-4" /> Detener
              </button>
            </>
          ) : isDone ? (
            <>
              {finalText && (
                <button
                  onClick={handleCopyTranscript}
                  className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                    copied
                      ? 'bg-green-600 text-white'
                      : 'bg-servimedia-light border border-servimedia-border text-servimedia-gray/60 hover:border-servimedia-pink/30'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiado' : 'Copiar texto'}
                </button>
              )}
              <button
                onClick={handleNewRecording}
                className="flex items-center gap-3 px-8 py-3.5 bg-servimedia-pink text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-servimedia-pink/90 transition-all shadow-lg shadow-servimedia-pink/20"
              >
                <RotateCcw className="w-4 h-4" /> Nueva grabación
              </button>
            </>
          ) : (
            <p className="text-[11px] font-black uppercase tracking-widest text-servimedia-gray/30 animate-pulse">
              Procesando audio...
            </p>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl mt-4">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-600">{error}</p>
        </div>
      )}

      {/* No Speech API warning — mic only */}
      {!SpeechRecognitionAPI && source === 'mic' && state === 'idle' && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl mt-4">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700">
            Tu navegador no soporta la API de reconocimiento de voz en tiempo real. Usa <strong>Chrome o Edge</strong> para ver el texto mientras grabas. El audio se transcribirá igualmente al detener.
          </p>
        </div>
      )}
    </div>
  );
};
