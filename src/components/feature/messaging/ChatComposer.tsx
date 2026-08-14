import { useState, useRef, useCallback } from 'react';
import EmojiPicker from './EmojiPicker';

interface ChatComposerProps {
  sending: boolean;
  onSendText: (text: string) => void;
  onSendFile: (file: File) => void;
}

export default function ChatComposer({ sending, onSendText, onSendFile }: ChatComposerProps) {
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg';

      const mr = new MediaRecorder(stream, { mimeType: mimeType || undefined });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const ext = (mr.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : (mr.mimeType || 'audio/webm').includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type: blob.type });
        // liberar el micrófono
        stream.getTracks().forEach((t) => t.stop());
        if (file.size > 0) onSendFile(file);
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      // permiso denegado o sin micrófono
      setRecording(false);
    }
  }, [onSendFile]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    onSendText(text);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSendFile(file);
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
    <div className="px-3 py-3 bg-white border-t border-gray-200 flex-shrink-0 relative">
      {/* Emoji picker */}
      {showEmoji && <EmojiPicker onSelect={insertEmoji} />}

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

      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />

        <button
          onClick={() => {
            if (recording) {
              stopRecording();
            } else {
              startRecording();
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
          title="Adjuntar archivo"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-40 flex-shrink-0"
        >
          <i className="ri-attachment-2 text-lg"></i>
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
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-xl resize-none focus:outline-none focus:border-emerald-500 disabled:opacity-60"
          style={{ maxHeight: '96px', overflow: 'auto' }}
        />

        <button
          onClick={handleSubmit}
          disabled={!input.trim() || sending}
          className="w-9 h-9 flex items-center justify-center bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 cursor-pointer flex-shrink-0 transition-colors"
        >
          <i className="ri-send-plane-fill text-sm"></i>
        </button>
      </div>
    </div>
  );
}