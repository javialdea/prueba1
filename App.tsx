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
import { SettingsModal } from './components/SettingsModal';
import { CostEstimator } from './components/CostEstimator';
import { AudioQueue } from './components/AudioQueue';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { ResetPasswordPage } from './components/ResetPasswordPage';

import { supabase } from './services/supabase';
import { Session } from '@supabase/supabase-js';
import { AppStatus, FileState, AnalysisResult as AnalysisResultType, PressReleaseResult as PressReleaseResultType, AppMode, HistoryItem, TranscriptionJob, PressReleaseJob } from './types';
import { geminiService } from './services/geminiService';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.AUDIO);

  // Audio Jobs Queue (Multi-audio support)
  const [audioJobs, setAudioJobs] = useState<TranscriptionJob[]>([]);
  const [activeAudioJobId, setActiveAudioJobId] = useState<string | null>(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);

  // Press Release Mode States (Queue support)
  const [pressJobs, setPressJobs] = useState<PressReleaseJob[]>([]);
  const [activePressJobId, setActivePressJobId] = useState<string | null>(null);
  const [isProcessingPress, setIsProcessingPress] = useState(false);
  const [userAngle, setUserAngle] = useState('');

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCostEstimatorOpen, setIsCostEstimatorOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [currentRoute, setCurrentRoute] = useState(window.location.hash);


  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) setIsAuthOpen(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔔 Auth event:', event);
      setSession(session);
      if (session) setIsAuthOpen(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Hash-based routing for password reset
  useEffect(() => {
    const handleHashChange = () => setCurrentRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const [apiKey, setApiKey] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('gemini_api_key, is_admin')
        .eq('id', session.user.id)
        .single();

      if (!error && data) {
        if (data.gemini_api_key) {
          setApiKey(data.gemini_api_key);
          localStorage.setItem('GEMINI_API_KEY', data.gemini_api_key);
        } else {
          const storedKey = localStorage.getItem('GEMINI_API_KEY');
          if (storedKey) setApiKey(storedKey);
        }
        // Set admin status
        setIsAdmin(data.is_admin || false);
      } else {
        const storedKey = localStorage.getItem('GEMINI_API_KEY');
        if (storedKey) setApiKey(storedKey);
        setIsAdmin(false);
      }
    };

    fetchProfile();
  }, [session]);

  // Effect to process pending audio jobs
  useEffect(() => {
    const processPendingJobs = async () => {
      // Prevent concurrent processing
      if (isProcessingAudio) {
        console.log('[App] Already processing a job, skipping...');
        return;
      }

      const pendingJob = audioJobs.find(j => j.status === AppStatus.IDLE);
      if (!pendingJob) return;

      console.log(`[App] Starting to process job: ${pendingJob.file.name}`);
      setIsProcessingAudio(true);

      // Mark as processing
      setAudioJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.PROCESSING } : j));

      try {
        const data = await geminiService.processAudio(pendingJob.base64, pendingJob.mimeType);
        console.log(`[App] Successfully processed: ${pendingJob.file.name}`);

        // Save to Supabase if logged in and session is valid
        if (session?.user?.id) {
          try {
            const { error: supabaseError } = await supabase.from('audio_jobs').insert({
              user_id: session.user.id,
              file_name: pendingJob.file.name,
              mime_type: pendingJob.mimeType,
              status: AppStatus.COMPLETED,
              result: data
            });

            if (supabaseError) {
              console.error('[App] Failed to save to Supabase:', supabaseError);
              // Don't fail the whole operation if cloud save fails
            } else {
              console.log('[App] Saved to Supabase successfully');
            }
          } catch (supabaseErr) {
            console.error('[App] Supabase operation failed:', supabaseErr);
            // Continue even if Supabase fails
          }
        }

        setAudioJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.COMPLETED, result: data } : j));
        saveToHistory(data, AppMode.AUDIO, pendingJob.file.name);
      } catch (error) {
        console.error('[App] Error processing audio job:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido al procesar audio';
        console.error('[App] Error details:', errorMessage);
        setAudioJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.ERROR } : j));
      } finally {
        setIsProcessingAudio(false);
      }
    };

    processPendingJobs();
  }, [audioJobs, session, isProcessingAudio]);

  // Effect to process pending press release jobs
  useEffect(() => {
    const processPendingPressJobs = async () => {
      if (isProcessingPress) return;

      const pendingJob = pressJobs.find(j => j.status === AppStatus.IDLE);
      if (!pendingJob) return;

      setIsProcessingPress(true);

      // Mark as processing
      setPressJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.PROCESSING } : j));

      try {
        const data = await geminiService.processPressRelease(pendingJob.base64, pendingJob.mimeType, pendingJob.userAngle);

        // Save to Supabase if logged in
        if (session?.user?.id) {
          try {
            await supabase.from('audio_jobs').insert({ // Reusing same table for now or a different one? 
              user_id: session.user.id,
              file_name: pendingJob.file.name,
              mime_type: pendingJob.mimeType,
              status: AppStatus.COMPLETED,
              result: data
            });
          } catch (e) {
            console.error('Failed to save press release to cloud:', e);
          }
        }

        setPressJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.COMPLETED, result: data } : j));
        saveToHistory(data, AppMode.PRESS_RELEASE, pendingJob.file.name);
      } catch (error) {
        console.error('Error processing press release job:', error);
        setPressJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.ERROR } : j));
      } finally {
        setIsProcessingPress(false);
      }
    };

    processPendingPressJobs();
  }, [pressJobs, session, isProcessingPress]);

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
      if (!newState.file || !newState.base64 || !newState.mimeType) return;
      const newJob: PressReleaseJob = {
        id: crypto.randomUUID(),
        file: newState.file,
        base64: newState.base64,
        mimeType: newState.mimeType,
        status: AppStatus.IDLE,
        userAngle: userAngle,
        timestamp: new Date().toLocaleTimeString()
      };
      setPressJobs(prev => [...prev, newJob]);
      if (!activePressJobId) setActivePressJobId(newJob.id);
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
      if (activePressJobId) {
        setPressJobs(prev => prev.filter(j => j.id !== activePressJobId));
        setActivePressJobId(null);
      }
      setUserAngle('');
    }
  };

  const startAnalysis = async () => {
    // Both modes now start automatically via useEffect
    return;
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



  // Show password reset page when hash is #/reset-password
  if (currentRoute.startsWith('#/reset-password') || currentRoute.startsWith('#/auth-error')) {
    return <ResetPasswordPage />;
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
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onCostEstimatorOpen={() => setIsCostEstimatorOpen(true)}
        onAuthOpen={() => setIsAuthOpen(true)}
        onLogout={async () => {
          await supabase.auth.signOut();
          setHistory([]);
          setAudioJobs([]);
          setPressJobs([]);
          setIsAuthOpen(false);
          window.location.reload();
        }}
        onLogoClick={handleClear}
        userEmail={session?.user?.email}
        isAdmin={isAdmin}
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

      <CostEstimator isOpen={isCostEstimatorOpen} onClose={() => setIsCostEstimatorOpen(false)} />

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
                base64: '',
                mimeType: '',
                status: AppStatus.COMPLETED,
                result: item.data as AnalysisResultType,
                timestamp: new Date(item.date).toLocaleTimeString()
              };
              setAudioJobs(prev => [...prev, newJob]);
              setActiveAudioJobId(newJob.id);
            }
          } else if (item.mode === AppMode.PRESS_RELEASE) {
            // Check if it's already in jobs, otherwise add it
            const existing = pressJobs.find(j => j.result === item.data);
            if (existing) {
              setActivePressJobId(existing.id);
            } else {
              const newJob: PressReleaseJob = {
                id: crypto.randomUUID(),
                file: new File([], item.fileName), // Placeholder
                base64: '',
                mimeType: '',
                status: AppStatus.COMPLETED,
                result: item.data as PressReleaseResultType,
                timestamp: new Date(item.date).toLocaleTimeString()
              };
              setPressJobs(prev => [...prev, newJob]);
              setActivePressJobId(newJob.id);
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
        {((mode === AppMode.AUDIO && audioJobs.length === 0) || (mode === AppMode.PRESS_RELEASE && pressJobs.length === 0)) && mode !== AppMode.WRITING_ASSISTANT && (
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
                onAddMore={() => (document.querySelector('input[name="file-input-AUDIO"]') as HTMLInputElement || document.querySelector('input[type="file"]'))?.click()}
              />
            )}
            {mode === AppMode.PRESS_RELEASE && (
              <PressReleaseQueue
                jobs={pressJobs}
                activeJobId={activePressJobId}
                onJobClick={setActivePressJobId}
                onClearQueue={() => setPressJobs([])}
                onAddMore={() => (document.querySelector('input[name="file-input-PRESS_RELEASE"]') as HTMLInputElement || document.querySelector('input[type="file"]'))?.click()}
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

            {(mode === AppMode.PRESS_RELEASE && !activePressJobId) && (
              <div className="space-y-16">
                <FileUploader
                  onFileSelected={handleFileSelected}
                  onClear={handleClear}
                  isLoading={isProcessingPress}
                  mode={mode}
                />
                {!isProcessingPress && (
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

            {((mode === AppMode.AUDIO && activeAudioJob?.status === AppStatus.PROCESSING) ||
              (mode === AppMode.PRESS_RELEASE && pressJobs.find(j => j.id === activePressJobId)?.status === AppStatus.PROCESSING)) && (
                <div className="flex flex-col items-center justify-center py-40 animate-in zoom-in-95">
                  <div className={`w-28 h-28 border-8 border-t-transparent rounded-full animate-spin mb-12 ${mode === AppMode.AUDIO ? 'border-servimedia-pink' : 'border-servimedia-orange'}`}></div>
                  <h2 className="text-4xl font-black text-servimedia-gray uppercase tracking-tighter">Procesando en Redacción...</h2>
                  <p className="text-servimedia-gray/20 font-bold text-sm uppercase tracking-[0.4em] mt-4">Manual de Estilo Servimedia v2024</p>
                </div>
              )}

            {((mode === AppMode.AUDIO && activeAudioJob?.status === AppStatus.COMPLETED) ||
              (mode === AppMode.PRESS_RELEASE && pressJobs.find(j => j.id === activePressJobId)?.status === AppStatus.COMPLETED)) && (
                <div className="animate-in fade-in slide-in-from-bottom-12 duration-700">
                  <div className="flex items-center justify-between mb-12 border-b-2 border-servimedia-border pb-10">
                    <button onClick={handleClear} className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-3 text-servimedia-gray/30 hover:text-servimedia-pink transition-all group">
                      <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> {mode === AppMode.AUDIO ? 'Cerrar Vista' : 'Nueva Solicitud'}
                    </button>
                    <div className="flex items-center gap-3 text-xs font-bold text-servimedia-gray/20 uppercase tracking-[0.3em]">
                      <Clock className="w-4 h-4" /> Registro: {mode === AppMode.AUDIO ? activeAudioJob?.timestamp : pressJobs.find(j => j.id === activePressJobId)?.timestamp}
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
                  {mode === AppMode.PRESS_RELEASE && pressJobs.find(j => j.id === activePressJobId)?.result && (
                    <div className="space-y-6">
                      <h2 className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-orange mb-4">Módulo: Notas de Prensa</h2>
                      <PressReleaseResult result={pressJobs.find(j => j.id === activePressJobId)!.result!} pdfFile={pressJobs.find(j => j.id === activePressJobId)?.file} />
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
