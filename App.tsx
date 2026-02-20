import React, { useState, useEffect } from 'react';
import { ChevronRight, Loader2, Target, Clock } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { AnalysisResult } from './components/AnalysisResult';
import { PressReleaseResult } from './components/PressReleaseResult';
import { PressReleaseQueue } from './components/PressReleaseQueue';
import { WritingAssistant } from './components/WritingAssistant';
import { HistoryDrawer } from './components/HistoryDrawer';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { AudioQueue } from './components/AudioQueue';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { AdminPortal } from './components/AdminPortal';

import { supabase } from './services/supabase';
import { AppStatus, FileState, AnalysisResult as AnalysisResultType, PressReleaseResult as PressReleaseResultType, AppMode, HistoryItem, TranscriptionJob, PressReleaseJob } from './types';
import { geminiService } from './services/geminiService';
import { useAuth } from './hooks/useAuth';
import { useJobQueue } from './hooks/useJobQueue';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.AUDIO);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAdminPortalOpen, setIsAdminPortalOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(window.location.hash);
  const [userAngle, setUserAngle] = useState('');

  const {
    session,
    isAdmin,
    isAuthOpen,
    setIsAuthOpen,
    logout
  } = useAuth();

  const saveToHistory = (data: any, currentMode: AppMode, fileName: string) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      fileName: fileName,
      mode: currentMode,
      data: data
    };
    setHistory(prev => [newItem, ...prev].slice(0, 50));
    const saved = localStorage.getItem('servimedia_history_v5');
    const prevHistory = saved ? JSON.parse(saved) : [];
    localStorage.setItem('servimedia_history_v5', JSON.stringify([newItem, ...prevHistory].slice(0, 50)));
  };

  const audioQueue = useJobQueue<TranscriptionJob>('audio', session, (data, fileName) => saveToHistory(data, AppMode.AUDIO, fileName));
  const pressQueue = useJobQueue<PressReleaseJob>('press_release', session, (data, fileName) => saveToHistory(data, AppMode.PRESS_RELEASE, fileName));

  // Authentication and routing effect
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.startsWith('#/reset-password')) {
      setCurrentRoute('#/reset-password');
    } else {
      setCurrentRoute(hash);
    }

    const handleHashChange = () => {
      const newHash = window.location.hash;
      if (newHash.includes('type=recovery') || newHash.startsWith('#/reset-password')) {
        setCurrentRoute('#/reset-password');
      } else {
        setCurrentRoute(newHash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
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
            mode: item.job_type === 'press_release' ? AppMode.PRESS_RELEASE : AppMode.AUDIO,
            data: item.result
          }));
          setHistory(cloudHistory);
          return;
        }
      }
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

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
  };

  const handleFileSelected = (newState: FileState) => {
    if (!newState.file || !newState.base64 || !newState.mimeType) return;

    if (mode === AppMode.AUDIO) {
      const newJob: TranscriptionJob = {
        id: crypto.randomUUID(),
        file: newState.file,
        base64: newState.base64,
        mimeType: newState.mimeType,
        status: AppStatus.IDLE,
        job_type: 'audio',
        timestamp: new Date().toLocaleTimeString()
      };
      audioQueue.addJob(newJob);
    } else {
      const newJob: PressReleaseJob = {
        id: crypto.randomUUID(),
        file: newState.file,
        base64: newState.base64,
        mimeType: newState.mimeType,
        status: AppStatus.IDLE,
        job_type: 'press_release',
        userAngle: userAngle,
        timestamp: new Date().toLocaleTimeString()
      };
      pressQueue.addJob(newJob);
    }
  };

  const handleClear = () => {
    if (mode === AppMode.AUDIO) {
      audioQueue.clearQueue();
    } else if (mode === AppMode.PRESS_RELEASE) {
      pressQueue.clearQueue();
      setUserAngle('');
    }
  };

  const handleManualVerify = async (jobId: string, claim: string) => {
    const job = audioQueue.jobs.find(j => j.id === jobId);
    if (!job || !job.result) return;

    audioQueue.updateJob(jobId, { result: { ...job.result, isVerifyingManual: true } });

    try {
      const factCheck = await geminiService.verifyManualSelection(claim);
      const updatedManual = [...(job.result.manualFactChecks || []), factCheck];

      audioQueue.updateJob(jobId, {
        result: {
          ...job.result,
          manualFactChecks: updatedManual,
          isVerifyingManual: false
        }
      });

      // Update history
      const saved = localStorage.getItem('servimedia_history_v5');
      if (saved) {
        const historyList = JSON.parse(saved);
        const itemIndex = historyList.findIndex((h: any) => h.fileName === job.file.name && h.mode === AppMode.AUDIO);
        if (itemIndex !== -1) {
          historyList[itemIndex].data.manualFactChecks = updatedManual;
          localStorage.setItem('servimedia_history_v5', JSON.stringify(historyList));
          setHistory(historyList);
        }
      }
    } catch (e) {
      console.error(e);
      audioQueue.updateJob(jobId, { result: { ...job.result, isVerifyingManual: false } });
    }
  };

  // Show password reset page when hash is #/reset-password
  if (currentRoute.startsWith('#/reset-password') || currentRoute.startsWith('#/auth-error')) {
    return <ResetPasswordPage />;
  }

  // Show admin portal if route is #/admin and user is admin
  if (currentRoute === '#/admin' && isAdmin) {
    return <AdminPortal isOpen={true} onClose={() => {
      window.location.hash = '';
      setCurrentRoute('');
    }} />;
  }

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
        onCostEstimatorOpen={() => setIsAdminPortalOpen(true)}
        onAuthOpen={() => setIsAuthOpen(true)}
        onLogout={logout}
        onLogoClick={handleClear}
        userEmail={session?.user?.email}
        isAdmin={isAdmin}
      />

      <AdminPortal isOpen={isAdminPortalOpen} onClose={() => setIsAdminPortalOpen(false)} />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelect={(item) => {
          setMode(item.mode);
          if (item.mode === AppMode.AUDIO) {
            const existing = audioQueue.jobs.find(j => j.result === item.data);
            if (existing) {
              audioQueue.setActiveJobId(existing.id);
            } else {
              const newJob: TranscriptionJob = {
                id: crypto.randomUUID(),
                file: new File([], item.fileName),
                base64: '',
                mimeType: '',
                status: AppStatus.COMPLETED,
                job_type: 'audio',
                result: item.data as AnalysisResultType,
                timestamp: new Date(item.date).toLocaleTimeString()
              };
              audioQueue.addJob(newJob);
            }
          } else if (item.mode === AppMode.PRESS_RELEASE) {
            const existing = pressQueue.jobs.find(j => j.result === item.data);
            if (existing) {
              pressQueue.setActiveJobId(existing.id);
            } else {
              const newJob: PressReleaseJob = {
                id: crypto.randomUUID(),
                file: new File([], item.fileName),
                base64: '',
                mimeType: '',
                status: AppStatus.COMPLETED,
                job_type: 'press_release',
                result: item.data as PressReleaseResultType,
                timestamp: new Date(item.date).toLocaleTimeString()
              };
              pressQueue.addJob(newJob);
            }
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
        {((mode === AppMode.AUDIO && audioQueue.jobs.length === 0) || (mode === AppMode.PRESS_RELEASE && pressQueue.jobs.length === 0)) && mode !== AppMode.WRITING_ASSISTANT && (
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
            {mode === AppMode.AUDIO && (
              <AudioQueue
                jobs={audioQueue.jobs}
                activeJobId={audioQueue.activeJobId}
                onJobClick={audioQueue.setActiveJobId}
                onClearQueue={audioQueue.clearQueue}
                onAddMore={() => (document.querySelector('input[name="file-input-AUDIO"]') as HTMLInputElement || document.querySelector('input[type="file"]'))?.click()}
              />
            )}
            {mode === AppMode.PRESS_RELEASE && (
              <PressReleaseQueue
                jobs={pressQueue.jobs}
                activeJobId={pressQueue.activeJobId}
                onJobClick={pressQueue.setActiveJobId}
                onClearQueue={pressQueue.clearQueue}
                onAddMore={() => (document.querySelector('input[name="file-input-PRESS_RELEASE"]') as HTMLInputElement || document.querySelector('input[type="file"]'))?.click()}
              />
            )}

            {mode === AppMode.AUDIO && (
              <div className={audioQueue.activeJobId ? 'hidden' : 'block'}>
                <FileUploader
                  onFileSelected={handleFileSelected}
                  onClear={handleClear}
                  isLoading={false}
                  mode={mode}
                />
              </div>
            )}

            {(mode === AppMode.PRESS_RELEASE && !pressQueue.activeJobId) && (
              <div className="space-y-16">
                <FileUploader
                  onFileSelected={handleFileSelected}
                  onClear={handleClear}
                  isLoading={pressQueue.isProcessing}
                  mode={mode}
                />
                {!pressQueue.isProcessing && (
                  <div className="max-w-3xl mx-auto bg-white p-10 rounded-[2.5rem] border border-servimedia-border shadow-2xl shadow-servimedia-orange/5">
                    <div className="flex items-center gap-3 mb-8 text-servimedia-orange">
                      <Target className="w-6 h-6" />
                      <h3 className="font-black text-sm uppercase tracking-[0.2em]">Sugerir enfoque para el teletipo</h3>
                    </div>
                    <textarea value={userAngle} onChange={(e) => setUserAngle(e.target.value)} placeholder="Sugiere un enfoque para el teletipo" className="w-full h-40 p-6 bg-servimedia-light border-none rounded-3xl focus:ring-4 focus:ring-servimedia-orange/10 outline-none font-sans transition-all text-xl placeholder:text-servimedia-gray/20" />
                  </div>
                )}
              </div>
            )}

            {((mode === AppMode.AUDIO && audioQueue.activeJob?.status === AppStatus.PROCESSING) ||
              (mode === AppMode.PRESS_RELEASE && pressQueue.activeJob?.status === AppStatus.PROCESSING)) && (
                <div className="flex flex-col items-center justify-center py-40 animate-in zoom-in-95">
                  <div className={`w-28 h-28 border-8 border-t-transparent rounded-full animate-spin mb-12 ${mode === AppMode.AUDIO ? 'border-servimedia-pink' : 'border-servimedia-orange'}`}></div>
                  <h2 className="text-4xl font-black text-servimedia-gray uppercase tracking-tighter">Procesando en Redacción...</h2>
                  <p className="text-servimedia-gray/20 font-bold text-sm uppercase tracking-[0.4em] mt-4">Manual de Estilo Servimedia v2024</p>
                </div>
              )}

            {((mode === AppMode.AUDIO && audioQueue.activeJob?.status === AppStatus.COMPLETED) ||
              (mode === AppMode.PRESS_RELEASE && pressQueue.activeJob?.status === AppStatus.COMPLETED)) && (
                <div className="animate-in fade-in slide-in-from-bottom-12 duration-700">
                  <div className="flex items-center justify-between mb-12 border-b-2 border-servimedia-border pb-10">
                    <button onClick={handleClear} className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-3 text-servimedia-gray/30 hover:text-servimedia-pink transition-all group">
                      <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> {mode === AppMode.AUDIO ? 'Cerrar Vista' : 'Nueva Solicitud'}
                    </button>
                    <div className="flex items-center gap-3 text-xs font-bold text-servimedia-gray/20 uppercase tracking-[0.3em]">
                      <Clock className="w-4 h-4" /> Registro: {mode === AppMode.AUDIO ? audioQueue.activeJob?.timestamp : pressQueue.activeJob?.timestamp}
                    </div>
                  </div>
                  {mode === AppMode.AUDIO && audioQueue.activeJob?.result && (
                    <div className="space-y-6">
                      <h2 className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-pink mb-4">Módulo: Audio a Texto</h2>
                      <AnalysisResult
                        result={audioQueue.activeJob.result}
                        audioFile={audioQueue.activeJob.file}
                        onManualVerify={(claim) => handleManualVerify(audioQueue.activeJob!.id, claim)}
                      />
                    </div>
                  )}
                  {mode === AppMode.PRESS_RELEASE && pressQueue.activeJob?.result && (
                    <div className="space-y-6">
                      <h2 className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-orange mb-4">Módulo: Notas de Prensa</h2>
                      <PressReleaseResult result={pressQueue.activeJob.result} pdfFile={pressQueue.activeJob.file} />
                    </div>
                  )}
                </div>
              )}
          </>
        )}
      </main>
      <AppFooter />
      {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}
    </div>
  );
};

export default App;
