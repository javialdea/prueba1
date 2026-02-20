import React, { useState, useEffect } from 'react';
import { Lock, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../services/supabase';

export const ResetPasswordPage: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // Check for error in URL
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        const errorParam = params.get('error');

        if (errorParam) {
            switch (errorParam) {
                case 'token_expired':
                    setError('El enlace ha expirado. Por favor, solicita uno nuevo.');
                    break;
                case 'invalid_token':
                    setError('El enlace no es válido. Por favor, solicita uno nuevo.');
                    break;
                default:
                    setError('Ha ocurrido un error. Por favor, inténtalo de nuevo.');
            }
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { error } = await supabase.auth.updateUser({ password });

            if (error) throw error;

            setSuccess(true);
            // Sign out the recovery session so the user logs in fresh
            await supabase.auth.signOut();
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Error al actualizar la contraseña');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-servimedia-pink/5 to-servimedia-orange/5 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-servimedia-border">
                <div className="p-8 border-b border-servimedia-light bg-gradient-to-r from-servimedia-pink/10 to-servimedia-orange/10">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-servimedia-pink rounded-xl flex items-center justify-center text-white">
                            <Lock className="w-5 h-5" />
                        </div>
                        <h2 className="font-black text-servimedia-gray text-xl tracking-tighter uppercase">
                            Nueva Contraseña
                        </h2>
                    </div>
                </div>

                <div className="p-10">
                    {success ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="text-xl font-black text-servimedia-gray">¡Contraseña Actualizada!</h3>
                            <p className="text-sm text-servimedia-gray/60">Redirigiendo a inicio de sesión...</p>
                        </div>
                    ) : error && !password ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 p-4 bg-red-50 rounded-2xl border border-red-200">
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="w-full py-4 bg-servimedia-pink text-white rounded-2xl font-black uppercase tracking-wider hover:bg-servimedia-pink/90 transition-all"
                            >
                                Volver al Inicio
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <p className="text-sm text-servimedia-gray/60 text-center">
                                Introduce tu nueva contraseña
                            </p>

                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Nueva Contraseña
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-servimedia-gray/20" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Mínimo 6 caracteres"
                                        required
                                        className="w-full pl-12 pr-12 py-4 bg-servimedia-light border-none rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none text-lg"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-servimedia-gray/20"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Confirmar Contraseña
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-servimedia-gray/20" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Repite la contraseña"
                                        required
                                        className="w-full pl-12 pr-4 py-4 bg-servimedia-light border-none rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none text-lg"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-4 bg-red-50 rounded-2xl border border-red-200">
                                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !password || !confirmPassword}
                                className="w-full py-4 bg-servimedia-pink text-white rounded-2xl font-black uppercase tracking-wider hover:bg-servimedia-pink/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    'Guardar Nueva Contraseña'
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
