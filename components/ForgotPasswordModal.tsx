import React, { useState } from 'react';
import { X, Mail, Lock, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../services/supabase';

interface ForgotPasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (error) throw error;

            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSuccess(false);
                setEmail('');
            }, 3000);
        } catch (err: any) {
            setError(err.message || 'Error al enviar el correo de recuperación');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-servimedia-border animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b border-servimedia-light flex items-center justify-between bg-gradient-to-r from-servimedia-pink/10 to-servimedia-orange/10">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-servimedia-pink rounded-xl flex items-center justify-center text-white">
                            <Lock className="w-5 h-5" />
                        </div>
                        <h2 className="font-black text-servimedia-gray text-xl tracking-tighter uppercase">Recuperar Contraseña</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-servimedia-gray/20 hover:text-servimedia-pink transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-10">
                    {success ? (
                        <div className="text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="text-xl font-black text-servimedia-gray">¡Correo Enviado!</h3>
                            <p className="text-sm text-servimedia-gray/60">
                                Revisa tu bandeja de entrada. Te hemos enviado un enlace para restablecer tu contraseña.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <p className="text-sm text-servimedia-gray/60 text-center">
                                Introduce tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
                            </p>

                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Correo Electrónico
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-servimedia-gray/20" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="tu@email.com"
                                        required
                                        className="w-full pl-12 pr-4 py-4 bg-servimedia-light border-none rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none font-sans transition-all text-lg"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-4 bg-red-50 rounded-2xl border border-red-200 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !email}
                                className="w-full py-4 bg-servimedia-pink text-white rounded-2xl font-black uppercase tracking-wider hover:bg-servimedia-pink/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-servimedia-pink/20"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Enviando...
                                    </>
                                ) : (
                                    'Enviar Enlace de Recuperación'
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full py-3 text-servimedia-gray/40 hover:text-servimedia-gray font-bold text-sm transition-colors"
                            >
                                Cancelar
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
