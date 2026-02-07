
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { AnalysisResult as AnalysisResultType } from '../types';
import { FileText, List, Download, PlayCircle, PauseCircle, MessageSquare, Share2, Send, Sparkles, ShieldCheck, Info, Loader2 } from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1';

interface AnalysisResultProps {
  result: AnalysisResultType;
  audioFile: File | null;
}

type Tab = 'transcript' | 'chat' | 'verificador' | 'social';

export const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, audioFile }) => {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('transcript');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string, text: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const isVideo = audioFile?.type.startsWith('video/');
  const mediaUrl = useMemo(() => audioFile ? URL.createObjectURL(audioFile) : null, [audioFile]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    return () => {
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
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
      mediaRef.current.currentTime = seconds;
      mediaRef.current.play();
    }
  };

  const handleDownloadPDF = async () => {
    const doc = new jsPDF();
    const margin = 20;
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

    doc.text(splitText, margin, y);
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

  const [manualFactChecks, setManualFactChecks] = useState<any[]>(result.manualFactChecks || []);
  const [selection, setSelection] = useState<{ text: string, x: number, y: number } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

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

  const handleVerifySelection = async () => {
    if (!selection || isVerifying) return;
    setIsVerifying(true);
    try {
      const factCheck = await geminiService.verifyManualSelection(selection.text);
      const updatedManual = [...manualFactChecks, factCheck];
      setManualFactChecks(updatedManual);

      // Update entry in history if possible
      const saved = localStorage.getItem('servimedia_history_v5');
      if (saved) {
        const history = JSON.parse(saved);
        // More robust matching: try to match by ID or fileName and date
        const itemIndex = history.findIndex((h: any) =>
          (h.data.transcription && h.data.transcription[0]?.text === result.transcription[0]?.text) ||
          (h.fileName === audioFile?.name && h.mode === 'AUDIO')
        );
        if (itemIndex !== -1) {
          history[itemIndex].data.manualFactChecks = updatedManual;
          localStorage.setItem('servimedia_history_v5', JSON.stringify(history));
        }
      }

      setActiveTab('verificador');
      setSelection(null);
    } catch (e) {
      console.error(e);
      alert("Error al verificar el dato.");
    } finally {
      setIsVerifying(false);
    }
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
          {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
          Verificar Dato
        </button>
      )}

      {/* Cabecera Multimedia con Controles de Reproducción */}
      {mediaUrl && (

        <div className="bg-servimedia-gray rounded-[2.5rem] p-4 lg:p-6 shadow-2xl flex flex-col lg:flex-row items-center gap-8 overflow-hidden">
          <div className="w-full lg:w-1/3 aspect-video bg-black rounded-2xl overflow-hidden shadow-inner border border-white/5 relative group">
            {isVideo ? (
              <video
                ref={mediaRef as any}
                src={mediaUrl}
                className="w-full h-full object-contain"
                controls
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-servimedia-gray to-black">
                <audio ref={mediaRef as any} src={mediaUrl} className="hidden" />
                <button
                  onClick={togglePlay}
                  className="transition-transform hover:scale-110 active:scale-95"
                >
                  {isPlaying ? (
                    <PauseCircle className="w-20 h-20 text-servimedia-pink shadow-xl" />
                  ) : (
                    <PlayCircle className="w-20 h-20 text-servimedia-pink shadow-xl" />
                  )}
                </button>
                <span className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em]">Audio Master</span>
              </div>
            )}
          </div>
          <div className="flex-grow flex flex-col lg:flex-row justify-between items-center w-full gap-6">
            <div className="text-center lg:text-left">
              <h3 className="text-white text-2xl font-black tracking-tighter mb-2">{audioFile?.name}</h3>
              <div className="flex items-center gap-4 justify-center lg:justify-start">
                <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.3em]">Archivo de entrada procesado</p>
                <button
                  onClick={togglePlay}
                  className="text-white/60 hover:text-servimedia-pink flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg transition-colors"
                >
                  {isPlaying ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                  {isPlaying ? 'Pausar' : 'Reproducir'}
                </button>
              </div>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="bg-servimedia-pink text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3 hover:scale-105 transition-all shadow-lg shadow-servimedia-pink/20"
            >
              <Download className="w-4 h-4" /> Descargar PDF
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4 space-y-10">
          {/* Temas Clave Redefinidos */}
          <div className="bg-white p-10 rounded-[2.5rem] border border-servimedia-border shadow-sm">
            <h3 className="text-[11px] font-black text-servimedia-pink uppercase tracking-[0.4em] mb-10 border-b border-servimedia-border pb-6 flex items-center gap-3">
              <List className="w-5 h-5" /> Definición de Contenido
            </h3>
            <div className="space-y-8">
              {(result.topics || []).map((t, i) => (
                <div key={i} className="group">
                  <h4 className="text-sm font-black text-servimedia-gray uppercase tracking-tighter mb-2 flex items-center gap-2">
                    <div className="h-2 w-2 bg-servimedia-pink rounded-full"></div>
                    {t.name}
                  </h4>
                  <p className="text-sm text-servimedia-gray/60 leading-relaxed italic border-l border-servimedia-border pl-4">
                    {t.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-10 rounded-[2.5rem] border border-servimedia-border shadow-sm">
            <h3 className="text-[11px] font-black text-servimedia-orange uppercase tracking-[0.4em] mb-10 border-b border-servimedia-border pb-6 flex items-center gap-3">
              <Sparkles className="w-5 h-5" /> Titulares Sugeridos
            </h3>
            <div className="space-y-8">
              {(result.suggestedHeadlines || []).map((h, i) => (
                <p key={i} className="text-xl font-serif font-black text-servimedia-gray italic leading-snug border-l-4 border-servimedia-orange pl-6 hover:text-servimedia-orange transition-colors">
                  {h}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white rounded-[3rem] border border-servimedia-border shadow-sm overflow-hidden flex flex-col min-h-[800px]">
          <div className="flex bg-servimedia-light/50 border-b border-servimedia-border">
            {[
              { id: 'transcript', label: 'Transcripción Íntegra' },
              { id: 'verificador', label: 'Verificación Datos' },
              { id: 'chat', label: 'Consultar Fuente' },
              { id: 'social', label: 'Hilo RRSS' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as Tab)}
                className={`flex-grow px-4 py-7 text-[10px] font-black uppercase tracking-[0.3em] transition-all border-r border-servimedia-border last:border-r-0 ${activeTab === t.id ? 'bg-white text-servimedia-pink border-t-4 border-t-servimedia-pink' : 'text-servimedia-gray/30 hover:text-servimedia-gray hover:bg-white'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-12 flex-grow">
            {activeTab === 'transcript' && (
              <div className="space-y-14" onMouseUp={handleSelection}>
                {(result.transcription || []).map((s, i) => (
                  <div key={i} className="flex gap-10 group animate-in slide-in-from-left-4 fade-in">
                    <button
                      onClick={() => handleTimestampClick(s.timestamp)}
                      className="text-[10px] font-black text-servimedia-pink bg-servimedia-pink/5 px-4 py-2.5 rounded-xl h-fit hover:bg-servimedia-pink hover:text-white transition-all whitespace-nowrap shadow-sm"
                    >
                      {s.timestamp}
                    </button>
                    <p className="text-2xl font-serif text-servimedia-gray leading-relaxed flex-grow selection:bg-servimedia-pink/10">
                      {s.text}
                    </p>
                  </div>
                ))}
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
                  {isChatLoading && <Loader2 className="w-8 h-8 animate-spin text-servimedia-pink mx-auto mt-4" />}
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
                    <h4 className="text-[10px] font-black text-servimedia-pink uppercase tracking-[0.4em] mb-4">Verificaciones Automáticas</h4>
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
                {manualFactChecks.length > 0 && (
                  <div className="space-y-6 pt-10 border-t border-servimedia-border">
                    <h4 className="text-[10px] font-black text-servimedia-orange uppercase tracking-[0.4em] mb-4">Verificaciones Solicitadas</h4>
                    {manualFactChecks.map((c, i) => (
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

                {(!result.factChecks || result.factChecks.length === 0) && manualFactChecks.length === 0 && (
                  <p className="text-center py-20 text-servimedia-gray/20 font-serif italic text-xl">
                    No hay verificaciones automáticas. <br />
                    <span className="text-sm font-sans uppercase font-black tracking-widest opacity-50">Selecciona texto en la transcripción para verificar datos manualmente.</span>
                  </p>
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
    </div>
  );
};
