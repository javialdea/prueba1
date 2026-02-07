
import React, { useState, useEffect } from 'react';
import { PressReleaseResult as PressReleaseResultType } from '../types';
import { Copy, Check, FileText, Edit3, Save, Target, Share2 } from 'lucide-react';

interface PressReleaseResultProps {
  result: PressReleaseResultType;
  pdfFile: File | null;
  onSaveEdits?: (finalResult: PressReleaseResultType) => void;
}

export const PressReleaseResult: React.FC<PressReleaseResultProps> = ({ result, pdfFile, onSaveEdits }) => {
  const [copied, setCopied] = useState(false);
  const [headline, setHeadline] = useState(result.finalHeadline || result.headline);
  const [lead, setLead] = useState(result.finalLead || result.lead);
  const [body, setBody] = useState(result.finalBody || result.body);

  useEffect(() => {
    setHeadline(result.finalHeadline || result.headline);
    setLead(result.finalLead || result.lead);
    setBody(result.finalBody || result.body);
  }, [result]);

  const handleCopy = () => {
    const text = `${headline}\n\n${lead}\n\n${body}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:h-[80vh]">
        
        {/* Origen (Naranja) - Ahora más ancho */}
        <div className="lg:col-span-5 flex flex-col gap-6 overflow-hidden">
          <div className="bg-servimedia-orange p-6 rounded-2xl text-white shadow-xl shadow-servimedia-orange/10 border-none">
            <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-[0.3em] mb-3">
              <Target className="w-4 h-4" /> Directriz Editorial
            </div>
            <p className="text-lg font-serif italic">{result.userAngle || 'Redacción Estándar'}</p>
          </div>

          <div className="flex-grow flex flex-col bg-white rounded-3xl border border-servimedia-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-servimedia-border flex items-center justify-between opacity-40">
              <span className="text-[10px] font-black uppercase tracking-widest">Fuente Original</span>
            </div>
            <div className="flex-grow overflow-y-auto p-10 font-serif text-lg text-servimedia-gray leading-relaxed custom-scrollbar">
              {result.originalText.split('\n\n').map((paragraphBlock, blockIndex) => (
                <p key={blockIndex} className={blockIndex > 0 ? 'mt-6' : ''}> {/* Changed from mt-4 to mt-6 */}
                  {paragraphBlock.split('\n').map((line, lineIndex) => (
                    <React.Fragment key={lineIndex}>
                      {line}
                      {lineIndex < paragraphBlock.split('\n').length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Editor (Blanco Puro) - Ahora más estrecho */}
        <div className="lg:col-span-7 flex flex-col bg-white rounded-3xl border border-servimedia-border shadow-2xl overflow-hidden">
          <div className="px-8 py-6 flex items-center justify-between border-b border-servimedia-light">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-servimedia-pink rounded-full"></div>
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-servimedia-gray/40">Editor AI Servimedia</span>
            </div>
            <button 
              onClick={handleCopy}
              className={`flex items-center gap-2 px-8 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                ${copied ? 'bg-green-600 text-white' : 'bg-servimedia-pink text-white hover:bg-servimedia-pink/90'}
              `}
            >
              {copied ? 'Copiado' : 'Exportar Teletipo'}
            </button>
          </div>

          <div className="flex-grow overflow-y-auto p-12 bg-white custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-12">
              <textarea
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                rows={2}
                className="w-full text-3xl font-black text-servimedia-gray bg-white border-none focus:ring-0 p-0 resize-none tracking-tighter uppercase italic leading-none placeholder:text-servimedia-gray/10"
                placeholder="TITULAR..."
              />
              
              <textarea
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                rows={4}
                className="w-full text-2xl font-serif font-black text-servimedia-gray/70 bg-white border-none focus:ring-0 p-0 resize-none italic leading-snug"
                placeholder="ENTRADILLA..."
              />

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full min-h-[600px] text-xl font-serif text-servimedia-gray/90 bg-white border-none focus:ring-0 p-0 resize-none leading-relaxed"
                placeholder="CUERPO DE LA NOTICIA..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
