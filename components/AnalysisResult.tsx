
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { AnalysisResult as AnalysisResultType, PressReleaseResult as PressReleaseResultType, TopicDetail } from '../types';
import { FileText, List, Download, PlayCircle, PauseCircle, MessageSquare, Share2, Send, Sparkles, ShieldCheck, Info, Loader2, ArrowLeft, PenLine } from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import { PressReleaseResult as PressReleaseResultComponent } from './PressReleaseResult';

interface AnalysisResultProps {
  result: AnalysisResultType;
  audioFile: File | null;
  audioUrl?: string; // Fallback URL from Supabase Storage (used when loading from history)
  onManualVerify?: (claim: string) => void;
  onSaveTeletipo?: (result: PressReleaseResultType, fileName: string) => void;
}

type Tab = 'transcript' | 'chat' | 'verificador' | 'social';

export const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, audioFile, audioUrl: audioUrlProp, onManualVerify, onSaveTeletipo }) => {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('transcript');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string, text: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const isVideo = audioFile?.type.startsWith('video/');
  // Use local blob URL if file has content, else fall back to signed Supabase URL
  const localUrl = useMemo(() => (audioFile && audioFile.size > 0) ? URL.createObjectURL(audioFile) : null, [audioFile]);
  const mediaUrl = localUrl ?? audioUrlProp ?? null;

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(media.currentTime);

    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [mediaUrl]);

  const togglePlay = () => {
    if (mediaRef.current) {
      if (isPlaying) mediaRef.current.pause();
      else mediaRef.current.play();
    }
  };

  const handleTimestampClick = (timestamp: string) => {
    if (mediaRef.current) {
      const parts = timestamp.split(':');
      const seconds = parts.length === 2
        ? parseInt(parts[0]) * 60 + parseInt(parts[1])
        : parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);

      // If clicking same segment that is already playing, toggle pause
      const isCurrentlyThisTime = Math.abs(mediaRef.current.currentTime - seconds) < 2;
      if (isCurrentlyThisTime && isPlaying) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.currentTime = seconds;
        mediaRef.current.play();
      }
    }
  };

  const isSegmentActive = (timestamp: string, nextTimestamp?: string) => {
    const parts = timestamp.split(':');
    const start = parts.length === 2
      ? parseInt(parts[0]) * 60 + parseInt(parts[1])
      : parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);

    let end = Infinity;
    if (nextTimestamp) {
      const nextParts = nextTimestamp.split(':');
      end = nextParts.length === 2
        ? parseInt(nextParts[0]) * 60 + parseInt(nextParts[1])
        : parseInt(nextParts[0]) * 3600 + parseInt(nextParts[1]) * 60 + parseInt(nextParts[2]);
    }

    return currentTime >= start && currentTime < end;
  };

  const handleDownloadPDF = async () => {
    const doc = new jsPDF();
    const margin = 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineHeight = 7;
    const bottomMargin = 20;
    let y = 20;

    // Header Branding
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(229, 0, 81); // Servimedia Pink
    doc.text("Servimedia-IA", margin, y);

    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Registro Editorial: ${new Date().toLocaleString()}`, margin, y);
    doc.text(`Archivo: ${audioFile?.name || 'Documento sin nombre'}`, margin, y + 5);

    y += 20;
    doc.setFontSize(14);
    doc.setTextColor(51, 51, 51);
    doc.text("TRANSCRIPCIÓN ÍNTEGRA", margin, y);

    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);

    const splitText = doc.splitTextToSize(
      (result.transcription || []).map(s => `[${s.timestamp}] ${s.text}`).join('\n\n'),
      170
    );

    // Render line by line, adding new pages when needed
    for (const line of splitText) {
      if (y + lineHeight > pageHeight - bottomMargin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }

    doc.save(`transcripcion_servimedia_${audioFile?.name || 'documento'}.pdf`);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = chatInput;
    setChatInput('');
    const newHistory = [...chatHistory, { role: 'user', text: userMsg }];
    setChatHistory(newHistory);
    setIsChatLoading(true);
    try {
      const fullText = (result.transcription || []).map(s => `[${s.timestamp}] ${s.text}`).join('\n');
      const aiResponse = await geminiService.chatWithSource(chatHistory, fullText, userMsg);
      setChatHistory([...newHistory, { role: 'model', text: aiResponse || 'Sin respuesta.' }]);
    } catch (e) {
      setChatHistory([...newHistory, { role: 'model', text: 'Error de conexión.' }]);
    } finally { setIsChatLoading(false); }
  };

  // --- Teletipo generation state ---
  const [topicHeadlines, setTopicHeadlines] = useState<{
    topicIndex: number;
    headlines: string[];
    isLoading: boolean;
  } | null>(null);
  const [teletipoOverlay, setTeletipoOverlay] = useState<PressReleaseResultType | null>(null);
  const [isTeletipoLoading, setIsTeletipoLoading] = useState(false);

  // Context modal state
  const [pendingTeletipo, setPendingTeletipo] = useState<{ headline: string; topicName: string; isCustom?: boolean } | null>(null);
  const [speakerWho, setSpeakerWho] = useState('');
  const [speakerWhere, setSpeakerWhere] = useState('');

  // Custom headline input
  const [customHeadline, setCustomHeadline] = useState('');
  const [teletipoLoadingMsg, setTeletipoLoadingMsg] = useState('Redactando teletipo...');

  const buildTranscriptionText = () =>
    (result.transcription || []).map(s => `[${s.timestamp}] ${s.text}`).join('\n');

  const handleGenerateTeletipoForTopic = async (topic: TopicDetail, index: number) => {
    setTopicHeadlines({ topicIndex: index, headlines: [], isLoading: true });
    try {
      const headlines = await geminiService.suggestHeadlinesForTopic(topic, result.transcription || []);
      setTopicHeadlines({ topicIndex: index, headlines, isLoading: false });
    } catch {
      setTopicHeadlines(null);
    }
  };

  // Both paths now go through the context modal instead of generating immediately
  const handleSelectHeadline = (headline: string, topicName: string) => {
    setTopicHeadlines(null);
    setPendingTeletipo({ headline, topicName });
  };

  const handleHeadlineClick = (headline: string) => {
    setPendingTeletipo({ headline, topicName: '' });
  };

  const handleCustomHeadlineGenerate = () => {
    const h = customHeadline.trim();
    if (!h) return;
    setPendingTeletipo({ headline: h, topicName: '', isCustom: true });
  };

  const handleConfirmGenerate = async () => {
    if (!pendingTeletipo) return;
    const contextParts = [speakerWho, speakerWhere].filter(Boolean);
    const speakerContext = contextParts.length ? contextParts.join(' — ') : undefined;
    const { headline, topicName, isCustom } = pendingTeletipo;
    setPendingTeletipo(null);
    setSpeakerWho('');
    setSpeakerWhere('');
    setIsTeletipoLoading(true);
    try {
      let transcriptionSource = buildTranscriptionText();
      if (isCustom) {
        setTeletipoLoadingMsg('Analizando transcripción...');
        transcriptionSource = await geminiService.extractRelevantFragments(transcriptionSource, headline);
        setTeletipoLoadingMsg('Redactando teletipo...');
      }
      const teletipo = await geminiService.generateTeletipoFromText(
        transcriptionSource, topicName, headline, speakerContext
      );
      setTeletipoOverlay(teletipo);
      onSaveTeletipo?.(teletipo, `Teletipo — ${headline}`);
    } catch {
      // silently fail — toast will disappear
    } finally {
      setIsTeletipoLoading(false);
      setTeletipoLoadingMsg('Redactando teletipo...');
    }
  };

  const [selection, setSelection] = useState<{ text: string, x: number, y: number } | null>(null);

  const handleSelection = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelection({
        text: sel.toString().trim(),
        x: rect.left + rect.width / 2,
        y: rect.top - 40
      });
    } else {
      setSelection(null);
    }
  };

  const handleVerifySelection = () => {
    if (!selection || result.isVerifyingManual) return;
    if (onManualVerify) {
      onManualVerify(selection.text);
    }
    setSelection(null);
  };

  return (
    <div className="flex flex-col gap-10 relative">
      {/* Floating Verification Button */}
      {selection && (
        <button
          onClick={handleVerifySelection}
          className="fixed z-[60] bg-servimedia-pink text-white px-4 py-2 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl animate-in zoom-in-95 flex items-center gap-2 hover:scale-105 transition-all"
          style={{ left: selection.x, top: selection.y, transform: 'translateX(-50%)' }}
        >
          {result.isVerifyingManual ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
          Verificar Dato
        </button>
      )}

      {/* Cabecera Multimedia con Controles de Reproducción */}
      {mediaUrl && (

        <div className="bg-servimedia-gray rounded-[2rem] p-4 shadow-2xl flex flex-col gap-4 overflow-hidden">
          <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-inner border border-white/5 relative group lg:hidden">
            {isVideo ? (
              <video ref={mediaRef as any} src={mediaUrl} className="w-full h-full object-contain" controls />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-servimedia-gray to-black">
                <audio ref={mediaRef as any} src={mediaUrl} className="hidden" />
                <button onClick={togglePlay} className="transition-transform active:scale-95">
                  {isPlaying ? <PauseCircle className="w-16 h-16 text-servimedia-pink" /> : <PlayCircle className="w-16 h-16 text-servimedia-pink" />}
                </button>
              </div>
            )}
          </div>
          <div className="hidden lg:block w-full lg:w-1/3 aspect-video bg-black rounded-2xl overflow-hidden">
            {isVideo ? (
              <video ref={mediaRef as any} src={mediaUrl} className="w-full h-full object-contain" controls />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-servimedia-gray to-black">
                <audio ref={mediaRef as any} src={mediaUrl} className="hidden" />
                <button onClick={togglePlay} className="transition-transform hover:scale-110 active:scale-95">
                  {isPlaying ? <PauseCircle className="w-20 h-20 text-servimedia-pink shadow-xl" /> : <PlayCircle className="w-20 h-20 text-servimedia-pink shadow-xl" />}
                </button>
                <span className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em]">Audio Master</span>
              </div>
            )}
          </div>
          <div className="flex flex-row items-center justify-between w-full gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-white text-base md:text-2xl font-black tracking-tighter mb-1 truncate">{audioFile?.name}</h3>
              <div className="flex items-center gap-3">
                <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.2em] hidden sm:block">Archivo procesado</p>
                <button
                  onClick={togglePlay}
                  className="text-white/60 hover:text-servimedia-pink flex items-center gap-2 text-[9px] font-black uppercase tracking-widest bg-white/5 px-2 py-1 rounded-lg transition-colors"
                >
                  {isPlaying ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pausar' : 'Play'}
                </button>
              </div>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="bg-servimedia-pink text-white px-4 py-3 md:px-8 md:py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-servimedia-pink/20 shrink-0"
            >
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Descargar</span> PDF
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
        <div className="lg:col-span-4 space-y-6 md:space-y-10">
          {/* Temas Clave Redefinidos */}
          <div className="bg-white p-5 md:p-10 rounded-[2rem] border border-servimedia-border shadow-sm">
            <h3 className="text-[11px] font-black text-servimedia-pink uppercase tracking-[0.4em] mb-5 md:mb-10 border-b border-servimedia-border pb-4 md:pb-6 flex items-center gap-3">
              <List className="w-5 h-5" /> Definición de Contenido
            </h3>
            <div className="space-y-5 md:space-y-8">
              {(result.topics || []).map((t, i) => (
                <div key={i} className="group">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-black text-servimedia-gray uppercase tracking-tighter flex items-center gap-2">
                      <div className="h-2 w-2 bg-servimedia-pink rounded-full shrink-0 mt-0.5"></div>
                      {t.name}
                    </h4>
                    <button
                      onClick={() => topicHeadlines?.topicIndex === i && !topicHeadlines.isLoading
                        ? setTopicHeadlines(null)
                        : handleGenerateTeletipoForTopic(t, i)}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 bg-servimedia-pink/10 text-servimedia-pink rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-servimedia-pink/20 transition-colors"
                    >
                      {topicHeadlines?.topicIndex === i && topicHeadlines.isLoading
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <FileText className="w-3 h-3" />}
                      Teletipo
                    </button>
                  </div>
                  <p className="text-sm text-servimedia-gray/60 leading-relaxed italic border-l border-servimedia-border pl-4">
                    {t.description}
                  </p>
                  {/* Inline headline picker */}
                  {topicHeadlines?.topicIndex === i && !topicHeadlines.isLoading && topicHeadlines.headlines.length > 0 && (
                    <div className="mt-3 pl-4 border-l-2 border-servimedia-pink/30 space-y-1 animate-in slide-in-from-top-2 fade-in">
                      <p className="text-[9px] font-black text-servimedia-pink uppercase tracking-widest mb-2">
                        Selecciona un titular:
                      </p>
                      {topicHeadlines.headlines.map((h, j) => (
                        <button
                          key={j}
                          onClick={() => handleSelectHeadline(h, t.name)}
                          className="w-full text-left text-sm font-serif italic text-servimedia-gray hover:text-servimedia-pink hover:bg-servimedia-pink/5 rounded-xl px-3 py-2 transition-colors leading-snug"
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-5 md:p-10 rounded-[2rem] border border-servimedia-border shadow-sm">
            <h3 className="text-[11px] font-black text-servimedia-orange uppercase tracking-[0.4em] mb-5 md:mb-10 border-b border-servimedia-border pb-4 md:pb-6 flex items-center gap-3">
              <Sparkles className="w-5 h-5" /> Titulares Sugeridos
            </h3>
            <div className="space-y-5 md:space-y-8">
              {(result.suggestedHeadlines || []).map((h, i) => (
                <button
                  key={i}
                  onClick={() => handleHeadlineClick(h)}
                  className="w-full text-left text-base md:text-xl font-serif font-black text-servimedia-gray italic leading-snug border-l-4 border-servimedia-orange pl-4 md:pl-6 hover:text-servimedia-orange transition-colors group"
                  title="Clic para generar teletipo con este titular"
                >
                  <span>{h}</span>
                  <span className="block text-[9px] font-sans font-black text-servimedia-orange/0 group-hover:text-servimedia-orange/60 uppercase tracking-widest mt-1 transition-colors">
                    → Generar teletipo
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom headline input */}
          <div className="bg-white p-5 md:p-10 rounded-[2rem] border border-servimedia-border shadow-sm">
            <h3 className="text-[11px] font-black text-servimedia-orange uppercase tracking-[0.4em] mb-5 md:mb-10 border-b border-servimedia-border pb-4 md:pb-6 flex items-center gap-3">
              <PenLine className="w-5 h-5" /> Tu propio titular
            </h3>
            <div className="space-y-4">
              <textarea
                value={customHeadline}
                onChange={e => setCustomHeadline(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCustomHeadlineGenerate(); } }}
                placeholder="Escribe el titular exacto que quieres desarrollar..."
                rows={3}
                className="w-full border border-servimedia-border rounded-xl px-4 py-3 text-sm md:text-base font-serif text-servimedia-gray outline-none focus:border-servimedia-orange resize-none transition-colors"
              />
              <button
                onClick={handleCustomHeadlineGenerate}
                disabled={!customHeadline.trim()}
                className="w-full py-3 rounded-xl bg-servimedia-orange text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Generar teletipo →
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white rounded-[2rem] md:rounded-[3rem] border border-servimedia-border shadow-sm overflow-hidden flex flex-col min-h-[500px] md:min-h-[800px]">
          <div className="flex bg-servimedia-light/50 border-b border-servimedia-border overflow-x-auto">
            {[
              { id: 'transcript', label: 'Transcripción', labelFull: 'Transcripción Íntegra' },
              { id: 'verificador', label: 'Verificación', labelFull: 'Verificación Datos' },
              { id: 'chat', label: 'Chat', labelFull: 'Consultar Fuente' },
              { id: 'social', label: 'RRSS', labelFull: 'Hilo RRSS' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as Tab)}
                className={`flex-shrink-0 flex-grow px-3 md:px-4 py-4 md:py-7 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] transition-all border-r border-servimedia-border last:border-r-0 whitespace-nowrap ${activeTab === t.id ? 'bg-white text-servimedia-pink border-t-4 border-t-servimedia-pink' : 'text-servimedia-gray/30 hover:text-servimedia-gray hover:bg-white'}`}
              >
                <span className="md:hidden">{t.label}</span>
                <span className="hidden md:inline">{t.labelFull}</span>
              </button>
            ))}
          </div>

          <div className="p-4 md:p-12 flex-grow">
            {activeTab === 'transcript' && (
              <div className="space-y-6 md:space-y-14" onMouseUp={handleSelection}>
                {(result.transcription || []).map((s, i) => {
                  const isActive = isSegmentActive(s.timestamp, result.transcription[i + 1]?.timestamp);
                  return (
                    <div key={i} className={`flex gap-3 md:gap-10 group animate-in slide-in-from-left-4 fade-in transition-all ${isActive ? 'md:translate-x-4' : ''}`}>
                      <button
                        onClick={() => handleTimestampClick(s.timestamp)}
                        className={`flex items-center gap-2 text-[9px] font-black px-3 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl h-fit transition-all whitespace-nowrap shadow-sm border-2 ${isActive ? 'bg-servimedia-pink text-white border-servimedia-pink' : 'text-servimedia-pink bg-servimedia-pink/5 border-transparent hover:border-servimedia-pink/20'}`}
                      >
                        {isActive && isPlaying ? <PauseCircle className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <PlayCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                        {s.timestamp}
                      </button>
                      <p className={`text-base md:text-2xl font-serif leading-relaxed flex-grow selection:bg-servimedia-pink/10 transition-colors ${isActive ? 'text-servimedia-pink font-bold' : 'text-servimedia-gray'}`}>
                        {s.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex flex-col h-[600px]">
                <div className="flex-grow overflow-y-auto mb-8 space-y-6 pr-6 custom-scrollbar">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-32">
                      <MessageSquare className="w-16 h-16 text-servimedia-gray/5 mx-auto mb-6" />
                      <p className="text-servimedia-gray/30 font-serif italic text-2xl">¿Desea extraer alguna cifra o declaración específica?</p>
                    </div>
                  )}
                  {chatHistory.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-6 rounded-[2rem] text-base leading-relaxed ${m.role === 'user' ? 'bg-servimedia-pink text-white shadow-xl shadow-servimedia-pink/20' : 'bg-servimedia-light text-servimedia-gray border border-servimedia-border'}`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {result.isVerifyingManual && <Loader2 className="w-8 h-8 animate-spin text-servimedia-pink mx-auto mt-4" />}
                </div>
                <div className="flex gap-4 p-2 bg-servimedia-light rounded-[2.5rem]">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Ej: ¿Qué dijo sobre el empleo para jóvenes?"
                    className="flex-grow p-6 bg-transparent border-none outline-none font-sans text-lg placeholder:text-servimedia-gray/20"
                  />
                  <button onClick={handleSendMessage} className="bg-servimedia-pink text-white p-6 rounded-full shadow-lg hover:scale-105 transition-all">
                    <Send className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'verificador' && (
              <div className="space-y-8 animate-in fade-in">
                {/* Automatic Fact Checks */}
                {result.factChecks && result.factChecks.length > 0 && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[10px] font-black text-servimedia-pink uppercase tracking-[0.4em] mb-2">Verificaciones Automáticas</h4>
                      <p className="text-xs text-servimedia-gray/40 italic">⚠️ Estas verificaciones se basan en la base de datos de Gemini, no en búsquedas en tiempo real</p>
                    </div>
                    {result.factChecks.map((c, i) => (
                      <div key={i} className="p-8 border-2 border-servimedia-border rounded-3xl hover:border-servimedia-pink/20 transition-all space-y-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className={`w-5 h-5 ${c.verdict === 'Verdadero' ? 'text-green-500' : 'text-servimedia-pink'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${c.verdict === 'Verdadero' ? 'bg-green-100 text-green-700' : 'bg-servimedia-pink/10 text-servimedia-pink'}`}>
                            {c.verdict}
                          </span>
                        </div>
                        <p className="text-2xl font-serif font-black text-servimedia-gray leading-tight">"{c.claim}"</p>
                        <p className="text-lg text-servimedia-gray/50 leading-relaxed italic">{c.explanation}</p>
                        {c.sources && c.sources.length > 0 && (
                          <div className="pt-4 flex flex-wrap gap-3 border-t border-servimedia-border/10">
                            {c.sources.map((src: any, si: number) => (
                              <a
                                key={si}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-[9px] font-black text-servimedia-pink/60 hover:text-servimedia-pink uppercase tracking-widest bg-servimedia-pink/5 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <Share2 className="w-3 h-3" /> {src.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual Fact Checks */}
                {(result.manualFactChecks || []).length > 0 && (
                  <div className="space-y-6 pt-10 border-t border-servimedia-border">
                    <h4 className="text-[10px] font-black text-servimedia-orange uppercase tracking-[0.4em] mb-4">Verificaciones Solicitadas</h4>
                    {(result.manualFactChecks || []).map((c, i) => (
                      <div key={i} className="p-8 border-2 border-servimedia-orange/20 bg-servimedia-orange/5 rounded-3xl space-y-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className={`w-5 h-5 ${c.verdict === 'Verdadero' ? 'text-green-500' : 'text-servimedia-orange'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${c.verdict === 'Verdadero' ? 'bg-green-100 text-green-700' : 'bg-servimedia-orange/10 text-servimedia-orange'}`}>
                            {c.verdict}
                          </span>
                        </div>
                        <p className="text-2xl font-serif font-black text-servimedia-gray leading-tight">"{c.claim}"</p>
                        <p className="text-lg text-servimedia-gray/50 leading-relaxed italic">{c.explanation}</p>
                        {c.sources && c.sources.length > 0 && (
                          <div className="pt-4 flex flex-wrap gap-3 border-t border-servimedia-orange/10">
                            {c.sources.map((src: any, si: number) => (
                              <a
                                key={si}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-[9px] font-black text-servimedia-orange/60 hover:text-servimedia-orange uppercase tracking-widest bg-servimedia-orange/5 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <Share2 className="w-3 h-3" /> {src.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {(!result.factChecks || result.factChecks.length === 0) && (!result.manualFactChecks || result.manualFactChecks.length === 0) && !result.isVerifyingManual && (
                  <p className="text-center py-20 text-servimedia-gray/20 font-serif italic text-xl">
                    No hay verificaciones automáticas. <br />
                    <span className="text-sm font-sans uppercase font-black tracking-widest opacity-50">Selecciona texto en la transcripción para verificar datos manualmente.</span>
                  </p>
                )}
                {result.isVerifyingManual && (
                  <div className="text-center py-20 animate-pulse">
                    <Loader2 className="w-12 h-12 animate-spin text-servimedia-orange mx-auto mb-6" />
                    <p className="text-servimedia-orange font-black uppercase tracking-widest text-xs">Consultando fuentes oficiales en segundo plano...</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'social' && (
              <div className="space-y-10 animate-in fade-in">
                <div className="mb-8 p-8 bg-servimedia-pink/5 rounded-3xl border border-servimedia-pink/10">
                  <h4 className="text-[10px] font-black text-servimedia-pink uppercase tracking-[0.4em] mb-4">Titular Sugerido para el Hilo</h4>
                  <p className="text-3xl font-serif font-black text-servimedia-gray italic leading-tight">
                    {result.suggestedHeadlines?.[0] || 'Hilo Informativo de Servimedia'}
                  </p>
                </div>

                <div className="space-y-6">
                  {(result.socialThreads || []).map((t, i) => (
                    <div key={i} className="p-10 bg-servimedia-light rounded-[2.5rem] relative border-l-[12px] border-servimedia-pink hover:translate-x-2 transition-transform shadow-sm">
                      <span className="absolute -left-5 top-1/2 -translate-y-1/2 w-10 h-10 bg-servimedia-pink text-white rounded-full flex items-center justify-center font-black text-xs shadow-lg">
                        {i + 1}
                      </span>
                      <p className="text-2xl font-serif text-servimedia-gray leading-relaxed selection:bg-servimedia-pink/10">{t}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-16 p-10 bg-servimedia-gray rounded-[2.5rem] text-white/80 shadow-2xl">
                  <div className="flex items-center gap-3 text-servimedia-orange mb-6">
                    <Info className="w-6 h-6" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.5em]">Contexto del Contenido</h4>
                  </div>
                  <p className="text-xl font-serif leading-relaxed italic opacity-70">
                    Este hilo se ha estructurado siguiendo la línea editorial de la agencia y basándose en los temas principales detectados en el audio "{audioFile?.name}". Se recomienda adjuntar material gráfico o video-clips de apoyo.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Context modal — appears before generating, fields are optional */}
      {pendingTeletipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-8 shadow-2xl w-full max-w-lg space-y-6 animate-in zoom-in-95">
            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-servimedia-pink">
              Contexto del teletipo <span className="text-servimedia-gray/40">(opcional)</span>
            </h3>
            <p className="text-sm font-serif italic text-servimedia-gray/60 border-l-4 border-servimedia-pink/20 pl-4 leading-snug">
              "{pendingTeletipo.headline}"
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-servimedia-gray/50 block mb-1.5">
                  ¿Quién habla?
                </label>
                <input
                  value={speakerWho}
                  onChange={e => setSpeakerWho(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmGenerate()}
                  placeholder="Ej: Pedro Sánchez, presidente del Gobierno"
                  className="w-full border border-servimedia-border rounded-xl px-4 py-3 text-sm text-servimedia-gray outline-none focus:border-servimedia-pink transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-servimedia-gray/50 block mb-1.5">
                  ¿Dónde y cuándo?
                </label>
                <input
                  value={speakerWhere}
                  onChange={e => setSpeakerWhere(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmGenerate()}
                  placeholder="Ej: Rueda de prensa en La Moncloa, 5 de marzo de 2026"
                  className="w-full border border-servimedia-border rounded-xl px-4 py-3 text-sm text-servimedia-gray outline-none focus:border-servimedia-pink transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setPendingTeletipo(null); setSpeakerWho(''); setSpeakerWhere(''); }}
                className="flex-1 py-3 rounded-xl border border-servimedia-border text-sm font-black text-servimedia-gray/50 hover:text-servimedia-gray transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmGenerate}
                className="flex-1 py-3 rounded-xl bg-servimedia-pink text-white text-sm font-black hover:opacity-90 transition-opacity"
              >
                Generar teletipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking toast while generating */}
      {isTeletipoLoading && (
        <div className="fixed bottom-6 right-6 z-50 bg-white shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-3 border border-servimedia-border animate-in slide-in-from-bottom-4">
          <div className="w-4 h-4 border-2 border-servimedia-pink border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-xs font-black text-servimedia-gray uppercase tracking-widest">{teletipoLoadingMsg}</p>
        </div>
      )}

      {/* Teletipo result overlay */}
      {teletipoOverlay && (
        <div className="fixed inset-0 z-40 bg-servimedia-light overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
            <button
              onClick={() => setTeletipoOverlay(null)}
              className="flex items-center gap-2 text-sm font-black text-servimedia-gray hover:text-servimedia-pink transition-colors uppercase tracking-widest"
            >
              <ArrowLeft className="w-4 h-4" /> Volver al análisis
            </button>
            <h2 className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-pink">
              Teletipo Generado
            </h2>
            <PressReleaseResultComponent result={teletipoOverlay} pdfFile={null} />
          </div>
        </div>
      )}
    </div>
  );
};
