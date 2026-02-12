
import React, { useState } from 'react';
import { X, DollarSign, TrendingUp, Calculator, Info, Zap } from 'lucide-react';
import {
    calculateAudioCost,
    calculatePressReleaseCost,
    calculateChatCost,
    calculateMadridSummaryCost,
    calculateMonthlyProjection,
    formatCurrency,
    type MonthlyUsage,
} from '../utils/costCalculator';

interface CostEstimatorProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CostEstimator: React.FC<CostEstimatorProps> = ({ isOpen, onClose }) => {
    const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage>({
        audioTranscriptions: 200,
        pressReleases: 100,
        chatMessages: 500,
        madridSummaries: 30,
    });

    const [avgAudioMinutes, setAvgAudioMinutes] = useState(5);
    const [avgDocumentSizeKB, setAvgDocumentSizeKB] = useState(50);

    if (!isOpen) return null;

    // Calculate individual operation costs
    const singleAudioCost = calculateAudioCost(avgAudioMinutes, 'paid');
    const singlePressCost = calculatePressReleaseCost(avgDocumentSizeKB, 'paid');
    const singleChatCost = calculateChatCost(100, 5, 'paid');
    const singleSummaryCost = calculateMadridSummaryCost('paid', true);

    // Calculate monthly projections
    const paidProjection = calculateMonthlyProjection(monthlyUsage, 'paid', avgAudioMinutes, avgDocumentSizeKB);
    const freeProjection = calculateMonthlyProjection(monthlyUsage, 'free', avgAudioMinutes, avgDocumentSizeKB);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
            <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-servimedia-border animate-in zoom-in-95 duration-300 my-8">
                <div className="p-8 border-b border-servimedia-light flex items-center justify-between bg-gradient-to-r from-green-50 to-blue-50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center text-white">
                            <DollarSign className="w-5 h-5" />
                        </div>
                        <h2 className="font-black text-servimedia-gray text-xl tracking-tighter uppercase">Estimador de Costes API</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-servimedia-gray/20 hover:text-servimedia-pink transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-10 space-y-10">
                    {/* Quick Reference */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-6 bg-servimedia-pink/5 rounded-2xl border border-servimedia-pink/10">
                            <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-servimedia-pink" />
                                <h3 className="text-[10px] font-black text-servimedia-pink uppercase tracking-widest">Audio ({avgAudioMinutes} min)</h3>
                            </div>
                            <p className="text-2xl font-black text-servimedia-gray">{formatCurrency(singleAudioCost.totalCost)}</p>
                            <p className="text-[9px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">por transcripción</p>
                        </div>

                        <div className="p-6 bg-servimedia-orange/5 rounded-2xl border border-servimedia-orange/10">
                            <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-servimedia-orange" />
                                <h3 className="text-[10px] font-black text-servimedia-orange uppercase tracking-widest">Nota Prensa</h3>
                            </div>
                            <p className="text-2xl font-black text-servimedia-gray">{formatCurrency(singlePressCost.totalCost)}</p>
                            <p className="text-[9px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">por documento</p>
                        </div>

                        <div className="p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                            <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-blue-500" />
                                <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Chat</h3>
                            </div>
                            <p className="text-2xl font-black text-servimedia-gray">{formatCurrency(singleChatCost.totalCost)}</p>
                            <p className="text-[9px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">por mensaje</p>
                        </div>

                        <div className="p-6 bg-blue-800/5 rounded-2xl border border-blue-800/10">
                            <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-blue-800" />
                                <h3 className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Madrid</h3>
                            </div>
                            <p className="text-2xl font-black text-servimedia-gray">{formatCurrency(singleSummaryCost.totalCost)}</p>
                            <p className="text-[9px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">por resumen</p>
                        </div>
                    </div>

                    {/* Monthly Usage Calculator */}
                    <div className="bg-servimedia-light/30 rounded-3xl p-8 border border-servimedia-border">
                        <div className="flex items-center gap-3 mb-6">
                            <Calculator className="w-6 h-6 text-servimedia-gray" />
                            <h3 className="text-sm font-black text-servimedia-gray uppercase tracking-wider">Calculadora Mensual</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Transcripciones Audio/Mes
                                </label>
                                <input
                                    type="number"
                                    value={monthlyUsage.audioTranscriptions}
                                    onChange={(e) => setMonthlyUsage({ ...monthlyUsage, audioTranscriptions: parseInt(e.target.value) || 0 })}
                                    className="w-full p-4 bg-white border-none rounded-2xl focus:ring-4 focus:ring-servimedia-pink/10 outline-none font-sans transition-all text-lg"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Notas de Prensa/Mes
                                </label>
                                <input
                                    type="number"
                                    value={monthlyUsage.pressReleases}
                                    onChange={(e) => setMonthlyUsage({ ...monthlyUsage, pressReleases: parseInt(e.target.value) || 0 })}
                                    className="w-full p-4 bg-white border-none rounded-2xl focus:ring-4 focus:ring-servimedia-orange/10 outline-none font-sans transition-all text-lg"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Mensajes Chat/Mes
                                </label>
                                <input
                                    type="number"
                                    value={monthlyUsage.chatMessages}
                                    onChange={(e) => setMonthlyUsage({ ...monthlyUsage, chatMessages: parseInt(e.target.value) || 0 })}
                                    className="w-full p-4 bg-white border-none rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none font-sans transition-all text-lg"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Resúmenes Madrid/Mes
                                </label>
                                <input
                                    type="number"
                                    value={monthlyUsage.madridSummaries}
                                    onChange={(e) => setMonthlyUsage({ ...monthlyUsage, madridSummaries: parseInt(e.target.value) || 0 })}
                                    className="w-full p-4 bg-white border-none rounded-2xl focus:ring-4 focus:ring-blue-800/10 outline-none font-sans transition-all text-lg"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Duración Media Audio (minutos)
                                </label>
                                <input
                                    type="number"
                                    value={avgAudioMinutes}
                                    onChange={(e) => setAvgAudioMinutes(parseInt(e.target.value) || 5)}
                                    className="w-full p-4 bg-white border-none rounded-2xl focus:ring-4 focus:ring-servimedia-gray/10 outline-none font-sans transition-all text-lg"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-servimedia-gray/40 uppercase tracking-[0.3em] block mb-2 ml-2">
                                    Tamaño Medio Documento (KB)
                                </label>
                                <input
                                    type="number"
                                    value={avgDocumentSizeKB}
                                    onChange={(e) => setAvgDocumentSizeKB(parseInt(e.target.value) || 50)}
                                    className="w-full p-4 bg-white border-none rounded-2xl focus:ring-4 focus:ring-servimedia-gray/10 outline-none font-sans transition-all text-lg"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Monthly Projection Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl p-8 border-2 border-gray-200">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 bg-gray-400 rounded-xl flex items-center justify-center text-white">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-black text-gray-600 uppercase tracking-wider">Free Tier</h3>
                            </div>
                            <p className="text-4xl font-black text-gray-700 mb-2">{formatCurrency(freeProjection.totalCost)}</p>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-6">Coste Mensual Estimado</p>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Input:</span>
                                    <span className="font-bold text-gray-700">{formatCurrency(freeProjection.inputCost)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Output:</span>
                                    <span className="font-bold text-gray-700">{formatCurrency(freeProjection.outputCost)}</span>
                                </div>
                            </div>
                            <div className="mt-6 p-4 bg-yellow-50 rounded-2xl border border-yellow-200">
                                <p className="text-[9px] text-yellow-700 font-bold uppercase tracking-wider flex items-center gap-2">
                                    <Info className="w-3 h-3" />
                                    Límites restrictivos
                                </p>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-3xl p-8 border-2 border-green-300 shadow-lg shadow-green-200/50">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center text-white">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-black text-green-700 uppercase tracking-wider">Paid Tier</h3>
                            </div>
                            <p className="text-4xl font-black text-green-800 mb-2">{formatCurrency(paidProjection.totalCost)}</p>
                            <p className="text-xs text-green-600 font-bold uppercase tracking-wider mb-6">Coste Mensual Estimado</p>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-green-600">Input:</span>
                                    <span className="font-bold text-green-800">{formatCurrency(paidProjection.inputCost)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-green-600">Output:</span>
                                    <span className="font-bold text-green-800">{formatCurrency(paidProjection.outputCost)}</span>
                                </div>
                                {paidProjection.searchCost && (
                                    <div className="flex justify-between">
                                        <span className="text-green-600">Search:</span>
                                        <span className="font-bold text-green-800">{formatCurrency(paidProjection.searchCost)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-6 p-4 bg-green-100 rounded-2xl border border-green-300">
                                <p className="text-[9px] text-green-700 font-bold uppercase tracking-wider flex items-center gap-2">
                                    <Info className="w-3 h-3" />
                                    Límites altos + No mejora productos
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Important Notes */}
                    <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100">
                        <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                            <div className="space-y-2">
                                <p className="text-xs text-blue-700 font-bold">Notas Importantes:</p>
                                <ul className="text-xs text-blue-600/80 space-y-1 list-disc list-inside">
                                    <li>Estas son <strong>estimaciones aproximadas</strong> basadas en uso típico</li>
                                    <li>Los costes reales pueden variar según la longitud y complejidad del contenido</li>
                                    <li>Gemini 3 Pro Preview: $2/1M tokens input, $12/1M tokens output</li>
                                    <li>Gemini 3 Flash Preview: $0.50/1M tokens input, $3/1M tokens output</li>
                                    <li>Google Search: $14/1,000 búsquedas (después de 5,000 gratis/mes)</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-10 py-6 bg-servimedia-light/50 text-center border-t border-servimedia-light">
                    <p className="text-[9px] font-black text-servimedia-gray/20 uppercase tracking-[0.4em]">Servimedia IA • Estimaciones basadas en precios oficiales Gemini API</p>
                </div>
            </div>
        </div>
    );
};
