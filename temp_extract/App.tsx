
import React, { useState, useEffect } from 'react';
import { Mic2, FileText, ChevronRight, Loader2, Newspaper, History as HistoryIcon, Target, Clock, Layout, PenTool, MapPin } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { AnalysisResult } from './components/AnalysisResult';
import { PressReleaseResult } from './components/PressReleaseResult';
import { WritingAssistant } from './components/WritingAssistant';
import { PressSummary } from './components/PressSummary';
import { HistoryDrawer } from './components/HistoryDrawer';
import { AppStatus, FileState, AnalysisResult as AnalysisResultType, PressReleaseResult as PressReleaseResultType, AppMode, HistoryItem, PressSummaryResult } from './types';
import { geminiService } from './services/geminiService';

const RobotLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect x="25" y="35" width="50" height="45" rx="10" fill="#3B82F6" />
    <rect x="30" y="40" width="40" height="35" rx="5" fill="white" fillOpacity="0.2" />
    <circle cx="40" cy="55" r="4" fill="white" />
    <circle cx="60" cy="55" r="4" fill="white" />
    <circle cx="37" cy="65" r="1.2" fill="#F28E1C" />
    <circle cx="43" cy="65" r="1.2" fill="#F28E1C" />
    <circle cx="40" cy="68" r="1.2" fill="#F28E1C" />
    <circle cx="57" cy="65" r="1.2" fill="#F28E1C" />
    <circle cx="63" cy="65" r="1.2" fill="#F28E1C" />
    <circle cx="60" cy="68" r="1.2" fill="#F28E1C" />
    <path d="M45 72 Q50 75 55 72" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <circle cx="30" cy="35" r="8.5" fill="#1E40AF" />
    <circle cx="40" cy="28" r="9.5" fill="#1E40AF" />
    <circle cx="55" cy="25" r="10.5" fill="#1E40AF" />
    <circle cx="70" cy="30" r="9.5" fill="#1E40AF" />
    <circle cx="75" cy="42" r="7.5" fill="#1E40AF" />
    <circle cx="25" cy="45" r="7.5" fill="#1E40AF" />
    <line x1="50" y1="25" x2="50" y2="12" stroke="#1E40AF" strokeWidth="3" />
    <circle cx="50" cy="10" r="3.5" fill="#E50051" />
  </svg>
);

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.AUDIO);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [fileState, setFileState] = useState<FileState>({ file: null, base64: null, mimeType: null });
  const [userAngle, setUserAngle] = useState('');
  const [audioResult, setAudioResult] = useState<AnalysisResultType | null>(null);
  const [pressResult, setPressResult] = useState<PressReleaseResultType | null>(null);
  const [summaryResult, setSummaryResult] = useState<PressSummaryResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('servimedia_history_v5'); // Updated version key
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Basic validation: ensure it's an array before setting
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        } else {
          console.warn("Historia cargada de localStorage no es un array. Limpiando historial.");
          localStorage.removeItem('servimedia_history_v5'); // Clear invalid data
          setHistory([]); // Initialize with empty history
        }
      } catch (e) {
        console.error("Error al parsear historial de localStorage:", e);
        localStorage.removeItem('servimedia_history_v5'); // Clear corrupted data
        setHistory([]); // Initialize with empty history
      }
    }
  }, []);

  const saveToHistory = (data: any, currentMode: AppMode, fileName: string) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      fileName: fileName,
      mode: currentMode,
      data: data
    };
    const updatedHistory = [newItem, ...history].slice(0, 50);
    setHistory(updatedHistory);
    localStorage.setItem('servimedia_history_v5', JSON.stringify(updatedHistory)); // Updated version key
  };

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
    handleClear();
    if (newMode === AppMode.PRESS_SUMMARY) {
      startPressSummary();
    }
  };

  const startPressSummary = async () => {
    setStatus(AppStatus.PROCESSING);
    try {
      const data = await geminiService.fetchMadridPressSummary();
      setSummaryResult(data);
      saveToHistory(data, AppMode.PRESS_SUMMARY, `Resumen Madrid ${new Date().toLocaleDateString()}`);
      setStatus(AppStatus.COMPLETED);
    } catch (e) {
      console.error(e);
      setStatus(AppStatus.ERROR);
    }
  };

  const handleFileSelected = (newState: FileState) => {
    setFileState(newState);
    setAudioResult(null);
    setPressResult(null);
    setStatus(AppStatus.IDLE);
  };

  const handleClear = () => {
    setFileState({ file: null, base64: null, mimeType: null });
    setAudioResult(null);
    setPressResult(null);
    setSummaryResult(null);
    setStatus(AppStatus.IDLE);
    setUserAngle('');
  };

  const startAnalysis = async () => {
    if (!fileState.base64 || !fileState.mimeType) return;
    setStatus(AppStatus.PROCESSING);
    try {
      if (mode === AppMode.AUDIO) {
        const data = await geminiService.processAudio(fileState.base64, fileState.mimeType);
        setAudioResult(data);
        if (fileState.file) saveToHistory(data, AppMode.AUDIO, fileState.file.name);
      } else {
        const data = await geminiService.processPressRelease(fileState.base64, fileState.mimeType, userAngle);
        setPressResult(data);
        if (fileState.file) saveToHistory(data, AppMode.PRESS_RELEASE, fileState.file.name);
      }
      setStatus(AppStatus.COMPLETED);
    } catch (error) {
      console.error(error);
      setStatus(AppStatus.ERROR);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-servimedia-light font-sans">
      <div className="h-2 w-full flex">
        <div className="h-full w-1/2 bg-servimedia-pink"></div>
        <div className="h-full w-1/2 bg-servimedia-orange"></div>
      </div>

      <nav className="bg-white border-b border-servimedia-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex justify-between h-24 items-center">
            <div className="flex items-center gap-5 cursor-pointer group" onClick={handleClear}>
              <RobotLogo className="w-16 h-16 transform transition-transform group-hover:scale-110 duration-500" />
              <div className="flex flex-col items-start">
                <div className="flex items-center text-4xl font-black tracking-tighter leading-none">
                  <span className="text-servimedia-pink">servimed-</span>
                  <span className="text-servimedia-orange inline-block animate-pulse ml-0.5">IA</span>
                </div>
                <span className="text-[9px] font-black text-servimedia-gray/40 uppercase tracking-[0.25em] ml-0.5 mt-2">
                  Powered by Javier Aldea & Gemini
                </span>
              </div>
            </div>

            <div className="hidden md:flex gap-2 h-full">
              <button onClick={() => handleModeChange(AppMode.AUDIO)} className={`flex items-center gap-2 px-4 h-full border-b-4 transition-all font-black text-[10px] uppercase tracking-[0.1em] ${mode === AppMode.AUDIO ? 'border-servimedia-pink text-servimedia-pink bg-servimedia-pink/5' : 'border-transparent text-servimedia-gray hover:text-servimedia-pink'}`}>
                <Mic2 className="w-3.5 h-3.5" /> Audio a Texto
              </button>
              <button onClick={() => handleModeChange(AppMode.PRESS_RELEASE)} className={`flex items-center gap-2 px-4 h-full border-b-4 transition-all font-black text-[10px] uppercase tracking-[0.1em] ${mode === AppMode.PRESS_RELEASE ? 'border-servimedia-orange text-servimedia-orange bg-servimedia-orange/5' : 'border-transparent text-servimedia-gray hover:text-servimedia-orange'}`}>
                <Newspaper className="w-3.5 h-3.5" /> Notas de Prensa
              </button>
              <button onClick={() => handleModeChange(AppMode.WRITING_ASSISTANT)} className={`flex items-center gap-2 px-4 h-full border-b-4 transition-all font-black text-[10px] uppercase tracking-[0.1em] ${mode === AppMode.WRITING_ASSISTANT ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-servimedia-gray hover:text-blue-500'}`}>
                <PenTool className="w-3.5 h-3.5" /> Asistente Redacción
              </button>
              <button onClick={() => handleModeChange(AppMode.PRESS_SUMMARY)} className={`flex items-center gap-2 px-4 h-full border-b-4 transition-all font-black text-[10px] uppercase tracking-[0.1em] ${mode === AppMode.PRESS_SUMMARY ? 'border-blue-800 text-blue-800 bg-blue-800/5' : 'border-transparent text-servimedia-gray hover:text-blue-800'}`}>
                <MapPin className="w-3.5 h-3.5" /> Resumen Madrid <span className="text-[8px] font-black ml-1">(Beta)</span>
              </button>
            </div>

            <div className="flex items-center gap-6">
              <button onClick={() => setIsHistoryOpen(true)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40 hover:text-servimedia-pink transition-colors">
                <HistoryIcon className="w-5 h-5" />
                <span className="hidden lg:inline">Archivo</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <HistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={(item) => { setMode(item.mode); if (item.mode === AppMode.AUDIO) setAudioResult(item.data as AnalysisResultType); else if (item.mode === AppMode.PRESS_RELEASE) setPressResult(item.data as PressReleaseResultType); else if (item.mode === AppMode.PRESS_SUMMARY) setSummaryResult(item.data as PressSummaryResult); setStatus(AppStatus.COMPLETED); setIsHistoryOpen(false); }} onDelete={(id) => { const updated = history.filter(h => h.id !== id); setHistory(updated); localStorage.setItem('servimedia_history_v5', JSON.stringify(updated)); }} />

      <main className="flex-grow max-w-7xl mx-auto w-full py-16 px-4 lg:px-8">
        {status === AppStatus.IDLE && mode !== AppMode.WRITING_ASSISTANT && mode !== AppMode.PRESS_SUMMARY && (
          <div className="text-center mb-16 animate-in fade-in duration-1000">
            <h1 className="text-7xl font-black tracking-tighter text-servimedia-gray mb-6 leading-tight">
              {mode === AppMode.AUDIO ? (<>De <span className="text-servimedia-pink">Audio</span> a Texto</>) : (<>Procesador <span className="text-servimedia-orange">Notas de Prensa</span></>)}
            </h1>
            <p className="text-servimedia-gray/30 text-2xl max-w-2xl mx-auto font-medium leading-relaxed italic border-l-4 border-servimedia-border pl-6">
              Optimización de la redacción y el análisis de contenidos mediante inteligencia artificial generativa.
            </p>
          </div>
        )}

        {mode === AppMode.WRITING_ASSISTANT && <WritingAssistant />}
        
        {mode === AppMode.PRESS_SUMMARY && (
          <>
            {status === AppStatus.PROCESSING && (
              <div className="flex flex-col items-center justify-center py-40 animate-in zoom-in-95">
                <div className="w-28 h-28 border-8 border-t-transparent rounded-full animate-spin mb-12 border-blue-800"></div>
                <h2 className="text-4xl font-black text-servimedia-gray uppercase tracking-tighter">Recorriendo Portadas...</h2>
                <p className="text-servimedia-gray/20 font-bold text-sm uppercase tracking-[0.4em] mt-4">Conexión con diarios de Madrid</p>
              </div>
            )}
            {status === AppStatus.COMPLETED && summaryResult && (
              <PressSummary result={summaryResult} onRefresh={startPressSummary} isLoading={status === AppStatus.PROCESSING} />
            )}
            {status === AppStatus.ERROR && (
              <div className="text-center py-40">
                <p className="text-2xl font-black text-red-500 uppercase tracking-tighter mb-4">Error al conectar con la prensa</p>
                <button onClick={startPressSummary} className="px-10 py-4 bg-servimedia-gray text-white rounded-full font-black text-xs uppercase tracking-widest">Reintentar conexión</button>
              </div>
            )}
          </>
        )}

        {(mode === AppMode.AUDIO || mode === AppMode.PRESS_RELEASE) && (
          <>
            {(status === AppStatus.IDLE || status === AppStatus.PROCESSING) && (
              <div className="space-y-16">
                <FileUploader onFileSelected={handleFileSelected} onClear={handleClear} isLoading={status === AppStatus.PROCESSING} mode={mode} />
                {status === AppStatus.IDLE && mode === AppMode.PRESS_RELEASE && fileState.file && (
                  <div className="max-w-3xl mx-auto bg-white p-10 rounded-[2.5rem] border border-servimedia-border shadow-2xl shadow-servimedia-orange/5">
                    <div className="flex items-center gap-3 mb-8 text-servimedia-orange">
                      <Target className="w-6 h-6" />
                      <h3 className="font-black text-sm uppercase tracking-[0.2em]">Sugerir enfoque para el teletipo</h3> {/* CHANGED TEXT HERE */}
                    </div>
                    <textarea value={userAngle} onChange={(e) => setUserAngle(e.target.value)} placeholder="Sugiere un enfoque para el teletipo" className="w-full h-40 p-6 bg-servimedia-light border-none rounded-3xl focus:ring-4 focus:ring-servimedia-orange/10 outline-none font-sans transition-all text-xl placeholder:text-servimedia-gray/20" />
                  </div>
                )}
                {status === AppStatus.IDLE && fileState.file && (
                  <div className="flex justify-center">
                    <button onClick={startAnalysis} className={`px-20 py-8 rounded-full font-black text-white text-base uppercase tracking-[0.3em] shadow-[0_20px_50px_rgba(0,0,0,0.1)] btn-servi flex items-center gap-4 ${mode === AppMode.AUDIO ? 'bg-servimedia-pink hover:shadow-servimedia-pink/20' : 'bg-servimedia-orange hover:shadow-servimedia-orange/20'}`}>
                      Generar Contenido <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {status === AppStatus.PROCESSING && mode !== AppMode.PRESS_SUMMARY && (
              <div className="flex flex-col items-center justify-center py-40 animate-in zoom-in-95">
                <div className={`w-28 h-28 border-8 border-t-transparent rounded-full animate-spin mb-12 ${mode === AppMode.AUDIO ? 'border-servimedia-pink' : 'border-servimedia-orange'}`}></div>
                <h2 className="text-4xl font-black text-servimedia-gray uppercase tracking-tighter">Procesando en Redacción...</h2>
                <p className="text-servimedia-gray/20 font-bold text-sm uppercase tracking-[0.4em] mt-4">Manual de Estilo Servimedia v2024</p>
              </div>
            )}

            {status === AppStatus.COMPLETED && (
              <div className="animate-in fade-in slide-in-from-bottom-12 duration-700">
                <div className="flex items-center justify-between mb-12 border-b-2 border-servimedia-border pb-10">
                  <button onClick={handleClear} className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-3 text-servimedia-gray/30 hover:text-servimedia-pink transition-all group">
                    <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Nueva Solicitud
                  </button>
                  <div className="flex items-center gap-3 text-xs font-bold text-servimedia-gray/20 uppercase tracking-[0.3em]">
                    <Clock className="w-4 h-4" /> Registro: {new Date().toLocaleTimeString()}
                  </div>
                </div>
                {mode === AppMode.AUDIO && audioResult && (
                  <div className="space-y-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-pink mb-4">Módulo: Audio a Texto</h2>
                    <AnalysisResult result={audioResult} audioFile={fileState.file} />
                  </div>
                )}
                {mode === AppMode.PRESS_RELEASE && pressResult && (
                  <div className="space-y-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-orange mb-4">Módulo: Notas de Prensa</h2>
                    <PressReleaseResult result={pressResult} pdfFile={fileState.file} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="bg-white border-t border-servimedia-border py-20 mt-auto">
        <div className="max-w-7xl mx-auto px-8 flex flex-col items-center gap-12">
           <div className="opacity-30 flex items-center gap-4 grayscale hover:grayscale-0 transition-all duration-700">
              <RobotLogo className="w-12 h-12" />
              <div className="flex items-center text-2xl font-black tracking-tighter leading-none">
                <span className="text-servimedia-pink">servimed-</span>
                <span className="text-servimedia-orange">IA</span>
              </div>
           </div>
           <div className="text-center">
             <p className="text-[10px] font-black text-servimedia-gray/20 uppercase tracking-[0.5em] mb-4">
               Agencia de Noticias Servimedia • Innovación Editorial
             </p>
             <p className="text-[10px] font-bold text-servimedia-gray/10 uppercase tracking-[0.2em]">
               © {new Date().getFullYear()} Todos los derechos reservados • Desarrollado para Servimedia
             </p>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
