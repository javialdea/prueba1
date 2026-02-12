import React from 'react';
import { RobotLogo } from './AppHeader';
import { Sparkles, Mic2, ShieldCheck, ChevronRight, Globe } from 'lucide-react';

interface LandingPageProps {
    onLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
    return (
        <div className="min-h-screen bg-servimedia-light flex flex-col font-sans selection:bg-servimedia-pink/20">
            {/* Decorative Background Elements */}
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-servimedia-pink/5 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute top-1/2 -right-48 w-[500px] h-[500px] bg-servimedia-orange/5 rounded-full blur-3xl"></div>
            </div>

            {/* Top Banner */}
            <div className="h-2 w-full flex relative z-10">
                <div className="h-full w-1/2 bg-servimedia-pink"></div>
                <div className="h-full w-1/2 bg-servimedia-orange"></div>
            </div>

            <main className="flex-grow flex flex-col items-center justify-center p-6 relative z-10">
                <div className="max-w-4xl w-full text-center space-y-12">
                    {/* Logo & Identity */}
                    <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-top-12 duration-1000">
                        <RobotLogo className="w-32 h-32 drop-shadow-2xl" />
                        <div className="space-y-2">
                            <div className="text-6xl font-black tracking-tighter flex items-center justify-center leading-none">
                                <span className="text-servimedia-pink">servimed-</span>
                                <span className="text-servimedia-orange animate-pulse">IA</span>
                            </div>
                            <p className="text-xs font-black uppercase tracking-[0.5em] text-servimedia-gray/30">
                                Innovación y Periodismo
                            </p>
                        </div>
                    </div>

                    {/* Hero Section */}
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
                        <h1 className="text-5xl md:text-7xl font-black text-servimedia-gray leading-[1.1] tracking-tight">
                            Una herramienta de IA creada <span className="text-servimedia-pink underline decoration-servimedia-orange/30 decoration-8 underline-offset-8">por y para</span> Servimedia
                        </h1>
                    </div>

                    {/* Value Props */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-1000 delay-500">
                        {[
                            { icon: Mic2, label: 'Audio a Texto', color: 'text-servimedia-pink' },
                            { icon: Globe, label: 'Análisis de Contenidos', color: 'text-servimedia-orange' },
                            { icon: ShieldCheck, label: 'Privacidad Total', color: 'text-servimedia-gray' }
                        ].map((prop, i) => (
                            <div key={i} className="bg-white/50 backdrop-blur-sm p-6 rounded-[2rem] border border-servimedia-border flex items-center gap-4 transition-all hover:bg-white hover:shadow-xl hover:shadow-servimedia-gray/5 group">
                                <div className={`p-4 rounded-2xl bg-white shadow-sm transition-transform group-hover:scale-110 ${prop.color}`}>
                                    <prop.icon className="w-6 h-6" />
                                </div>
                                <span className="font-black uppercase tracking-widest text-[10px] text-servimedia-gray text-left leading-tight">
                                    {prop.label}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* CTA Button */}
                    <div className="pt-8 animate-in fade-in zoom-in-90 duration-1000 delay-700">
                        <button
                            onClick={onLogin}
                            className="group relative inline-flex items-center gap-4 bg-servimedia-gray px-12 py-8 rounded-full text-white font-black uppercase tracking-[0.3em] text-sm overflow-hidden transition-all hover:bg-servimedia-pink hover:scale-105 active:scale-95 shadow-2xl shadow-servimedia-gray/20"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-servimedia-pink to-servimedia-orange opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <span className="relative flex items-center gap-4">
                                Empezar Ahora <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </span>
                        </button>
                        <p className="mt-8 text-[10px] font-bold text-servimedia-gray/20 uppercase tracking-[0.3em]">
                            Un proyecto creado por Javier Aldea
                        </p>
                    </div>
                </div>
            </main>

            <footer className="p-10 text-center opacity-30 relative z-10">
                <div className="w-12 h-1 bg-servimedia-border mx-auto mb-6"></div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-servimedia-gray">
                    © 2026 Agencia Servimedia • Todos los derechos reservados
                </p>
            </footer>
        </div>
    );
};
