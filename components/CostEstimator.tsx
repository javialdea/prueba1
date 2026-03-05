
import React, { useState } from 'react';
import { X, Euro, TrendingUp, Calculator, Info, Zap, Mic, FileText, MessageSquare, Newspaper, MapPin } from 'lucide-react';
import {
    calculateAudioCost,
    calculatePressReleaseCost,
    calculateTeletipoCost,
    calculateChatCost,
    calculateMadridSummaryCost,
    calculateMonthlyProjection,
    formatCurrency,
    GEMINI_2_5_PRO_PRICING,
    GEMINI_2_5_FLASH_PRICING,
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
        teletipos: 50,
    });

    const [avgAudioMinutes, setAvgAudioMinutes] = useState(5);
    const [avgDocumentSizeKB, setAvgDocumentSizeKB] = useState(50);

    if (!isOpen) return null;

    // Calculate individual operation costs (paid tier)
    const singleAudioCost = calculateAudioCost(avgAudioMinutes, 'paid');
    const singlePressCost = calculatePressReleaseCost(avgDocumentSizeKB, 'paid');
    const singleTeletipoCost = calculateTeletipoCost(avgAudioMinutes, 'paid');
    const singleChatCost = calculateChatCost(100, 5, 'paid');
    const singleSummaryCost = calculateMadridSummaryCost('paid', true);

    // Calculate monthly projection (paid tier only — app runs on GCP billing account)
    const projection = calculateMonthlyProjection(monthlyUsage, 'paid', avgAudioMinutes, avgDocumentSizeKB);

    return (
        <div className="fixed inset-0 z-[300] overflow-y-auto bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
        <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-servimedia-border animate-in zoom-in-95 duration-300 my-8">
                <div className="p-8 border-b border-servimedia-light flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center text-white">
                            <Euro className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="font-black text-servimedia-gray text-xl tracking-tighter uppercase">Estimador de Costes API</h2>
                            <p className="text-[9px] font-bold text-green-700/60 uppercase tracking-widest mt-0.5">Precios reales de facturación GCP · Marzo 2026</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-servimedia-gray/20 hover:text-servimedia-pink transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-10 space-y-10">

                    {/* Quick Reference Cards */}
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.35em] text-servimedia-gray/30 mb-4">Coste por operación (cuenta de facturación)</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            <div className="p-5 bg-servimedia-pink/5 rounded-2xl border border-servimedia-pink/10">
                                <div className="flex items-center gap-2 mb-3">
                                    <Mic className="w-4 h-4 text-servimedia-pink" />
                                    <h3 className="text-[9px] font-black text-servimedia-pink uppercase tracking-widest">Audio</h3>
                                </div>
                                <p className="text-xl font-black text-servimedia-gray">{formatCurrency(singleAudioCost.totalCost)}</p>
                                <p className="text-[8px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">{avgAudioMinutes} min · 2.5 Pro</p>
                            </div>

                            <div className="p-5 bg-servimedia-orange/5 rounded-2xl border border-servimedia-orange/10">
                                <div className="flex items-center gap-2 mb-3">
                                    <FileText className="w-4 h-4 text-servimedia-orange" />
                                    <h3 className="text-[9px] font-black text-servimedia-orange uppercase tracking-widest">Nota Prensa</h3>
                                </div>
                                <p className="text-xl font-black text-servimedia-gray">{formatCurrency(singlePressCost.totalCost)}</p>
                                <p className="text-[8px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">{avgDocumentSizeKB} KB · 2.5 Pro</p>
                            </div>

                            <div className="p-5 bg-purple-500/5 rounded-2xl border border-purple-500/10">
                                <div className="flex items-center gap-2 mb-3">
                                    <Newspaper className="w-4 h-4 text-purple-500" />
                                    <h3 className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Teletipo</h3>
                                </div>
                                <p className="text-xl font-black text-servimedia-gray">{formatCurrency(singleTeletipoCost.totalCost)}</p>
                                <p className="text-[8px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">{avgAudioMinutes} min · Flash+Pro</p>
                            </div>

                            <div className="p-5 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                                <div className="flex items-center gap-2 mb-3">
                                    <MessageSquare className="w-4 h-4 text-blue-500" />
                                    <h3 className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Chat</h3>
                                </div>
                                <p className="text-xl font-black text-servimedia-gray">{formatCurrency(singleChatCost.totalCost)}</p>
                                <p className="text-[8px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">por mensaje · 2.5 Flash</p>
                            </div>

                            <div className="p-5 bg-blue-800/5 rounded-2xl border border-blue-800/10">
                                <div className="flex items-center gap-2 mb-3">
                                    <MapPin className="w-4 h-4 text-blue-800" />
                                    <h3 className="text-[9px] font-black text-blue-800 uppercase tracking-widest">Madrid</h3>
                                </div>
                                <p className="text-xl font-black text-servimedia-gray">{formatCurrency(singleSummaryCost.totalCost)}</p>
                                <p className="text-[8px] text-servimedia-gray/40 mt-1 font-bold uppercase tracking-wider">por resumen · Pro+Search</p>
                            </div>
                        </div>
                    </div>

                    {/* Monthly Usage Calculator */}
                    <div className="bg-servimedia-light/30 rounded-3xl p-8 border border-servimedia-border">
                        <div className="flex items-center gap-3 mb-6">
                            <Calculator className="w-6 h-6 text-servimedia-gray" />
                            <h3 className="text-sm font-black text-servimedia-gray uppercase tracking-wider">Calculadora Mensual</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
                                    Teletipos Generados/Mes
                                </label>
                                <input
                                    type="number"
                                    value={monthlyUsage.teletipos || 0}
                                    onChange={(e) => setMonthlyUsage({ ...monthlyUsage, teletipos: parseInt(e.target.value) || 0 })}
                                    className="w-full p-4 bg-white border-none rounded-2xl focus:ring-4 focus:ring-purple-500/10 outline-none font-sans transition-all text-lg"
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
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                    {/* Monthly Projection */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-3xl p-8 border-2 border-green-300 shadow-lg shadow-green-200/50">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center text-white">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-green-700 uppercase tracking-wider">Proyección Mensual Estimada</h3>
                                <p className="text-[9px] text-green-600/60 font-bold uppercase tracking-wider mt-0.5">Precios de cuenta GCP · Tarifa de lista en EUR</p>
                            </div>
                        </div>
                        <p className="text-5xl font-black text-green-800 mb-2">{formatCurrency(projection.totalCost)}</p>
                        <p className="text-xs text-green-600 font-bold uppercase tracking-wider mb-6">Coste Mensual Estimado</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                            <div className="bg-white/60 rounded-2xl p-4">
                                <span className="text-green-600 text-[9px] font-black uppercase tracking-wider block mb-1">Tokens Input</span>
                                <span className="font-black text-green-800 text-lg">{formatCurrency(projection.inputCost)}</span>
                            </div>
                            <div className="bg-white/60 rounded-2xl p-4">
                                <span className="text-green-600 text-[9px] font-black uppercase tracking-wider block mb-1">Tokens Output</span>
                                <span className="font-black text-green-800 text-lg">{formatCurrency(projection.outputCost)}</span>
                            </div>
                            {projection.searchCost !== undefined && projection.searchCost > 0 && (
                                <div className="bg-white/60 rounded-2xl p-4">
                                    <span className="text-green-600 text-[9px] font-black uppercase tracking-wider block mb-1">Google Search</span>
                                    <span className="font-black text-green-800 text-lg">{formatCurrency(projection.searchCost)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pricing Reference Table */}
                    <div className="rounded-3xl overflow-hidden border border-servimedia-border shadow-sm">
                        <div className="px-6 py-4 border-b border-servimedia-border bg-servimedia-light/30">
                            <p className="text-[10px] font-black uppercase tracking-widest text-servimedia-gray/40">Tarifas de lista (EUR) — cuenta de facturación GCP</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-servimedia-light/30">
                                    <tr>
                                        <th className="px-5 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Modelo</th>
                                        <th className="px-5 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Uso en app</th>
                                        <th className="px-5 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Input texto (1M tok)</th>
                                        <th className="px-5 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Input audio (1M tok)</th>
                                        <th className="px-5 py-3 font-black uppercase tracking-widest text-[9px] text-servimedia-gray/40">Output (1M tok)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-servimedia-border">
                                    <tr className="hover:bg-servimedia-light/20 transition-colors">
                                        <td className="px-5 py-4 font-black text-servimedia-gray">Gemini 2.5 Pro</td>
                                        <td className="px-5 py-4 text-servimedia-gray/50 text-[10px]">Audio · Nota Prensa · Teletipo · Fact-check</td>
                                        <td className="px-5 py-4 font-bold text-servimedia-gray">{formatCurrency(GEMINI_2_5_PRO_PRICING.paid.inputPrice)}</td>
                                        <td className="px-5 py-4 font-bold text-servimedia-gray">{formatCurrency(GEMINI_2_5_PRO_PRICING.paid.audioInputPrice || 0)}</td>
                                        <td className="px-5 py-4 font-bold text-servimedia-gray">{formatCurrency(GEMINI_2_5_PRO_PRICING.paid.outputPrice)}</td>
                                    </tr>
                                    <tr className="hover:bg-servimedia-light/20 transition-colors">
                                        <td className="px-5 py-4 font-black text-servimedia-gray">Gemini 2.5 Flash</td>
                                        <td className="px-5 py-4 text-servimedia-gray/50 text-[10px]">Chat · Titulares · Verificación rápida</td>
                                        <td className="px-5 py-4 font-bold text-servimedia-gray">{formatCurrency(GEMINI_2_5_FLASH_PRICING.paid.inputPrice)}</td>
                                        <td className="px-5 py-4 font-bold text-servimedia-gray">{formatCurrency(GEMINI_2_5_FLASH_PRICING.paid.audioInputPrice || 0)}</td>
                                        <td className="px-5 py-4 font-bold text-servimedia-gray">{formatCurrency(GEMINI_2_5_FLASH_PRICING.paid.outputPrice)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Important Notes */}
                    <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100">
                        <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                            <div className="space-y-2">
                                <p className="text-xs text-blue-700 font-bold">Notas sobre los precios:</p>
                                <ul className="text-xs text-blue-600/80 space-y-1.5 list-disc list-inside">
                                    <li>Precios extraídos directamente de la <strong>cuenta de facturación GCP</strong> (CSV de tarifas, marzo 2026)</li>
                                    <li><strong>Gemini 2.5 Pro:</strong> €{GEMINI_2_5_PRO_PRICING.paid.inputPrice}/1M tokens input · €{GEMINI_2_5_PRO_PRICING.paid.outputPrice}/1M tokens output</li>
                                    <li><strong>Gemini 2.5 Flash:</strong> €{GEMINI_2_5_FLASH_PRICING.paid.inputPrice}/1M texto · €{GEMINI_2_5_FLASH_PRICING.paid.audioInputPrice}/1M audio · €{GEMINI_2_5_FLASH_PRICING.paid.outputPrice}/1M output</li>
                                    <li><strong>Google Search:</strong> primeras 10.000 búsquedas/mes gratuitas · después €{GEMINI_2_5_PRO_PRICING.paid.searchPrice}/1.000 búsquedas</li>
                                    <li><strong>Cloud Run, Cloud Storage y Cloud Logging</strong> tienen cuotas gratuitas generosas — coste mensual prácticamente cero</li>
                                    <li>Estas son <strong>estimaciones</strong> basadas en uso típico; los costes reales varían según longitud y complejidad del contenido</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-10 py-6 bg-servimedia-light/50 text-center border-t border-servimedia-light">
                    <p className="text-[9px] font-black text-servimedia-gray/20 uppercase tracking-[0.4em]">Servimedia IA · Estimaciones basadas en precios reales de facturación GCP</p>
                </div>
            </div>
        </div>
        </div>
    );
};
