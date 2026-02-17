import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileAudio, FileText, AlertCircle, X, Film, Loader2 } from 'lucide-react';
import { FileState, AppMode } from '../types';
import { extractAudioFromVideo } from '../utils/audioUtils';

interface FileUploaderProps {
  onFileSelected: (fileState: FileState) => void;
  onClear: () => void;
  isLoading: boolean;
  mode: AppMode;
  onError?: (error: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelected, onClear, isLoading, mode, onError }) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    console.log(`[FileUploader] Processing ${fileArray.length} file(s) in mode: ${mode}`);

    // Clear any previous errors
    setError(null);

    // For modes that are NOT queue-based, we'd take only the first.
    // But now both AUDIO and PRESS_RELEASE support queues.
    // Keeping this block only for modes that might be added later and are single-file.
    if (mode !== AppMode.AUDIO && mode !== AppMode.PRESS_RELEASE) {
      const file = fileArray[0];
      if (!file) return;
      console.log(`[FileUploader] Single-file mode: ${file.name}`);
      setFileName(file.name);
      try {
        const reader = new FileReader();
        reader.onload = () => onFileSelected({ file: file, base64: (reader.result as string).split(',')[1], mimeType: file.type });
        reader.onerror = () => {
          const errorMsg = 'Error al leer el archivo';
          setError(errorMsg);
          if (onError) onError(errorMsg);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        const errorMsg = `Error procesando archivo: ${err instanceof Error ? err.message : 'Error desconocido'}`;
        console.error('[FileUploader]', errorMsg);
        setError(errorMsg);
        if (onError) onError(errorMsg);
      }
      // Reset input after processing
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // For multi-file modes (AUDIO, PRESS_RELEASE), we process all and pass them to parent
    for (const file of fileArray) {
      console.log(`[FileUploader] Processing: ${file.name} (${file.type})`);
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov');
      if (isVideo) {
        setIsExtracting(true);
        try {
          const { base64 } = await extractAudioFromVideo(file);
          onFileSelected({ file: file, base64: base64, mimeType: 'audio/wav' });
        } catch (err) {
          console.error('[FileUploader] Video extraction failed, trying direct upload:', err);
          const errorMsg = err instanceof Error ? err.message : 'Error al extraer audio del video';
          setError(errorMsg);
          if (onError) onError(errorMsg);
          // Fallback: try to upload as-is
          try {
            const reader = new FileReader();
            reader.onload = () => onFileSelected({ file: file, base64: (reader.result as string).split(',')[1], mimeType: file.type });
            reader.readAsDataURL(file);
          } catch (fallbackErr) {
            console.error('[FileUploader] Fallback also failed:', fallbackErr);
          }
        } finally { setIsExtracting(false); }
      } else {
        try {
          const reader = new FileReader();
          reader.onload = () => onFileSelected({ file: file, base64: (reader.result as string).split(',')[1], mimeType: file.type });
          reader.onerror = () => {
            const errorMsg = `Error al leer ${file.name}`;
            setError(errorMsg);
            if (onError) onError(errorMsg);
          };
          reader.readAsDataURL(file);
        } catch (err) {
          const errorMsg = `Error procesando ${file.name}: ${err instanceof Error ? err.message : 'Error desconocido'}`;
          console.error('[FileUploader]', errorMsg);
          setError(errorMsg);
          if (onError) onError(errorMsg);
        }
      }
    }

    // Reset input after processing all files
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // CRITICAL: Reset fileName so uploader doesn't stay in "success" view
    setFileName(null);
  }, [onFileSelected, mode, onError]);

  const handleInternalClear = () => {
    console.log('[FileUploader] Clearing file state');
    setFileName(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClear();
  };

  if (fileName) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 bg-white border border-servimedia-border rounded-2xl shadow-sm flex items-center justify-between animate-in zoom-in-95">
        <div className="flex items-center gap-5">
          <div className={`p-4 rounded-xl ${mode === AppMode.AUDIO ? 'bg-servimedia-pink/10 text-servimedia-pink' : 'bg-servimedia-orange/10 text-servimedia-orange'}`}>
            {isExtracting ? <Loader2 className="w-6 h-6 animate-spin" /> : (mode === AppMode.AUDIO ? <FileAudio className="w-6 h-6" /> : <FileText className="w-6 h-6" />)}
          </div>
          <div>
            <p className="font-black text-servimedia-gray text-lg tracking-tighter leading-none mb-1">{fileName}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-servimedia-gray/30">Carga verificada</p>
          </div>
        </div>
        <button onClick={handleInternalClear} className="p-2 hover:bg-servimedia-light rounded-full text-servimedia-gray/20 hover:text-servimedia-pink transition-all">
          <X className="w-6 h-6" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto group/uploader">
      <label
        className={`flex flex-col items-center justify-center w-full h-80 border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-500 overflow-hidden relative
          ${dragActive ? 'border-servimedia-pink bg-servimedia-pink/5 scale-[1.02]' : 'border-servimedia-border bg-white hover:border-servimedia-pink/30 hover:bg-servimedia-pink/[0.01] hover:shadow-2xl hover:shadow-servimedia-pink/5'}
          ${isLoading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
      >
        <div className={`absolute top-0 left-0 w-full h-1.5 transition-all duration-700 ${dragActive ? 'bg-servimedia-pink translate-y-0' : 'bg-transparent -translate-y-full'}`}></div>
        <div className="flex flex-col items-center justify-center text-center px-10 transition-transform duration-500 group-hover/uploader:-translate-y-1">
          <div className="relative mb-6">
            <Upload className={`w-16 h-16 transition-all duration-500 ${dragActive ? 'text-servimedia-pink scale-110' : 'text-servimedia-gray/10 group-hover/uploader:text-servimedia-pink/20 group-hover/uploader:scale-110'}`} />
            <div className={`absolute inset-0 bg-servimedia-pink blur-2xl opacity-0 transition-opacity duration-500 ${dragActive ? 'opacity-20' : 'group-hover/uploader:opacity-10'}`}></div>
          </div>
          <h3 className="text-3xl font-black text-servimedia-gray tracking-tighter uppercase mb-2 group-hover/uploader:text-servimedia-pink transition-colors duration-500">Arrastra tu material</h3>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-servimedia-gray/40">Audio, Video, PDF o Word • Máx 100MB</p>
        </div>
        <input
          key={`file-input-${mode}`}
          name={`file-input-${mode}`}
          ref={fileInputRef}
          type="file"
          multiple={mode === AppMode.AUDIO || mode === AppMode.PRESS_RELEASE}
          className="hidden"
          onChange={(e) => e.target.files && processFiles(e.target.files)}
          disabled={isLoading}
        />
      </label>
    </div>
  );
};