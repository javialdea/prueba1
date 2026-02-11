import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { LogIn, UserPlus, Loader2, X, Mail, Lock } from 'lucide-react';

interface AuthModalProps {
    onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                alert("¡Registro con éxito! Por favor, verifica tu correo.");
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            }
            onClose();
        } catch (err: any) {
            setError(err.message || "Error de autenticación");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-servimedia-gray/40 backdrop-blur-md animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-10 border-b border-servimedia-light flex justify-between items-center bg-servimedia-orange text-white">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter">Acceso Servimedia Cloud</h3>
                        <p className="text-[10px] uppercase font-bold tracking-widest opacity-70">Gestiona tus transcripciones en la nube</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white/20 rounded-full transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleAuth} className="p-10 space-y-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40 px-4">Correo Electrónico</label>
                            <div className="relative">
                                <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-servimedia-gray/20" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-servimedia-light border-none rounded-2xl py-5 pl-16 pr-6 focus:ring-2 focus:ring-servimedia-orange/30 transition-all font-sans"
                                    placeholder="periodista@servimedia.es"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40 px-4">Contraseña</label>
                            <div className="relative">
                                <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-servimedia-gray/20" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-servimedia-light border-none rounded-2xl py-5 pl-16 pr-6 focus:ring-2 focus:ring-servimedia-orange/30 transition-all font-sans"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-center animate-in shake">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-servimedia-orange text-white py-6 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-servimedia-orange/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (isSignUp ? <UserPlus className="w-6 h-6" /> : <LogIn className="w-6 h-6" />)}
                        {isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="w-full text-[10px] font-black uppercase tracking-[0.2em] text-servimedia-gray/30 hover:text-servimedia-orange transition-all"
                    >
                        {isSignUp ? '¿Ya tienes cuenta? Entra aquí' : '¿No tienes cuenta? Regístrate gratis'}
                    </button>
                </form>
            </div>
        </div>
    );
};
