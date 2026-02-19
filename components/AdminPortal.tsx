import React, { useState, useEffect } from 'react';
import {
    X, Users, BarChart3, Settings,
    Shield, ShieldAlert, ToggleLeft, ToggleRight,
    Loader2, CheckCircle, Search, Save, KeyRound, Sparkles, DollarSign, TrendingUp, Zap, FileAudio, FileText, MessageSquare
} from 'lucide-react';
import { supabase } from '../services/supabase';
import {
    calculateAudioCost, calculatePressReleaseCost, calculateChatCost,
    calculateMonthlyProjection, formatCurrency, GEMINI_3_PRO_PRICING, GEMINI_3_FLASH_PRICING
} from '../utils/costCalculator';

interface Profile {
    id: string;
    email: string;
    is_admin: boolean;
    is_active: boolean;
    created_at: string;
}

interface AdminPortalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface CostData {
    totalAudioJobs: number;
    totalPressJobs: number;
    estimatedTotalCost: number;
    audioCostTotal: number;
    pressCostTotal: number;
    chatCostTotal: number;
    avgAudioMinutes: number;
    avgDocSizeKB: number;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'stats' | 'config' | 'costs'>('users');
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [stats, setStats] = useState({ totalAudios: 0, totalPressReleases: 0, totalUsers: 0 });
    const [regKey, setRegKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [savingKey, setSavingKey] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [costs, setCosts] = useState<CostData | null>(null);
    const [monthlyAudio, setMonthlyAudio] = useState(10);
    const [monthlyPress, setMonthlyPress] = useState(5);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch Profiles
            const { data: pData, error: pError } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (pError) {
                console.error('Error fetching profiles:', pError);
                throw pError;
            }
            setProfiles(pData || []);

            // Fetch Registration Key
            const { data: kData, error: kError } = await supabase
                .from('app_settings')
                .select('value')
                .eq('id', 'registration_key')
                .maybeSingle();

            if (kError) console.error('Error fetching reg key:', kError);
            if (kData) setRegKey(kData.value);

            // Fetch Gemini Key
            const { data: gData, error: gError } = await supabase
                .from('app_settings')
                .select('value')
                .eq('id', 'gemini_api_key')
                .maybeSingle();

            if (gError) console.error('Error fetching gemini key:', gError);
            if (gData) setGeminiKey(gData.value);

            // Fetch Stats
            const { count: audioCount } = await supabase
                .from('audio_jobs')
                .select('*', { count: 'exact', head: true })
                .eq('job_type', 'audio');

            const { count: pressCount } = await supabase
                .from('audio_jobs')
                .select('*', { count: 'exact', head: true })
                .eq('job_type', 'press_release');

            // Count total jobs (including those without job_type for backwards compatibility)
            const { count: totalJobCount } = await supabase
                .from('audio_jobs')
                .select('*', { count: 'exact', head: true });

            setStats({
                totalUsers: pData?.length || 0,
                totalAudios: audioCount ?? (totalJobCount ?? 0),
                totalPressReleases: pressCount ?? 0
            });

            // Fetch actual job data for cost calculation
            const { data: jobData } = await supabase
                .from('audio_jobs')
                .select('job_type, file_name, result')
                .order('created_at', { ascending: false })
                .limit(200);

            if (jobData && jobData.length > 0) {
                const audioJobs = jobData.filter(j => j.job_type === 'audio');
                const pressJobs = jobData.filter(j => j.job_type === 'press_release');
                // Estimate audio minutes from transcription length (rough: 150 words/min, 5 chars/word)
                const estimateMinutes = (job: any) => {
                    const transcription = job.result?.transcription || '';
                    return Math.max(1, transcription.length / (150 * 5));
                };
                const avgAudioMin = audioJobs.length > 0
                    ? audioJobs.reduce((sum, j) => sum + estimateMinutes(j), 0) / audioJobs.length
                    : 5;
                const audioCostTotal = audioJobs.reduce((sum, j) => sum + calculateAudioCost(estimateMinutes(j), 'paid').totalCost, 0);
                const pressCostTotal = pressJobs.reduce((sum, _j) => sum + calculatePressReleaseCost(50, 'paid').totalCost, 0);
                // Estimate chat messages per audio job (average 3 chat interactions)
                const chatCostTotal = jobData.length * calculateChatCost(100, 3, 'paid').totalCost;
                setCosts({
                    totalAudioJobs: audioJobs.length,
                    totalPressJobs: pressJobs.length,
                    estimatedTotalCost: audioCostTotal + pressCostTotal + chatCostTotal,
                    audioCostTotal,
                    pressCostTotal,
                    chatCostTotal,
                    avgAudioMinutes: Math.round(avgAudioMin * 10) / 10,
                    avgDocSizeKB: 50,
                });
            }

        } catch (err: any) {
            console.error('Error fetching admin data:', err);
            setMessage({ type: 'error', text: 'Error al cargar datos de administración' });
        } finally {
            setLoading(false);
        }
    };

    const toggleAdmin = async (profileId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_admin: !currentStatus })
                .eq('id', profileId);

            if (error) throw error;
            setProfiles(profiles.map(p => p.id === profileId ? { ...p, is_admin: !currentStatus } : p));
        } catch (err) {
            setMessage({ type: 'error', text: 'No se pudo actualizar el estado de admin' });
        }
    };

    const toggleActive = async (profileId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_active: !currentStatus })
                .eq('id', profileId);

            if (error) throw error;
            setProfiles(profiles.map(p => p.id === profileId ? { ...p, is_active: !currentStatus } : p));
        } catch (err) {
            setMessage({ type: 'error', text: 'No se pudo actualizar el estado de la cuenta' });
        }
    };

    const updateRegKey = async () => {
        setSavingKey(true);
        try {
            console.log('Updating registration key...');
            const { error } = await supabase
                .from('app_settings')
                .upsert({ id: 'registration_key', value: regKey });

            if (error) throw error;
            setMessage({ type: 'success', text: 'Clave de registro actualizada correctamente' });
            setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
            console.error('Error updating reg key:', err);
            setMessage({ type: 'error', text: `Error: ${err.message || err.error_description || 'No se pudo actualizar la clave'}` });
        } finally {
            setSavingKey(false);
        }
    };

    if (!isOpen) return null;

    const filteredProfiles = profiles.filter(p =>
        p.email?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-5xl rounded-[2rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden border border-servimedia-border animate-in zoom-in-95 duration-300 h-[95vh] md:h-[85vh] flex flex-col">

                {/* Header */}
                <div className="p-8 border-b border-servimedia-light flex items-center justify-between bg-gradient-to-r from-servimedia-gray to-servimedia-gray/80 text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="font-black text-xl tracking-tighter uppercase">Panel de Control</h2>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Administración Servimedia IA</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs & Search */}
                <div className="bg-servimedia-light/50 px-4 md:px-8 py-4 border-b border-servimedia-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex gap-2 overflow-x-auto pb-1 w-full sm:w-auto">
                        {[
                            { id: 'users', label: 'Usuarios', icon: Users },
                            { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
                            { id: 'costs', label: 'Costes API', icon: DollarSign },
                            { id: 'config', label: 'Configuración', icon: Settings },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id
                                    ? 'bg-servimedia-pink text-white shadow-lg shadow-servimedia-pink/20'
                                    : 'text-servimedia-gray/40 hover:text-servimedia-gray hover:bg-white'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'users' && (
                        <div className="relative w-full max-w-xs">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-servimedia-gray/20" />
                            <input
                                type="text"
                                placeholder="Buscar usuario..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-11 pr-4 py-2 bg-white border border-servimedia-border rounded-full text-xs outline-none focus:ring-2 focus:ring-servimedia-pink/10 transition-all font-sans"
                            />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    {message && (
                        <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                            <p className="text-sm font-bold">{message.text}</p>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-servimedia-gray/20">
                            <Loader2 className="w-12 h-12 animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Cargando datos...</p>
                        </div>
                    ) : activeTab === 'users' ? (
                        <div className="bg-white border border-servimedia-border rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-servimedia-light/50 border-b border-servimedia-border">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-servimedia-gray/40 tracking-widest">Usuario</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-servimedia-gray/40 tracking-widest">Rol</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-servimedia-gray/40 tracking-widest">Estado</th>
                                        <th className="px-6 py-4 text-[10px] font-black uppercase text-servimedia-gray/40 tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-servimedia-light">
                                    {filteredProfiles.map(profile => (
                                        <tr key={profile.id} className="hover:bg-servimedia-light/20 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-servimedia-gray">{profile.email}</span>
                                                    <span className="text-[9px] text-servimedia-gray/40 uppercase font-bold tracking-tighter">ID: {profile.id.slice(0, 8)}...</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => toggleAdmin(profile.id, profile.is_admin)}
                                                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${profile.is_admin
                                                        ? 'bg-servimedia-pink/10 text-servimedia-pink border border-servimedia-pink/20'
                                                        : 'bg-servimedia-gray/5 text-servimedia-gray/40 border border-servimedia-gray/10'
                                                        }`}
                                                >
                                                    <Shield className="w-3 h-3" />
                                                    {profile.is_admin ? 'Admin' : 'Usuario'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${profile.is_active
                                                    ? 'bg-green-50 text-green-600 border border-green-100'
                                                    : 'bg-red-50 text-red-600 border border-red-100'
                                                    }`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${profile.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                                                    {profile.is_active ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => toggleActive(profile.id, profile.is_active)}
                                                    className="p-2 hover:bg-servimedia-light rounded-xl transition-all"
                                                >
                                                    {profile.is_active ? (
                                                        <ToggleRight className="w-7 h-7 text-green-500" />
                                                    ) : (
                                                        <ToggleLeft className="w-7 h-7 text-servimedia-gray/20" />
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : activeTab === 'costs' ? (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            {/* Total Cost Banner */}
                            <div className="bg-gradient-to-br from-servimedia-gray to-black rounded-3xl p-8 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-servimedia-pink/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4" />
                                <DollarSign className="w-10 h-10 mb-4 opacity-30" />
                                <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60 mb-2">Gasto Estimado Total (histórico)</p>
                                <h2 className="text-5xl font-black tracking-tighter mb-1">
                                    {costs ? formatCurrency(costs.estimatedTotalCost) : '–'}
                                </h2>
                                <p className="text-[10px] opacity-40 mt-2">Basado en {(costs?.totalAudioJobs || 0) + (costs?.totalPressJobs || 0)} trabajos completados • Cálculo estimado</p>
                            </div>

                            {/* Breakdown */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-servimedia-pink/5 border border-servimedia-pink/20 rounded-2xl p-6">
                                    <FileAudio className="w-6 h-6 text-servimedia-pink mb-3 opacity-60" />
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-servimedia-gray/40 mb-1">Transcripciones Audio</p>
                                    <p className="text-2xl font-black text-servimedia-gray">{costs ? formatCurrency(costs.audioCostTotal) : '–'}</p>
                                    <p className="text-[9px] text-servimedia-gray/30 mt-1">{costs?.totalAudioJobs || 0} trabajos · ~{costs?.avgAudioMinutes || 0} min/media</p>
                                </div>
                                <div className="bg-servimedia-orange/5 border border-servimedia-orange/20 rounded-2xl p-6">
                                    <FileText className="w-6 h-6 text-servimedia-orange mb-3 opacity-60" />
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-servimedia-gray/40 mb-1">Notas de Prensa</p>
                                    <p className="text-2xl font-black text-servimedia-gray">{costs ? formatCurrency(costs.pressCostTotal) : '–'}</p>
                                    <p className="text-[9px] text-servimedia-gray/30 mt-1">{costs?.totalPressJobs || 0} trabajos</p>
                                </div>
                                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
                                    <MessageSquare className="w-6 h-6 text-blue-400 mb-3 opacity-60" />
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-servimedia-gray/40 mb-1">Chat & Verificaciones</p>
                                    <p className="text-2xl font-black text-servimedia-gray">{costs ? formatCurrency(costs.chatCostTotal) : '–'}</p>
                                    <p className="text-[9px] text-servimedia-gray/30 mt-1">~3 chats por trabajo (estimado)</p>
                                </div>
                            </div>

                            {/* Monthly Projection */}
                            <div className="bg-servimedia-light/50 border border-servimedia-border rounded-3xl p-8">
                                <div className="flex items-center gap-3 mb-6">
                                    <TrendingUp className="w-5 h-5 text-servimedia-pink" />
                                    <h3 className="text-sm font-black uppercase tracking-wider text-servimedia-gray">Proyección Mensual</h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40 block mb-2">
                                            Audios al mes: <span className="text-servimedia-pink">{monthlyAudio}</span>
                                        </label>
                                        <input type="range" min={0} max={100} value={monthlyAudio} onChange={e => setMonthlyAudio(Number(e.target.value))}
                                            className="w-full accent-servimedia-pink" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40 block mb-2">
                                            Notas de prensa: <span className="text-servimedia-orange">{monthlyPress}</span>
                                        </label>
                                        <input type="range" min={0} max={50} value={monthlyPress} onChange={e => setMonthlyPress(Number(e.target.value))}
                                            className="w-full accent-servimedia-orange" />
                                    </div>
                                </div>
                                <div className="bg-white rounded-2xl p-6 border border-servimedia-border flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40">Coste mensual estimado</p>
                                        <p className="text-4xl font-black text-servimedia-gray mt-1">
                                            {formatCurrency(calculateMonthlyProjection(
                                                { audioTranscriptions: monthlyAudio, pressReleases: monthlyPress, chatMessages: monthlyAudio * 3, madridSummaries: 0 },
                                                'paid', costs?.avgAudioMinutes || 5, 50
                                            ).totalCost)}
                                        </p>
                                    </div>
                                    <Zap className="w-12 h-12 text-servimedia-gray/5" />
                                </div>
                            </div>

                            {/* Pricing reference */}
                            <div className="bg-white border border-servimedia-border rounded-2xl overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-servimedia-border bg-servimedia-light/30">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40">Tarifas Gemini (referencia oficial)</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-servimedia-light/30">
                                            <tr>
                                                <th className="px-4 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Modelo</th>
                                                <th className="px-4 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Input (1M tokens)</th>
                                                <th className="px-4 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Audio (1M tokens)</th>
                                                <th className="px-4 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Output (1M tokens)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-servimedia-border">
                                            <tr className="hover:bg-servimedia-light/20 transition-colors">
                                                <td className="px-4 py-4 font-black text-servimedia-gray">Gemini 2.5 Pro</td>
                                                <td className="px-4 py-4 text-servimedia-gray/60">{formatCurrency(GEMINI_3_PRO_PRICING.paid.inputPrice)}</td>
                                                <td className="px-4 py-4 text-servimedia-gray/40">—</td>
                                                <td className="px-4 py-4 text-servimedia-gray/60">{formatCurrency(GEMINI_3_PRO_PRICING.paid.outputPrice)}</td>
                                            </tr>
                                            <tr className="hover:bg-servimedia-light/20 transition-colors">
                                                <td className="px-4 py-4 font-black text-servimedia-gray">Gemini 2.5 Flash</td>
                                                <td className="px-4 py-4 text-servimedia-gray/60">{formatCurrency(GEMINI_3_FLASH_PRICING.paid.inputPrice)}</td>
                                                <td className="px-4 py-4 text-servimedia-gray/60">{formatCurrency(GEMINI_3_FLASH_PRICING.paid.audioInputPrice || 0)}</td>
                                                <td className="px-4 py-4 text-servimedia-gray/60">{formatCurrency(GEMINI_3_FLASH_PRICING.paid.outputPrice)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'stats' ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-8 bg-gradient-to-br from-servimedia-pink to-servimedia-pink/80 rounded-3xl text-white shadow-xl shadow-servimedia-pink/20">
                                <Users className="w-8 h-8 mb-4 opacity-50" />
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-1">Total Usuarios</p>
                                <h3 className="text-4xl font-black">{stats.totalUsers}</h3>
                            </div>
                            <div className="p-8 bg-gradient-to-br from-green-600 to-green-500 rounded-3xl text-white shadow-xl shadow-green-600/20">
                                <BarChart3 className="w-8 h-8 mb-4 opacity-50" />
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-1">Audios Procesados</p>
                                <h3 className="text-4xl font-black">{stats.totalAudios}</h3>
                            </div>
                            <div className="p-8 bg-gradient-to-br from-servimedia-orange to-servimedia-orange/80 rounded-3xl text-white shadow-xl shadow-servimedia-orange/20">
                                <Save className="w-8 h-8 mb-4 opacity-50" />
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-1">Notas de Prensa</p>
                                <h3 className="text-4xl font-black">{stats.totalPressReleases}</h3>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <KeyRound className="w-5 h-5 text-servimedia-pink" />
                                    <h3 className="text-sm font-black text-servimedia-gray uppercase tracking-wider">Gestión de Acceso</h3>
                                </div>
                                <div className="bg-servimedia-light/30 rounded-3xl p-8 border border-servimedia-border space-y-6">
                                    <div>
                                        <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-3 ml-2">
                                            Clave de Registro Actual
                                        </label>
                                        <input
                                            type="text"
                                            value={regKey}
                                            onChange={(e) => setRegKey(e.target.value)}
                                            placeholder="Ej: servimedia2026"
                                            className="w-full p-4 bg-white border border-servimedia-border rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none font-sans transition-all text-lg mb-4"
                                        />
                                        <p className="text-[10px] text-servimedia-gray/40 px-2 leading-relaxed">
                                            Esta es la clave que los nuevos usuarios deben introducir para crear una cuenta. Al cambiarla aquí, se actualizará instantáneamente para todo el sistema.
                                        </p>
                                    </div>
                                    <button
                                        onClick={updateRegKey}
                                        disabled={savingKey || !regKey}
                                        className="w-full py-4 bg-servimedia-pink text-white rounded-2xl font-black uppercase tracking-wider hover:bg-servimedia-pink/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-servimedia-pink/20"
                                    >
                                        {savingKey ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                        {savingKey ? 'Guardando...' : 'Actualizar Clave'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <Sparkles className="w-5 h-5 text-servimedia-pink" />
                                    <h3 className="text-sm font-black text-servimedia-gray uppercase tracking-wider">Google Gemini API</h3>
                                </div>
                                <div className="bg-servimedia-light/30 rounded-3xl p-8 border border-servimedia-border space-y-6">
                                    <div>
                                        <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-3 ml-2">
                                            API Key Global
                                        </label>
                                        <input
                                            type="password"
                                            value={geminiKey}
                                            onChange={(e) => setGeminiKey(e.target.value)}
                                            placeholder="Introduce la API Key de Google"
                                            className="w-full p-4 bg-white border border-servimedia-border rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none font-sans transition-all text-lg mb-4"
                                        />
                                        <p className="text-[10px] text-servimedia-gray/40 px-2 leading-relaxed">
                                            Esta clave se usará de forma global para todos los usuarios de la plataforma. Asegúrate de que tenga cuota suficiente.
                                        </p>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            setSavingKey(true);
                                            try {
                                                const { error } = await supabase
                                                    .from('app_settings')
                                                    .upsert({ id: 'gemini_api_key', value: geminiKey });
                                                if (error) throw error;
                                                setMessage({ type: 'success', text: 'API Key actualizada correctamente' });
                                                setTimeout(() => setMessage(null), 3000);
                                            } catch (err: any) {
                                                console.error('Error updating Gemini key:', err);
                                                setMessage({ type: 'error', text: `Error: ${err.message || 'Error al actualizar la API Key'}` });
                                            } finally {
                                                setSavingKey(false);
                                            }
                                        }}
                                        disabled={savingKey || !geminiKey}
                                        className="w-full py-4 bg-servimedia-pink text-white rounded-2xl font-black uppercase tracking-wider hover:bg-servimedia-pink/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-servimedia-pink/20"
                                    >
                                        {savingKey ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                        {savingKey ? 'Guardando...' : 'Guardar API Key'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-4 bg-servimedia-light/30 border-t border-servimedia-border flex justify-between items-center">
                    <p className="text-[9px] font-black text-servimedia-gray/20 uppercase tracking-widest italic">
                        Servimedia IA • Panel de Control Avanzado
                    </p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-servimedia-gray text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all"
                    >
                        Cerrar Panel
                    </button>
                </div>
            </div>
        </div>
    );
};
