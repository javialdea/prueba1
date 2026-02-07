
import React from 'react';
import { PressSummaryResult } from '../types';
import { Newspaper, ExternalLink, Calendar, RefreshCw } from 'lucide-react';

interface PressSummaryProps {
  result: PressSummaryResult;
  onRefresh: () => void;
  isLoading: boolean;
}

export const PressSummary: React.FC<PressSummaryProps> = ({ result, onRefresh, isLoading }) => {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] border border-servimedia-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
            <Newspaper className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tighter text-servimedia-gray uppercase leading-none">Resumen de Prensa: Madrid</h2>
            <div className="flex items-center gap-2 mt-2 text-servimedia-gray/40 font-bold text-[10px] uppercase tracking-widest">
              <Calendar className="w-3 h-3" /> {result.date}
            </div>
          </div>
        </div>
        <button 
          onClick={onRefresh}
          disabled={isLoading}
          className={`flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-600/20 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar Portadas
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {result.summaries.map((paper, idx) => (
          <div key={idx} className="bg-white rounded-[2.5rem] border border-servimedia-border shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:border-blue-500/20 transition-all duration-500">
            <div className="p-8 border-b border-servimedia-light flex items-center justify-between bg-servimedia-light/30">
              <h3 className="font-black text-servimedia-gray text-lg tracking-tighter uppercase">{paper.source}</h3>
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">Portada</span>
            </div>
            <div className="p-8 space-y-8 flex-grow">
              {paper.news.map((item, nIdx) => (
                <div key={nIdx} className="space-y-3 group/item">
                  <div className="flex items-start gap-3">
                    <span className="text-blue-600 font-black text-xs mt-1">{nIdx + 1}.</span>
                    <h4 className="font-serif font-black text-xl text-servimedia-gray leading-tight group-hover/item:text-blue-600 transition-colors">
                      {item.headline}
                    </h4>
                  </div>
                  <p className="text-sm text-servimedia-gray/50 leading-relaxed italic pl-6 border-l-2 border-servimedia-light group-hover/item:border-blue-200 transition-colors">
                    {item.summary}
                  </p>
                  {item.url && (
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-servimedia-gray/30 hover:text-blue-600 ml-6 transition-colors"
                    >
                      Leer original <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div className="px-8 py-6 bg-servimedia-light/50 text-center">
               <p className="text-[9px] font-black text-servimedia-gray/20 uppercase tracking-[0.3em]">Sección Madrid • Actualizado hace un momento</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
