import React, { useState } from 'react';
import { Lock, Mail, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../services/supabase';

interface OTPPasswordResetProps {
    isOpen: boolean;
    onClose: () => void;
}

export const OTPPasswordReset: React.FC<OTPPasswordResetProps> = ({ isOpen, onClose }) => {
    const [step, setStep] = useState<'email' | 'otp'>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email);
            if (error) throw error;

            setStep('otp');
        } catch (err: any) {
            setError(err.message || 'Error al enviar el código');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (newPassword.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { error } = await supabase.auth.verifyOtp({
                email,
                token: otp,
                type: 'recovery'
            });

            if (error) throw error;

            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (updateError) throw updateError;

            setSuccess(true);
            setTimeout(() => {
                onClose();
                window.location.reload();
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Código inválido o expirado');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-servimedia-border">
                <div className="p-8 border-b border-servimedia-light bg-gradient-to-r from-servimedia-pink/10 to-servimedia-orange/10">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-servimedia-pink rounded-xl flex items-center justify-center text-white">
                            <Lock className="w-5 h-5" />
                        </div>
                        <h2 className="font-black text-servimedia-gray text-xl tracking-tighter uppercase">
                            Recuperar Contraseña
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
                            <p className="text-sm text-servimedia-gray/60">Recargando...</p>
                        </div>
                    ) : step === 'email' ? (
                        <form onSubmit={handleSendOTP} className="space-y-6">
                            <p className="text-sm text-servimedia-gray/60 text-center">
                                Introduce tu correo y te enviaremos un código de 6 dígitos
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
                                disabled={loading || !email}
                                className="w-full py-4 bg-servimedia-pink text-white rounded-2xl font-black uppercase tracking-wider hover:bg-servimedia-pink/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Enviando...
                                    </>
                                ) : (
                                    'Enviar Código'
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
                    ) : (
                        <form onSubmit={handleResetPassword} className="space-y-6">
                            <p className="text-sm text-servimedia-gray/60 text-center">
                                Introduce el código de 6 dígitos que te enviamos a <strong>{email}</strong>
                            </p>

                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Código de Verificación
                                </label>
                                <input
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    required
                                    maxLength={6}
                                    className="w-full px-4 py-4 bg-servimedia-light border-none rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none text-center text-2xl font-bold tracking-widest"
                                />
                            </div>

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
                                disabled={loading || !otp || !newPassword || !confirmPassword}
                                className="w-full py-4 bg-servimedia-pink text-white rounded-2xl font-black uppercase tracking-wider hover:bg-servimedia-pink/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Verificando...
                                    </>
                                ) : (
                                    'Restablecer Contraseña'
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('email')}
                                className="w-full py-3 text-servimedia-gray/40 hover:text-servimedia-gray font-bold text-sm transition-colors"
                            >
                                Volver
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
