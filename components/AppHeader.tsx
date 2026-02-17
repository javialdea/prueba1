
import React from 'react';
import { Mic2, Newspaper, PenTool, History as HistoryIcon, User, LogIn, LogOut, Shield } from 'lucide-react';
import { AppMode } from '../types';

interface RobotLogoProps {
    className?: string;
    onClick?: () => void;
}

export const RobotLogo: React.FC<RobotLogoProps> = ({ className, onClick }) => (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg" onClick={onClick}>
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

interface AppHeaderProps {
    mode: AppMode;
    onModeChange: (mode: AppMode) => void;
    onHistoryOpen: () => void;
    onCostEstimatorOpen: () => void;
    onAuthOpen: () => void;
    onLogout: () => void;
    onLogoClick: () => void;
    userEmail?: string;
    isAdmin?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
    mode,
    onModeChange,
    onHistoryOpen,
    onCostEstimatorOpen,
    onAuthOpen,
    onLogout,
    onLogoClick,
    userEmail,
    isAdmin = false
}) => {
    return (
        <nav className="bg-white border-b border-servimedia-border sticky top-0 z-40 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 lg:px-8">
                <div className="flex justify-between h-24 items-center">
                    <div className="flex items-center gap-5 cursor-pointer group" onClick={onLogoClick}>
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
                        <button onClick={() => onModeChange(AppMode.AUDIO)} className={`flex items-center gap-2 px-4 h-full border-b-4 transition-all font-black text-[10px] uppercase tracking-[0.1em] ${mode === AppMode.AUDIO ? 'border-servimedia-pink text-servimedia-pink bg-servimedia-pink/5' : 'border-transparent text-servimedia-gray hover:text-servimedia-pink'}`}>
                            <Mic2 className="w-3.5 h-3.5" /> Audio a Texto
                        </button>
                        <button onClick={() => onModeChange(AppMode.PRESS_RELEASE)} className={`flex items-center gap-2 px-4 h-full border-b-4 transition-all font-black text-[10px] uppercase tracking-[0.1em] ${mode === AppMode.PRESS_RELEASE ? 'border-servimedia-orange text-servimedia-orange bg-servimedia-orange/5' : 'border-transparent text-servimedia-gray hover:text-servimedia-orange'}`}>
                            <Newspaper className="w-3.5 h-3.5" /> Notas de Prensa
                        </button>
                        <button onClick={() => onModeChange(AppMode.WRITING_ASSISTANT)} className={`flex items-center gap-2 px-4 h-full border-b-4 transition-all font-black text-[10px] uppercase tracking-[0.1em] ${mode === AppMode.WRITING_ASSISTANT ? 'border-servimedia-orange text-servimedia-orange bg-servimedia-orange/5' : 'border-transparent text-servimedia-gray hover:text-servimedia-orange'}`}>
                            <PenTool className="w-3.5 h-3.5" /> Asistente Redacción
                        </button>
                    </div>

                    <div className="flex items-center gap-6">
                        <button onClick={onHistoryOpen} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40 hover:text-servimedia-pink transition-colors">
                            <HistoryIcon className="w-5 h-5" />
                            <span className="hidden lg:inline">Archivo</span>
                        </button>

                        {isAdmin && (
                            <button onClick={onCostEstimatorOpen} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40 hover:text-servimedia-pink transition-colors">
                                <Shield className="w-5 h-5" />
                                <span className="hidden lg:inline">Panel Admin</span>
                            </button>
                        )}
                        {userEmail ? (
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 bg-servimedia-light px-4 py-2 rounded-full border border-servimedia-border">
                                    <User className="w-4 h-4 text-servimedia-pink" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/60">{userEmail.split('@')[0]}</span>
                                </div>
                                <button
                                    onClick={onLogout}
                                    className="p-3 hover:bg-red-50 text-servimedia-gray/20 hover:text-red-500 rounded-full transition-all group"
                                    title="Cerrar Sesión"
                                >
                                    <LogIn className="w-5 h-5 rotate-180 group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={onAuthOpen}
                                className="flex items-center gap-3 bg-servimedia-gray px-6 py-3 rounded-full text-white hover:bg-servimedia-pink transition-all shadow-lg shadow-servimedia-gray/10 group active:scale-95"
                            >
                                <LogIn className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Acceso Cloud</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
};
