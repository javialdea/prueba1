import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Monitor, Square, Circle, AlertCircle } from 'lucide-react';
import { FileState } from '../types';

interface LiveRecorderProps {
  onFileSelected: (fileState: FileState) => void;
  onError?: (error: string) => void;
}

type RecorderSource = 'mic' | 'system';
type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopping';

// Extend window for cross-browser Speech Recognition
const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export const LiveRecorder: React.FC<LiveRecorderProps> = ({ onFileSelected, onError }) => {
  const [source, setSource] = useState<RecorderSource>('mic');
  const [state, setState] = useState<RecorderState>('idle');
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
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

  const stopAll = useCallback(() => {
    // Stop recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => {
    setState('stopping');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop(); // onstop will fire and call onFileSelected
    }
    stopAll();
  }, [stopAll]);

  const startMic = async () => {
    setError(null);
    setState('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // MediaRecorder for audio capture
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `grabacion-microfono-${Date.now()}.webm`, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onFileSelected({ file, base64, mimeType, blob });
        };
        reader.readAsDataURL(blob);
        setState('idle');
        setFinalText('');
        setInterimText('');
      };

      recorder.start();

      // Web Speech API for live transcription
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
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              newFinal += transcript + ' ';
            } else {
              interim += transcript;
            }
          }
          if (newFinal) setFinalText(prev => prev + newFinal);
          setInterimText(interim);
        };

        recognition.onerror = (e: any) => {
          // 'no-speech' is non-fatal, ignore it
          if (e.error === 'no-speech') return;
          console.warn('[LiveRecorder] SpeechRecognition error:', e.error);
        };

        recognition.onend = () => {
          // Restart if still recording (recognition stops automatically on silence)
          if (mediaRecorderRef.current?.state === 'recording') {
            try { recognition.start(); } catch (_) {}
          }
        };

        recognition.start();
      }

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

  const startSystem = async () => {
    setError(null);
    setState('requesting');

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      streamRef.current = displayStream;

      // Check there is an audio track
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach(t => t.stop());
        const msg = 'No se detectó audio. Asegúrate de activar "Compartir audio de la pestaña" al compartir pantalla.';
        setError(msg);
        if (onError) onError(msg);
        setState('idle');
        return;
      }

      // Build audio-only stream from display stream
      const audioStream = new MediaStream(audioTracks);
      // Stop the video tracks — we don't need them
      displayStream.getVideoTracks().forEach(t => t.stop());

      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(audioStream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `grabacion-sistema-${Date.now()}.webm`, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onFileSelected({ file, base64, mimeType, blob });
        };
        reader.readAsDataURL(blob);
        setState('idle');
      };

      // If the user stops sharing from the browser UI, stop recording
      displayStream.getVideoTracks()[0]?.addEventListener('ended', handleStop);
      audioTracks[0]?.addEventListener('ended', handleStop);

      recorder.start();
      setState('recording');
    } catch (err: any) {
      stopAll();
      setState('idle');
      if (err.name === 'NotAllowedError') return; // User cancelled, no error message needed
      const msg = `Error al capturar audio del sistema: ${err.message}`;
      setError(msg);
      if (onError) onError(msg);
    }
  };

  const handleStart = () => {
    if (source === 'mic') startMic();
    else startSystem();
  };

  const isRecording = state === 'recording';
  const isRequesting = state === 'requesting';

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Source selector */}
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

      {/* System audio info */}
      {state === 'idle' && source === 'system' && (
        <div className="flex items-start gap-3 p-4 bg-servimedia-orange/5 border border-servimedia-orange/20 rounded-2xl mb-6 max-w-xl mx-auto">
          <AlertCircle className="w-4 h-4 text-servimedia-orange mt-0.5 shrink-0" />
          <p className="text-[11px] text-servimedia-gray/60 leading-relaxed">
            Solo funciona en <strong>Chrome desktop</strong>. Al compartir, elige una pestaña del navegador y activa <strong>"Compartir audio de la pestaña"</strong>. El texto aparecerá una vez que pares la grabación.
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
                : 'Grabación en directo'}
            </span>
          </div>
          {isRecording && (
            <span className="text-servimedia-pink font-black text-lg tracking-tighter tabular-nums">
              {formatTime(seconds)}
            </span>
          )}
        </div>

        {/* Live transcript area (mic only) */}
        {(isRecording || state === 'stopping') && source === 'mic' && (
          <div className="px-10 py-8 min-h-[180px] font-serif text-xl leading-relaxed text-servimedia-gray">
            {finalText && <span>{finalText}</span>}
            {interimText && <span className="text-servimedia-gray/30 italic">{interimText}</span>}
            {!finalText && !interimText && (
              <span className="text-servimedia-gray/20 italic">Escuchando...</span>
            )}
          </div>
        )}

        {/* System recording visual */}
        {isRecording && source === 'system' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Monitor className="w-12 h-12 text-servimedia-pink/30" />
            <p className="text-[11px] font-black uppercase tracking-widest text-servimedia-gray/30">
              Capturando audio del sistema
            </p>
            <p className="text-[10px] text-servimedia-gray/20">El texto aparecerá tras detener la grabación</p>
          </div>
        )}

        {/* Idle / requesting state */}
        {(state === 'idle' || isRequesting) && (
          <div className="flex flex-col items-center justify-center py-16 gap-6">
            {!isRequesting ? (
              <>
                <div className="relative">
                  {source === 'mic'
                    ? <Mic className="w-14 h-14 text-servimedia-gray/10" />
                    : <Monitor className="w-14 h-14 text-servimedia-gray/10" />
                  }
                </div>
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

        {/* Action button */}
        <div className="flex justify-center pb-8 pt-2">
          {!isRecording && state !== 'stopping' ? (
            <button
              onClick={handleStart}
              disabled={isRequesting}
              className="flex items-center gap-3 px-10 py-4 bg-servimedia-pink text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-servimedia-pink/90 transition-all shadow-lg shadow-servimedia-pink/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Circle className="w-4 h-4" /> Iniciar grabación
            </button>
          ) : isRecording ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-3 px-10 py-4 bg-servimedia-gray text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-servimedia-gray/80 transition-all"
            >
              <Square className="w-4 h-4" /> Detener grabación
            </button>
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

      {/* No Speech API warning */}
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
