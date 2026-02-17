import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Session } from '@supabase/supabase-js';
import { AppStatus, BaseJob, AppMode } from '../types';
import { geminiService } from '../services/geminiService';

export const useJobQueue = <T extends BaseJob>(
    jobType: 'audio' | 'press_release',
    session: Session | null,
    onJobCompleted: (data: any, fileName: string) => void
) => {
    const [jobs, setJobs] = useState<T[]>([]);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Auto-process queue
    useEffect(() => {
        const processQueue = async () => {
            if (isProcessing) return;

            const pendingJob = jobs.find(j => j.status === AppStatus.IDLE);
            if (!pendingJob) return;

            setIsProcessing(true);
            setJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.PROCESSING } : j) as T[]);

            try {
                let result;
                if (jobType === 'audio') {
                    result = await geminiService.processAudio(pendingJob.base64, pendingJob.mimeType);
                } else {
                    // For press release, we need the userAngle
                    const pressJob = pendingJob as any;
                    result = await geminiService.processPressRelease(pendingJob.base64, pendingJob.mimeType, pressJob.userAngle);
                }

                // Save to cloud
                if (session?.user?.id) {
                    await supabase.from('audio_jobs').insert({
                        user_id: session.user.id,
                        file_name: pendingJob.file.name,
                        mime_type: pendingJob.mimeType,
                        job_type: jobType,
                        status: AppStatus.COMPLETED,
                        result: result
                    });
                }

                // Update state
                setJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.COMPLETED, result: result } : j) as T[]);

                // Trigger history save
                onJobCompleted(result, pendingJob.file.name);

            } catch (error) {
                console.error(`[useJobQueue] Error processing ${jobType} job:`, error);
                setJobs(prev => prev.map(j => j.id === pendingJob.id ? { ...j, status: AppStatus.ERROR } : j) as T[]);
            } finally {
                setIsProcessing(false);
            }
        };

        processQueue();
    }, [jobs, isProcessing, session, jobType, onJobCompleted]);

    const addJob = (job: T) => {
        setJobs(prev => [...prev, job]);
        if (!activeJobId) setActiveJobId(job.id);
    };

    const clearQueue = () => {
        setJobs([]);
        setActiveJobId(null);
        setIsProcessing(false);
    };

    const removeJob = (id: string) => {
        setJobs(prev => prev.filter(j => j.id !== id) as T[]);
        if (activeJobId === id) setActiveJobId(null);
    };

    const updateJob = (id: string, updates: Partial<T>) => {
        setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j) as T[]);
    };

    return {
        jobs,
        setJobs,
        activeJobId,
        setActiveJobId,
        isProcessing,
        addJob,
        clearQueue,
        removeJob,
        updateJob,
        activeJob: jobs.find(j => j.id === activeJobId)
    };
};
