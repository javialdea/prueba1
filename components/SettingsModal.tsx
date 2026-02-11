
import React from 'react';

interface SettingsModalProps {
    apiKey: string;
    setApiKey: (key: string) => void;
    onSave: () => void;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
    apiKey,
    setApiKey,
    onSave,
    onClose
}) => {
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
                <h2 className="text-2xl font-black text-servimedia-gray uppercase tracking-tighter">Configuración</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-servimedia-gray/40 mb-2">Gemini API Key</label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Pegar tu API Key aquí"
                            className="w-full p-4 bg-servimedia-light border-none rounded-xl focus:ring-2 focus:ring-servimedia-pink/20 outline-none font-mono text-sm"
                        />
                        <p className="text-[10px] text-servimedia-gray/40 mt-2">
                            La API Key se guarda localmente en tu navegador.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest text-servimedia-gray/40 hover:bg-servimedia-light transition-colors">Cancelar</button>
                    <button onClick={onSave} className="px-6 py-3 bg-servimedia-pink text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:shadow-lg hover:shadow-servimedia-pink/20 transition-all">Guardar</button>
                </div>
            </div>
        </div>
    );
};
