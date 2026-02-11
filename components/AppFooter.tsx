
import React from 'react';
import { RobotLogo } from './AppHeader';

export const AppFooter: React.FC = () => {
    return (
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
    );
};
