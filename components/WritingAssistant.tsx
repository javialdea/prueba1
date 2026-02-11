
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, SpellCheck, AlignLeft, RefreshCw, Loader2, MessageSquare, Bot, User, Trash2, FileText, Plus, X } from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { supabase } from '../services/supabase';
import { Session } from '@supabase/supabase-js';

interface WritingAssistantProps {
  session: Session | null;
}

export const WritingAssistant: React.FC<WritingAssistantProps> = ({ session }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<{ name: string, base64: string, mimeType: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load session from cloud
  useEffect(() => {
    const loadSession = async () => {
      if (!session?.user) return;
      const { data, error } = await supabase
        .from('writing_sessions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        setMessages(data.messages);
        setSources(data.sources);
      }
    };
    loadSession();
  }, [session]);

  // Save session to cloud
  useEffect(() => {
    const saveSession = async () => {
      if (!session?.user || messages.length === 0) return;
      await supabase
        .from('writing_sessions')
        .upsert({
          user_id: session.user.id,
          messages,
          sources,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' }); // Simplified: one session per user for now
    };
    const timer = setTimeout(saveSession, 2000);
    return () => clearTimeout(timer);
  }, [messages, sources, session]);

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    const newMessages = [...messages, { role: 'user' as const, text: textToSend }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = sources.length > 0
        ? await geminiService.chatWithDocuments(messages, textToSend, sources)
        : await geminiService.genericChat(messages, textToSend);

      setMessages([...newMessages, { role: 'model' as const, text: response || 'No he podido procesar la solicitud.' }]);
    } catch (error) {
      setMessages([...newMessages, { role: 'model' as const, text: 'Hubo un error de conexión con la IA.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(async (file: File) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = (event.target?.result as string).split(',')[1];

        let cloudUrl = '';
        if (session?.user) {
          const filePath = `${session.user.id}/${crypto.randomUUID()}-${file.name}`;
          const { error } = await supabase.storage
            .from('documents')
            .upload(filePath, file);

          if (!error) {
            const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
            cloudUrl = data.publicUrl;
          }
        }

        setSources((prev: typeof sources) => [...prev.filter(s => s.name !== file.name), {
          name: file.name,
          base64,
          mimeType: file.type,
          cloudUrl // Add this field to the source if needed, though we primarily use base64 for Gemini for now
        }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSource = (name: string) => {
    setSources(prev => prev.filter(s => s.name !== name));
  };

  const quickAction = (action: string) => {
    if (input.trim()) {
      handleSend(`${action}: "${input}"`);
    } else {
      setInput(`${action}: `);
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full flex h-[80vh] bg-white rounded-[3rem] border border-servimedia-border shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8">
      {/* Sources Sidebar */}
      <div className="w-80 border-r border-servimedia-light flex flex-col bg-servimedia-light/20 relative">
        <div className="p-8 border-b border-servimedia-light flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-servimedia-gray/40">Fuentes ({sources.length})</h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-servimedia-orange/10 text-servimedia-orange rounded-full hover:bg-servimedia-orange hover:text-white transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx"
          />
        </div>
        <div className="flex-grow p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {sources.length === 0 ? (
            <div className="text-center py-20 px-6">
              <FileText className="w-10 h-10 text-servimedia-gray/10 mx-auto mb-4" />
              <p className="text-[10px] font-bold text-servimedia-gray/20 uppercase tracking-widest leading-relaxed">
                Sube documentos para investigar al estilo Notebook LM
              </p>
            </div>
          ) : (
            sources.map((s, i) => (
              <div key={i} className="bg-white p-4 rounded-2xl border border-servimedia-border flex items-center justify-between group animate-in slide-in-from-left-4">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-servimedia-orange/5 rounded-lg text-servimedia-orange shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-black text-servimedia-gray truncate">{s.name}</span>
                </div>
                <button
                  onClick={() => removeSource(s.name)}
                  className="text-servimedia-gray/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="p-6 bg-servimedia-orange/5 rounded-3xl m-6">
          <p className="text-[9px] font-bold text-servimedia-orange/60 uppercase tracking-widest leading-relaxed italic text-center">
            La IA responderá basándose íntegramente en tus fuentes.
          </p>
        </div>
      </div>

      <div className="flex-grow flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="px-10 py-6 border-b border-servimedia-light flex items-center justify-between bg-white sticky top-0 z-10 w-full">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-servimedia-orange rounded-2xl flex items-center justify-center text-white shadow-lg shadow-servimedia-orange/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-servimedia-gray text-lg tracking-tighter uppercase leading-none">Asistente de Redacción</h3>
              <p className="text-[10px] font-bold text-servimedia-gray/30 uppercase tracking-[0.2em] mt-1">
                {sources.length > 0 ? `Modo Análisis: ${sources.length} documentos` : 'Editor Inteligente Servimedia'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setMessages([]);
              setSources([]);
            }}
            className="p-3 hover:bg-red-50 text-servimedia-gray/20 hover:text-red-500 rounded-full transition-all"
            title="Limpiar Conversación y Fuentes"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-grow overflow-y-auto p-10 space-y-8 custom-scrollbar bg-servimedia-light/30">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl mb-4">
                <MessageSquare className="w-10 h-10 text-servimedia-orange/20" />
              </div>
              <h4 className="text-3xl font-black text-servimedia-gray/20 tracking-tighter uppercase">¿En qué puedo ayudarte hoy?</h4>
              <p className="text-servimedia-gray/30 font-serif italic max-w-sm">Pega un texto para corregirlo, pide un resumen o consulta cualquier dato para tu noticia.</p>

              <div className="grid grid-cols-2 gap-4 w-full max-w-md mt-10">
                <button onClick={() => quickAction('Corrige las faltas de ortografía de este texto')} className="p-4 bg-white border border-servimedia-border rounded-2xl hover:border-servimedia-orange hover:shadow-lg transition-all text-xs font-black uppercase tracking-widest text-servimedia-gray/60 flex items-center gap-3">
                  <SpellCheck className="w-4 h-4 text-servimedia-orange" /> Ortografía
                </button>
                <button onClick={() => quickAction('Mejora el estilo y la fluidez de este texto')} className="p-4 bg-white border border-servimedia-border rounded-2xl hover:border-servimedia-orange hover:shadow-lg transition-all text-xs font-black uppercase tracking-widest text-servimedia-gray/60 flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-servimedia-orange" /> Estilo
                </button>
                <button onClick={() => quickAction('Haz un resumen ejecutivo de este texto')} className="p-4 bg-white border border-servimedia-border rounded-2xl hover:border-servimedia-orange hover:shadow-lg transition-all text-xs font-black uppercase tracking-widest text-servimedia-gray/60 flex items-center gap-3">
                  <AlignLeft className="w-4 h-4 text-servimedia-orange" /> Resumir
                </button>
                <button onClick={() => quickAction('Traduce este texto a tono de teletipo de agencia')} className="p-4 bg-white border border-servimedia-border rounded-2xl hover:border-servimedia-orange hover:shadow-lg transition-all text-xs font-black uppercase tracking-widest text-servimedia-gray/60 flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 text-servimedia-orange" /> Tono Agencia
                </button>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4`}>
              <div className={`max-w-[85%] flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${m.role === 'user' ? 'bg-servimedia-pink text-white' : 'bg-servimedia-orange text-white'}`}>
                  {m.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                <div className={`p-8 rounded-[2.5rem] shadow-sm text-xl leading-relaxed ${m.role === 'user' ? 'bg-servimedia-pink text-white rounded-tr-none font-sans' : 'bg-white text-servimedia-gray border border-servimedia-border rounded-tl-none font-sans'}`}>
                  {m.text.split('\n').map((line, idx) => (
                    <p key={idx} className={idx > 0 ? 'mt-4' : ''}
                      dangerouslySetInnerHTML={{
                        __html: line
                          .replace(/<b>(.*?)<\/b>/g, '<strong>$1</strong>')
                          .replace(/<u>(.*?)<\/u>/g, '<u class="decoration-servimedia-orange decoration-2">$1</u>')
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-servimedia-orange text-white flex items-center justify-center animate-pulse">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="bg-white p-6 rounded-3xl border border-servimedia-border flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-servimedia-orange" />
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-servimedia-gray/30">Redactando...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 bg-white border-t border-servimedia-light">
          <div className="flex gap-4 p-2 bg-servimedia-light rounded-[2.5rem] items-end ring-1 ring-servimedia-border focus-within:ring-servimedia-orange/30 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={sources.length > 0 ? `Pregunta sobre ${sources.length} documentos...` : "Haz una pregunta o pega tu texto aquí..."}
              className="flex-grow p-6 bg-transparent border-none outline-none font-sans text-lg placeholder:text-servimedia-gray/20 resize-none max-h-40"
              rows={1}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className={`p-6 rounded-full shadow-lg transition-all ${!input.trim() || isLoading ? 'bg-servimedia-gray/10 text-white cursor-not-allowed' : 'bg-servimedia-orange text-white hover:scale-105 active:scale-95 shadow-servimedia-orange/20'}`}
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
