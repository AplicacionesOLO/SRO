import { useEffect, useRef, useState } from 'react';
import type { ChatSession, ChatMessage } from '../../../types/chat';
import MessageBubble from './MessageBubble';

interface ChatWindowProps {
  session: ChatSession | null;
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  onSend: (question: string) => void;
  onNewSession: () => void;
  onClearError: () => void;
}

const SUGGESTED_QUESTIONS = [
  '¿Cuáles son los pasos para crear una reserva?',
  '¿Cómo se asignan permisos a un usuario?',
  '¿Qué es el punto de control IN/OUT?',
  '¿Cómo funciona el módulo de manpower?',
];

export default function ChatWindow({
  session,
  messages,
  loading,
  sending,
  error,
  onSend,
  onNewSession,
  onClearError,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    onSend(q);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="w-16 h-16 flex items-center justify-center bg-teal-50 rounded-full mb-4">
          <i className="ri-robot-2-line text-3xl text-teal-500"></i>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Asistente SRO</h2>
        <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
          Consultá la base de conocimiento documental de tu organización. Las respuestas se generan exclusivamente desde los documentos autorizados para tu perfil.
        </p>
        <button
          onClick={onNewSession}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line"></i>
          Iniciar conversación
        </button>
        <div className="mt-8 w-full max-w-sm">
          <p className="text-xs text-gray-400 text-center mb-3">Preguntas frecuentes</p>
          <div className="space-y-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => { onNewSession(); setTimeout(() => onSend(q), 200); }}
                className="w-full text-left px-3 py-2.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-teal-300 hover:text-teal-700 cursor-pointer transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3.5 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 flex items-center justify-center bg-teal-100 rounded-full">
          <i className="ri-robot-2-line text-teal-600"></i>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-800">
            {session.title || 'Asistente SRO'}
          </h3>
          <p className="text-xs text-gray-400">Responde con base documental autorizada</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <i className="ri-loader-4-line text-xl text-teal-500 animate-spin"></i>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <i className="ri-chat-3-line text-3xl text-gray-200 mb-3"></i>
            <p className="text-sm text-gray-500">Hacé tu primera pregunta</p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => onSend(q)}
                  className="text-left px-3 py-2.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-teal-300 hover:text-teal-700 cursor-pointer transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {sending && (
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <i className="ri-robot-2-line text-teal-600 text-sm"></i>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-2 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <i className="ri-error-warning-line"></i>
          <span className="flex-1">{error}</span>
          <button onClick={onClearError} className="text-red-400 hover:text-red-700 cursor-pointer">
            <i className="ri-close-line"></i>
          </button>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-5 py-4 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hacé tu pregunta sobre los documentos de SRO..."
            rows={1}
            disabled={sending}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-xl resize-none focus:outline-none focus:border-teal-500 disabled:opacity-60"
            style={{ maxHeight: '120px', overflow: 'auto' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-10 h-10 flex items-center justify-center bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-40 cursor-pointer flex-shrink-0 transition-colors"
          >
            {sending ? (
              <i className="ri-loader-4-line animate-spin text-base"></i>
            ) : (
              <i className="ri-send-plane-fill text-base"></i>
            )}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  );
}
