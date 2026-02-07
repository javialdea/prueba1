
import React from 'react';
import { HistoryItem, AppMode, AnalysisResult, PressReleaseResult } from '../types';
import { X, Mic2, Newspaper, Trash2, Clock, Calendar } from 'lucide-react';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ 
  isOpen, 
  onClose, 
  history, 
  onSelect, 
  onDelete 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-bold text-gray-900 font-serif">Historial</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No hay transcripciones guardadas.</p>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                className="group relative bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onSelect(item)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className={`p-2 rounded-md ${item.mode === AppMode.AUDIO ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                    {item.mode === AppMode.AUDIO ? <Mic2 className="w-4 h-4" /> : <Newspaper className="w-4 h-4" />}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item.id);
                    }}
                    className="text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <h3 className="font-medium text-gray-900 mb-1 truncate">{item.fileName}</h3>
                
                {item.mode === AppMode.AUDIO ? (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2 font-serif">
                    {(item.data as AnalysisResult).topics?.[0]?.name || "Sin temas detectados"}...
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2 font-serif">
                     {(item.data as PressReleaseResult).headline}
                  </p>
                )}
                
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                  <span className="text-xs text-gray-400">
                    {new Date(item.date).toLocaleDateString()} • {new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <span className="text-xs font-medium text-blue-600 group-hover:underline">Ver resultado &rarr;</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
