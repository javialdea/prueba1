import React from 'react';
import { ChevronRight, Loader2, Clock, FileText } from 'lucide-react';
import { AppStatus, PressReleaseJob } from '../types';

interface PressReleaseQueueProps {
    jobs: PressReleaseJob[];
    activeJobId: string | null;
    onJobClick: (id: string) => void;
    onClearQueue: () => void;
    onAddMore: () => void;
}

export const PressReleaseQueue: React.FC<PressReleaseQueueProps> = ({
    jobs,
    activeJobId,
    onJobClick,
    onClearQueue,
    onAddMore
}) => {
    if (jobs.length === 0) return null;

    return (
        <div className="mb-12 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.4em] text-servimedia-gray/30">Cola de Notas de Prensa ({jobs.length})</h3>
                    <button
                        onClick={onAddMore}
                        className="px-4 py-1.5 bg-servimedia-orange/10 text-servimedia-orange rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-servimedia-orange hover:text-white transition-all"
                    >
                        + Añadir más
                    </button>
                </div>
                <button onClick={onClearQueue} className="text-[10px] font-bold uppercase text-servimedia-orange/50 hover:text-servimedia-orange transition-colors">Limpiar Cola</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobs.map(job => (
                    <div
                        key={job.id}
                        onClick={() => onJobClick(job.id)}
                        className={`p-5 rounded-2xl border-2 transition-all cursor-pointer group ${activeJobId === job.id ? 'border-servimedia-orange bg-servimedia-orange/[0.02] shadow-lg shadow-servimedia-orange/5' : 'border-servimedia-border bg-white hover:border-servimedia-orange/20'}`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className={`p-2 rounded-lg ${job.status === AppStatus.COMPLETED ? 'bg-green-500/10 text-green-500' : job.status === AppStatus.ERROR ? 'bg-red-500/10 text-red-500' : 'bg-servimedia-orange/10 text-servimedia-orange'}`}>
                                {job.status === AppStatus.COMPLETED ? <ChevronRight className="w-4 h-4" /> : job.status === AppStatus.PROCESSING ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-servimedia-gray/20">{job.timestamp}</span>
                        </div>
                        <p className="font-bold text-servimedia-gray text-sm truncate mb-1 group-hover:text-servimedia-orange transition-colors">{job.file.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/30">{job.status === AppStatus.COMPLETED ? 'Completado' : job.status === AppStatus.PROCESSING ? 'Procesando...' : job.status === AppStatus.ERROR ? 'Error' : 'En cola'}</p>
                    </div>
                ))}
                <div className="flex items-center justify-center border-2 border-dashed border-servimedia-border rounded-2xl p-5 hover:border-servimedia-orange/20 transition-all cursor-pointer group" onClick={onAddMore}>
                    <FileText className="w-6 h-6 text-servimedia-gray/10 group-hover:text-servimedia-orange/30 transition-all" />
                </div>
            </div>
        </div>
    );
};
