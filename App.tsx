import React, { useState, useEffect } from 'react';
import { ChevronRight, Loader2, Target, Clock } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { AnalysisResult } from './components/AnalysisResult';
import { PressReleaseResult } from './components/PressReleaseResult';
import { WritingAssistant } from './components/WritingAssistant';
import { HistoryDrawer } from './components/HistoryDrawer';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { SettingsModal } from './components/SettingsModal';
import { AudioQueue } from './components/AudioQueue';
import { LandingPage } from './components/LandingPage';
import { supabase } from './services/supabase';
import { Session } from '@supabase/supabase-js';
import { AppStatus, FileState, AnalysisResult as AnalysisResultType, PressReleaseResult as PressReleaseResultType, AppMode, HistoryItem, TranscriptionJob } from './types';
import { geminiService } from './services/geminiService';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.AUDIO);

  // Audio Jobs Queue (Multi-audio support)
  const [audioJobs, setAudioJobs] = useState<TranscriptionJob[]>([]);
  const [activeAudioJobId, setActiveAudioJobId] = useState<string | null>(null);

  // Press Release Mode States (Single-file for now)
  const [pressStatus, setPressStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [pressFileState, setPressFileState] = useState<FileState>({ file: null, base64: null, mimeType: null });
  const [pressResult, setPressResult] = useState<PressReleaseResultType | null>(null);
  const [userAngle, setUserAngle] = useState('');

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) setIsAuthOpen(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) setIsAuthOpen(false);
    });

    return () => subscription.unsubscribe();
  }, []);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('gemini_api_key')
        .eq('id', session.user.id)
        .single();

      if (!error && data?.gemini_api_key) {
        setApiKey(data.gemini_api_key);
        localStorage.setItem('GEMINI_API_KEY', data.gemini_api_key);
      } else {
        const storedKey = localStorage.getItem('GEMINI_API_KEY');
        if (storedKey) setApiKey(storedKey);
      }
    };

    fetchProfile();
  }, [session]);

  // Effect to process pending audio jobs
  useEffect(() => {
    const processPendingJobs = async () => {
      const pendingJob = audioJobs.find(j => j.status === AppStatus.IDLE);
      if (!pendingJob) return;

      // Mark as processing
      setAudioJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.PROCESSING } : j));

      try {
        const data = await geminiService.processAudio(pendingJob.base64, pendingJob.mimeType);

        // Save to Supabase if logged in
        if (session?.user) {
          await supabase.from('audio_jobs').insert({
            user_id: session.user.id,
            file_name: pendingJob.file.name,
            mime_type: pendingJob.mimeType,
            status: AppStatus.COMPLETED,
            result: data
          });
        }

        setAudioJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.COMPLETED, result: data } : j));
        saveToHistory(data, AppMode.AUDIO, pendingJob.file.name);
      } catch (error) {
        setAudioJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.ERROR } : j));
      }
    };

    processPendingJobs();
  }, [audioJobs]);

  const handleSaveApiKey = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
    setIsSettingsOpen(false);
    alert('API Key guardada correctamente.');
    window.location.reload();
  };

  useEffect(() => {
    const fetchHistory = async () => {
      // 1. Try Cloud first if logged in
      if (session?.user) {
        const { data, error } = await supabase
          .from('audio_jobs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          const cloudHistory: HistoryItem[] = data.map(item => ({
            id: item.id,
            date: item.created_at,
            fileName: item.file_name,
            mode: AppMode.AUDIO,
            data: item.result
          }));
          setHistory(cloudHistory);
          return;
        }
      }

      // 2. Fallback to LocalStorage
      const saved = localStorage.getItem('servimedia_history_v5');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setHistory(parsed);
        } catch (e) {
          console.error("Error al parsear historial:", e);
        }
      }
    };

    fetchHistory();
  }, [session]);

  const saveToHistory = (data: any, currentMode: AppMode, fileName: string) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      fileName: fileName,
      mode: currentMode,
      data: data
    };
    setHistory(prev => [newItem, ...prev].slice(0, 50));

    // Always persist to local as backup
    const saved = localStorage.getItem('servimedia_history_v5');
    const prevHistory = saved ? JSON.parse(saved) : [];
    localStorage.setItem('servimedia_history_v5', JSON.stringify([newItem, ...prevHistory].slice(0, 50)));
  };

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
  };

  const handleFileSelected = (newState: FileState) => {
    if (mode === AppMode.AUDIO) {
      if (!newState.file || !newState.base64 || !newState.mimeType) return;
      const newJob: TranscriptionJob = {
        id: crypto.randomUUID(),
        file: newState.file,
        base64: newState.base64,
        mimeType: newState.mimeType,
        status: AppStatus.IDLE,
        timestamp: new Date().toLocaleTimeString()
      };
      setAudioJobs(prev => [...prev, newJob]);
      if (!activeAudioJobId) setActiveAudioJobId(newJob.id);
    } else {
      setPressFileState(newState);
      setPressResult(null);
      setPressStatus(AppStatus.IDLE);
    }
  };

  const handleClear = () => {
    if (mode === AppMode.AUDIO) {
      // In multi-audio, clear might mean clear the whole queue or just the active one?
      // Let's implement active job removal
      if (activeAudioJobId) {
        setAudioJobs(prev => prev.filter(j => j.id !== activeAudioJobId));
        setActiveAudioJobId(null);
      }
    } else {
      setPressFileState({ file: null, base64: null, mimeType: null });
      setPressResult(null);
      setPressStatus(AppStatus.IDLE);
      setUserAngle('');
    }
  };

  const startAnalysis = async () => {
    if (mode === AppMode.AUDIO) {
      // Audio jobs start automatically via useEffect
      return;
    } else {
      if (!pressFileState.base64 || !pressFileState.mimeType) return;
      setPressStatus(AppStatus.PROCESSING);
      try {
        const data = await geminiService.processPressRelease(pressFileState.base64, pressFileState.mimeType, userAngle);
        setPressResult(data);
        if (pressFileState.file) saveToHistory(data, AppMode.PRESS_RELEASE, pressFileState.file.name);
        setPressStatus(AppStatus.COMPLETED);
      } catch (error) {
        setPressStatus(AppStatus.ERROR);
      }
    }
  };

  const activeAudioJob = audioJobs.find(j => j.id === activeAudioJobId);

  const handleManualVerify = async (jobId: string, claim: string) => {
    // 1. Mark as verifying in state
    setAudioJobs(prev => prev.map(job => {
      if (job.id === jobId && job.result) {
        return {
          ...job,
          result: { ...job.result, isVerifyingManual: true }
        };
      }
      return job;
    }));

    try {
      const factCheck = await geminiService.verifyManualSelection(claim);

      setAudioJobs(prev => {
        const updated = prev.map(job => {
          if (job.id === jobId && job.result) {
            const updatedManual = [...(job.result.manualFactChecks || []), factCheck];
            return {
              ...job,
              result: {
                ...job.result,
                manualFactChecks: updatedManual,
                isVerifyingManual: false
              }
            };
          }
          return job;
        });

        // 2. Persist to history
        const item = updated.find(j => j.id === jobId);
        if (item && item.result) {
          const saved = localStorage.getItem('servimedia_history_v5');
          if (saved) {
            const history = JSON.parse(saved);
            const itemIndex = history.findIndex((h: any) =>
              h.fileName === item.file.name && h.mode === AppMode.AUDIO
            );
            if (itemIndex !== -1) {
              history[itemIndex].data.manualFactChecks = item.result.manualFactChecks;
              localStorage.setItem('servimedia_history_v5', JSON.stringify(history));
            }
          }
        }

        return updated;
      });
    } catch (e) {
      console.error(e);
      setAudioJobs(prev => prev.map(job => {
        if (job.id === jobId && job.result) {
          return {
            ...job,
            result: { ...job.result, isVerifyingManual: false }
          };
        }
        return job;
      }));
    }
  };

  if (!session) {
    return (
      <>
        <LandingPage onLogin={() => setIsAuthOpen(true)} />
        {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-servimedia-light font-sans">
      <div className="h-2 w-full flex">
        <div className="h-full w-1/2 bg-servimedia-pink"></div>
        <div className="h-full w-1/2 bg-servimedia-orange"></div>
      </div>

      <AppHeader
        mode={mode}
        onModeChange={setMode}
        onHistoryOpen={() => setIsHistoryOpen(true)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onAuthOpen={() => setIsAuthOpen(true)}
        onLogout={async () => {
          await supabase.auth.signOut();
          setHistory([]);
          setAudioJobs([]);
          setIsAuthOpen(false);
          window.location.reload();
        }}
        onLogoClick={handleClear}
        userEmail={session?.user?.email}
      />

      {isSettingsOpen && (
        <SettingsModal
          apiKey={apiKey}
          setApiKey={setApiKey}
          onSave={async () => {
            localStorage.setItem('GEMINI_API_KEY', apiKey);
            if (session?.user) {
              await supabase.from('profiles').upsert({
                id: session.user.id,
                gemini_api_key: apiKey,
                updated_at: new Date().toISOString()
              });
            }
            setIsSettingsOpen(false);
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelect={(item) => {
          setMode(item.mode);
          if (item.mode === AppMode.AUDIO) {
            // Check if it's already in jobs, otherwise add it
            const existing = audioJobs.find(j => j.result === item.data);
            if (existing) {
              setActiveAudioJobId(existing.id);
            } else {
              const newJob: TranscriptionJob = {
                id: crypto.randomUUID(),
                file: new File([], item.fileName), // Placeholder
                base64: '', // We don't store base64 in history
                mimeType: '',
                status: AppStatus.COMPLETED,
                result: item.data,
                timestamp: new Date(item.date).toLocaleTimeString()
              };
              setAudioJobs(prev => [...prev, newJob]);
              setActiveAudioJobId(newJob.id);
            }
          } else if (item.mode === AppMode.PRESS_RELEASE) {
            setPressResult(item.data as PressReleaseResultType);
            setPressStatus(AppStatus.COMPLETED);
          }
          setIsHistoryOpen(false);
        }}
        onDelete={async (id) => {
          const updated = history.filter(h => h.id !== id);
          setHistory(updated);
          localStorage.setItem('servimedia_history_v5', JSON.stringify(updated));
          if (session?.user) {
            await supabase.from('audio_jobs').delete().eq('id', id);
          }
        }}
      />

      <main className="flex-grow max-w-7xl mx-auto w-full py-16 px-4 lg:px-8">
        {((mode === AppMode.AUDIO && audioJobs.length === 0) || (mode === AppMode.PRESS_RELEASE && pressStatus === AppStatus.IDLE)) && mode !== AppMode.WRITING_ASSISTANT && (
          <div className="text-center mb-16 animate-in fade-in duration-1000">
            <h1 className="text-7xl font-black tracking-tighter text-servimedia-gray mb-6 leading-tight">
              {mode === AppMode.AUDIO ? (<>De <span className="text-servimedia-pink">Audio</span> a Texto</>) : (<>Procesador <span className="text-servimedia-orange">Notas de Prensa</span></>)}
            </h1>
            <p className="text-servimedia-gray/30 text-2xl max-w-2xl mx-auto font-medium leading-relaxed italic border-l-4 border-servimedia-border pl-6">
              Optimización de la redacción y el análisis de contenidos mediante inteligencia artificial generativa.
            </p>
          </div>
        )}

        <div className={mode === AppMode.WRITING_ASSISTANT ? 'block' : 'hidden'}>
          <WritingAssistant session={session} />
        </div>


        {(mode === AppMode.AUDIO || mode === AppMode.PRESS_RELEASE) && (
          <>
            {/* Audio Queue Display */}
            {mode === AppMode.AUDIO && (
              <AudioQueue
                jobs={audioJobs}
                activeJobId={activeAudioJobId}
                onJobClick={setActiveAudioJobId}
                onClearQueue={() => setAudioJobs([])}
                onAddMore={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
              />
            )}

            {mode === AppMode.AUDIO && (
              <div className={activeAudioJob ? 'hidden' : 'block'}>
                <FileUploader
                  onFileSelected={handleFileSelected}
                  onClear={handleClear}
                  isLoading={false}
                  mode={mode}
                />
              </div>
            )}

            {(mode === AppMode.PRESS_RELEASE && (pressStatus === AppStatus.IDLE || pressStatus === AppStatus.PROCESSING)) && (
              <div className="space-y-16">
                <FileUploader
                  onFileSelected={handleFileSelected}
                  onClear={handleClear}
                  isLoading={pressStatus === AppStatus.PROCESSING}
                  mode={mode}
                />
                {pressStatus === AppStatus.IDLE && pressFileState.file && (
                  <div className="max-w-3xl mx-auto bg-white p-10 rounded-[2.5rem] border border-servimedia-border shadow-2xl shadow-servimedia-orange/5">
                    <div className="flex items-center gap-3 mb-8 text-servimedia-orange">
                      <Target className="w-6 h-6" />
                      <h3 className="font-black text-sm uppercase tracking-[0.2em]">Sugerir enfoque para el teletipo</h3>
                    </div>
                    <textarea value={userAngle} onChange={(e) => setUserAngle(e.target.value)} placeholder="Sugiere un enfoque para el teletipo" className="w-full h-40 p-6 bg-servimedia-light border-none rounded-3xl focus:ring-4 focus:ring-servimedia-orange/10 outline-none font-sans transition-all text-xl placeholder:text-servimedia-gray/20" />
                  </div>
                )}
                {pressStatus === AppStatus.IDLE && pressFileState.file && (
                  <div className="flex justify-center">
                    <button onClick={startAnalysis} className="px-20 py-8 rounded-full font-black text-white text-base uppercase tracking-[0.3em] shadow-[0_20px_50px_rgba(0,0,0,0.1)] btn-servi flex items-center gap-4 bg-servimedia-orange hover:shadow-servimedia-orange/20">
                      Generar Contenido <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {((mode === AppMode.AUDIO && activeAudioJob?.status === AppStatus.PROCESSING) ||
              (mode === AppMode.PRESS_RELEASE && pressStatus === AppStatus.PROCESSING)) && (
                <div className="flex flex-col items-center justify-center py-40 animate-in zoom-in-95">
                  <div className={`w-28 h-28 border-8 border-t-transparent rounded-full animate-spin mb-12 ${mode === AppMode.AUDIO ? 'border-servimedia-pink' : 'border-servimedia-orange'}`}></div>
                  <h2 className="text-4xl font-black text-servimedia-gray uppercase tracking-tighter">Procesando en Redacción...</h2>
                  <p className="text-servimedia-gray/20 font-bold text-sm uppercase tracking-[0.4em] mt-4">Manual de Estilo Servimedia v2024</p>
                </div>
              )}

            {((mode === AppMode.AUDIO && activeAudioJob?.status === AppStatus.COMPLETED) ||
              (mode === AppMode.PRESS_RELEASE && pressStatus === AppStatus.COMPLETED)) && (
                <div className="animate-in fade-in slide-in-from-bottom-12 duration-700">
                  <div className="flex items-center justify-between mb-12 border-b-2 border-servimedia-border pb-10">
                    <button onClick={handleClear} className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-3 text-servimedia-gray/30 hover:text-servimedia-pink transition-all group">
                      <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> {mode === AppMode.AUDIO ? 'Cerrar Vista' : 'Nueva Solicitud'}
                    </button>
                    <div className="flex items-center gap-3 text-xs font-bold text-servimedia-gray/20 uppercase tracking-[0.3em]">
                      <Clock className="w-4 h-4" /> Registro: {activeAudioJob ? activeAudioJob.timestamp : new Date().toLocaleTimeString()}
                    </div>
                  </div>
                  {mode === AppMode.AUDIO && activeAudioJob?.result && (
                    <div className="space-y-6">
                      <h2 className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-pink mb-4">Módulo: Audio a Texto</h2>
                      <AnalysisResult
                        result={activeAudioJob.result}
                        audioFile={activeAudioJob.file}
                        onManualVerify={(claim) => handleManualVerify(activeAudioJob.id, claim)}
                      />
                    </div>
                  )}
                  {mode === AppMode.PRESS_RELEASE && pressResult && (
                    <div className="space-y-6">
                      <h2 className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-orange mb-4">Módulo: Notas de Prensa</h2>
                      <PressReleaseResult result={pressResult} pdfFile={pressFileState.file || undefined} />
                    </div>
                  )}
                </div>
              )}
          </>
        )}
      </main>

      <AppFooter />
      {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}
    </div >
  );
};

export default App;
