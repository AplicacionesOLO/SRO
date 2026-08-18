import { useState, useRef, useCallback, useEffect } from 'react';
import type { MessagingMessage } from '@/types/messaging';
import EmojiPicker from './EmojiPicker';
import { compressImageFile, isImage, voiceNoteBitrate } from '@/utils/mediaCompression';
import SendQualityModal from './SendQualityModal';

const MAX_FILES = 5;
const MAX_TEXTAREA_HEIGHT = 120;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function composerReplyPreview(m: MessagingMessage): string {
  if (m.content && m.content.trim()) return m.content;
  if (m.attachments.length > 0) return '📎 Archivo adjunto';
  return '';
}

function PendingFileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg max-w-full">
      {isImage && previewUrl ? (
        <img
          src={previewUrl}
          alt={file.name}
          className="w-10 h-10 rounded-md object-cover flex-shrink-0 border border-emerald-200"
        />
      ) : (
        <span className="w-10 h-10 rounded-md bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <i className={`text-emerald-600 text-sm ${isImage ? 'ri-image-line' : 'ri-file-3-line'}`}></i>
        </span>
      )}
      <span className="text-xs text-emerald-800 truncate max-w-[120px]">{file.name}</span>
      <span className="text-[10px] text-emerald-500 flex-shrink-0">{formatFileSize(file.size)}</span>
      <button
        onClick={onRemove}
        title="Quitar archivo"
        className="w-4 h-4 flex items-center justify-center rounded-full text-emerald-500 hover:text-red-500 hover:bg-emerald-100 transition-colors cursor-pointer flex-shrink-0"
      >
        <i className="ri-close-line text-xs"></i>
      </button>
    </div>
  );
}

interface ChatComposerProps {
  sending: boolean;
  initialText?: string;
  initialFiles?: File[];
  onSend: (text: string, files: File[]) => void;
  onSendVoiceNote: (file: File) => void;
  onDraftChange: (text: string, files: File[]) => void;
  replyTo?: MessagingMessage | null;
  onCancelReply?: () => void;
}

export default function ChatComposer({
  sending,
  initialText = '',
  initialFiles = [],
  onSend,
  onSendVoiceNote,
  onDraftChange,
  replyTo = null,
  onCancelReply,
}: ChatComposerProps) {
  const [input, setInput] = useState(initialText);
  const [pendingFiles, setPendingFiles] = useState<File[]>(initialFiles);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [limitNotice, setLimitNotice] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityKind, setQualityKind] = useState<'photo' | 'voice'>('photo');
  const [pendingSend, setPendingSend] = useState<{ text: string; files: File[] } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSendingRef = useRef(sending);

  // Persistir el borrador (texto + archivos) hacia el padre en cada cambio.
  useEffect(() => {
    onDraftChange(input, pendingFiles);
  }, [input, pendingFiles, onDraftChange]);

  // Devolver el foco al textarea apenas termina el envío (de disabled a habilitado).
  useEffect(() => {
    if (prevSendingRef.current && !sending) {
      textareaRef.current?.focus();
    }
    prevSendingRef.current = sending;
  }, [sending]);

  // Enfocar el textarea apenas se inicia una respuesta a un mensaje (replyTo pasa a tener valor).
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus();
    }
  }, [replyTo]);

  // Cerrar el picker de emojis al hacer clic fuera de él.
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    setRecordingSeconds(0);
  }, []);

  const startRecording = useCallback(async (highQuality: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg';

      const mr = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: voiceNoteBitrate(highQuality),
      });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const ext = (mr.mimeType || 'audio/webm').includes('mp4')
          ? 'm4a'
          : (mr.mimeType || 'audio/webm').includes('ogg')
          ? 'ogg'
          : 'webm';
        const file = new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type: blob.type });
        stream.getTracks().forEach((t) => t.stop());
        if (file.size > 0) onSendVoiceNote(file);
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setRecording(false);
    }
  }, [onSendVoiceNote]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    setPendingFiles((prev) => {
      const combined = [...prev, ...incoming];
      if (combined.length > MAX_FILES) {
        setLimitNotice(true);
        if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
        limitTimerRef.current = setTimeout(() => setLimitNotice(false), 3000);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSubmit = () => {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || sending) return;
    const hasImage = pendingFiles.some((f) => isImage(f));
    if (hasImage) {
      setPendingSend({ text, files: pendingFiles });
      setQualityKind('photo');
      setQualityOpen(true);
      return;
    }
    onSend(text, pendingFiles);
    setInput('');
    setPendingFiles([]);
    textareaRef.current?.focus();
  };

  const handleQualityClose = () => {
    setQualityOpen(false);
    setPendingSend(null);
  };

  const handleQualityChoose = async (highQuality: boolean) => {
    if (qualityKind === 'voice') {
      setQualityOpen(false);
      startRecording(highQuality);
      return;
    }
    if (!pendingSend) {
      setQualityOpen(false);
      return;
    }
    const { text, files: originalFiles } = pendingSend;
    let files = originalFiles;
    if (!highQuality) {
      files = await Promise.all(
        originalFiles.map(async (f) => {
          if (isImage(f)) {
            try {
              return await compressImageFile(f);
            } catch {
              return f;
            }
          }
          return f;
        })
      );
    }
    setPendingSend(null);
    setQualityOpen(false);
    onSend(text, files);
    setInput('');
    setPendingFiles([]);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    e.target.value = '';
  };

  const insertEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <>
    <div className="px-3 py-3 bg-white border-t border-gray-200 flex-shrink-0 relative">
      {/* Emoji picker */}
      {showEmoji && (
        <div ref={emojiRef}>
          <EmojiPicker onSelect={insertEmoji} />
        </div>
      )}

      {limitNotice && (
        <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
          <i className="ri-error-warning-line text-amber-600 text-sm flex-shrink-0"></i>
          <span className="text-xs text-amber-700">Solo podés adjuntar hasta {MAX_FILES} archivos por mensaje.</span>
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0"></span>
          <span className="text-xs text-red-700 flex-1">Grabando... {formatSeconds(recordingSeconds)}</span>
          <button
            onClick={stopRecording}
            className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
          >
            Detener y enviar
          </button>
        </div>
      )}

      {/* Archivos pendientes */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingFiles.map((f, i) => (
            <PendingFileChip key={`${f.name}-${f.size}-${i}`} file={f} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}

      {/* Mensaje citado (responder) */}
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span className="w-0.5 self-stretch rounded-full bg-emerald-500 flex-shrink-0"></span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-700 mb-0.5">Respondiendo a {replyTo.sender_name}</p>
            <p className="text-xs text-emerald-800 truncate">{composerReplyPreview(replyTo) || ' '}</p>
          </div>
          <button
            onClick={onCancelReply}
            title="Cancelar respuesta"
            className="w-5 h-5 flex items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-100 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
          >
            <i className="ri-close-line text-sm"></i>
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileChange} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

        <button
          onClick={() => {
            if (recording) {
              stopRecording();
            } else {
              setQualityKind('voice');
              setQualityOpen(true);
            }
          }}
          disabled={sending}
          title={recording ? 'Detener grabación' : 'Grabar nota de voz'}
          className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer disabled:opacity-40 flex-shrink-0 ${
            recording ? 'bg-red-100 text-red-600' : 'text-emerald-600 hover:bg-emerald-50'
          }`}
        >
          <i className={`text-lg ${recording ? 'ri-stop-fill' : 'ri-mic-line'}`}></i>
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={sending}
          title={`Adjuntar archivos (máx ${MAX_FILES})`}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-40 flex-shrink-0"
        >
          <i className="ri-attachment-2 text-lg"></i>
        </button>

        <button
          onClick={() => cameraRef.current?.click()}
          disabled={sending}
          title="Tomar o enviar foto"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-40 flex-shrink-0"
        >
          <i className="ri-camera-line text-lg"></i>
        </button>

        <button
          onClick={() => setShowEmoji((v) => !v)}
          disabled={sending}
          title="Emojis"
          className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer disabled:opacity-40 flex-shrink-0 ${
            showEmoji ? 'bg-emerald-50 text-emerald-600' : 'text-emerald-600 hover:bg-emerald-50'
          }`}
        >
          <i className="ri-emotion-happy-line text-lg"></i>
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un mensaje..."
          rows={1}
          disabled={sending}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-xl resize-none focus:outline-none focus:border-emerald-500 disabled:opacity-60 overflow-y-auto"
          style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
        />

        <button
          onClick={handleSubmit}
          disabled={(!input.trim() && pendingFiles.length === 0) || sending}
          className="w-9 h-9 flex items-center justify-center bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 cursor-pointer flex-shrink-0 transition-colors"
        >
          <i className="ri-send-plane-fill text-sm"></i>
        </button>
      </div>

    </div>

    <SendQualityModal
      open={qualityOpen}
      kind={qualityKind}
      onClose={handleQualityClose}
      onChoose={handleQualityChoose}
    />
    </>
  );
}