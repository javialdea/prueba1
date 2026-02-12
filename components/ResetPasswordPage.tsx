import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../services/supabase';

interface ResetPasswordPageProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onSuccess, onCancel }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const validatePassword = () => {
        if (newPassword.length < 8) {
            return 'La contraseña debe tener al menos 8 caracteres';
        }
        if (newPassword !== confirmPassword) {
            return 'Las contraseñas no coinciden';
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const validationError = validatePassword();
        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            setSuccess(true);
            setTimeout(() => {
                onSuccess();
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Error al actualizar la contraseña');
        } finally {
            setLoading(false);
        }
    };

    const getPasswordStrength = () => {
        if (newPassword.length === 0) return { strength: 0, label: '', color: '' };
        if (newPassword.length < 6) return { strength: 25, label: 'Muy débil', color: 'bg-red-500' };
        if (newPassword.length < 8) return { strength: 50, label: 'Débil', color: 'bg-orange-500' };
        if (newPassword.length < 12) return { strength: 75, label: 'Buena', color: 'bg-yellow-500' };
        return { strength: 100, label: 'Fuerte', color: 'bg-green-500' };
    };

    const passwordStrength = getPasswordStrength();

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-servimedia-pink/10 via-white to-servimedia-orange/10">
            <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-servimedia-border">
                <div className="p-10 border-b border-servimedia-light bg-gradient-to-r from-servimedia-pink to-servimedia-orange text-white">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                            <Lock className="w-7 h-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tighter uppercase">Restablecer Contraseña</h1>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">Introduce tu nueva contraseña</p>
                        </div>
                    </div>
                </div>

                <div className="p-10">
                    {success ? (
                        <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle className="w-10 h-10 text-green-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-servimedia-gray mb-2">¡Contraseña Actualizada!</h2>
                                <p className="text-sm text-servimedia-gray/60">
                                    Tu contraseña ha sido restablecida correctamente. Redirigiendo...
                                </p>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Nueva Contraseña
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-servimedia-gray/20" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Mínimo 8 caracteres"
                                        required
                                        className="w-full pl-12 pr-12 py-4 bg-servimedia-light border-none rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none font-sans transition-all text-lg"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-servimedia-gray/20 hover:text-servimedia-gray/40 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>

                                {newPassword && (
                                    <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-servimedia-gray/40 font-bold">Fortaleza:</span>
                                            <span className={`font-black ${passwordStrength.strength >= 75 ? 'text-green-600' : passwordStrength.strength >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {passwordStrength.label}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-servimedia-light rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${passwordStrength.color} transition-all duration-300`}
                                                style={{ width: `${passwordStrength.strength}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
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
                                        className="w-full pl-12 pr-4 py-4 bg-servimedia-light border-none rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none font-sans transition-all text-lg"
                                    />
                                </div>
                                {confirmPassword && newPassword !== confirmPassword && (
                                    <p className="text-xs text-red-600 mt-2 ml-2 font-bold animate-in fade-in slide-in-from-top-1 duration-200">
                                        Las contraseñas no coinciden
                                    </p>
                                )}
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-4 bg-red-50 rounded-2xl border border-red-200 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                                className="w-full py-4 bg-gradient-to-r from-servimedia-pink to-servimedia-orange text-white rounded-2xl font-black uppercase tracking-wider hover:shadow-lg hover:shadow-servimedia-pink/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Actualizando...
                                    </>
                                ) : (
                                    'Restablecer Contraseña'
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={onCancel}
                                className="w-full py-3 text-servimedia-gray/40 hover:text-servimedia-gray font-bold text-sm transition-colors flex items-center justify-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Volver al inicio
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
