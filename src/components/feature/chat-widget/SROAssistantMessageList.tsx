import { useEffect, useRef } from 'react';
import type { ChatMessage, ChatCitation } from '../../../types/chat';

interface SROAssistantMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  userName?: string;
  onSuggest: (q: string) => void;
}

function CitationCard({ citation }: { citation: ChatCitation }) {
  return (
    <div className="flex items-start gap-1.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
        <i className="ri-file-pdf-line text-red-400 text-xs"></i>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{citation.document_title}</p>
        {citation.excerpt && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{citation.excerpt}</p>
        )}
      </div>
    </div>
  );
}

function SuggestionChips({
  suggestions,
  onSuggest,
}: {
  suggestions: string[];
  onSuggest: (q: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <p className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">
        <i className="ri-lightbulb-line"></i>
        Podés seguir preguntando:
      </p>
      {suggestions.map((q) => (
        <button
          key={q}
          onClick={() => onSuggest(q)}
          className="text-left px-3 py-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 cursor-pointer transition-colors whitespace-normal"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

const DEFAULT_SUGGESTIONS = [
  '¿Cómo creo una nueva reserva?',
  '¿Cómo funciona el control de acceso en la casetilla?',
  '¿Cómo asigno permisos a un usuario?',
];

interface EmptyStateProps {
  userName?: string;
  onSuggest: (q: string) => void;
}

function EmptyState({ userName, onSuggest }: EmptyStateProps) {
  const greeting = userName ? `Hola, ${userName}` : 'Hola';

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center">
      <div className="w-14 h-14 flex items-center justify-center bg-teal-50 rounded-full mb-3 border border-teal-100">
        <i className="ri-robot-2-line text-3xl text-teal-500"></i>
      </div>
      <p className="text-sm font-semibold text-gray-800 mb-0.5">{greeting} 👋</p>
      <p className="text-sm font-medium text-teal-700 mb-1">Soy SRObot</p>
      <p className="text-xs text-gray-500 mb-5 max-w-xs leading-relaxed">
        Tu asistente documental del sistema SRO. Consultame sobre los documentos autorizados para tu perfil y te respondo al instante.
      </p>
      <div className="w-full space-y-2">
        <p className="text-xs text-gray-400 mb-1">Algunas preguntas frecuentes:</p>
        {DEFAULT_SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSuggest(q)}
            className="w-full text-left px-3 py-2.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50/50 cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <i className="ri-arrow-right-s-line text-teal-400 flex-shrink-0"></i>
              {q}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SROAssistantMessageList({
  messages,
  loading,
  sending,
  userName,
  onSuggest,
}: SROAssistantMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-sm text-gray-500">
        <i className="ri-loader-4-line text-xl text-teal-500 animate-spin"></i>
        Cargando conversación...
      </div>
    );
  }

  if (messages.length === 0 && !sending) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState userName={userName} onSuggest={onSuggest} />
      </div>
    );
  }

  const lastAssistantIdx = [...messages].map((m, i) => m.role === 'assistant' ? i : -1).filter(i => i >= 0).pop() ?? -1;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg, idx) => {
        const isUser = msg.role === 'user';
        const isLastAssistant = idx === lastAssistantIdx;

        if (isUser) {
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[80%]">
                <div className="bg-teal-600 text-white px-3 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
                  {msg.content}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 text-right">{formatTime(msg.created_at)}</p>
              </div>
            </div>
          );
        }

        return (
          <div key={msg.id} className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-1">
              <i className="ri-robot-2-line text-teal-600 text-xs"></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3 py-2.5 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                {msg.content}
              </div>

              {msg.citations.length > 0 && (
                <div className="mt-1.5">
                  <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    <i className="ri-book-2-line"></i>
                    Fuentes ({msg.citations.length})
                  </p>
                  <div className="space-y-1">
                    {msg.citations.map((c, i) => (
                      <CitationCard key={i} citation={c} />
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested follow-up questions — only on the last assistant message */}
              {isLastAssistant && msg.suggested_questions && msg.suggested_questions.length > 0 && !sending && (
                <SuggestionChips suggestions={msg.suggested_questions} onSuggest={onSuggest} />
              )}

              <p className="text-xs text-gray-400 mt-0.5">{formatTime(msg.created_at)}</p>
            </div>
          </div>
        );
      })}

      {sending && (
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-1">
            <i className="ri-robot-2-line text-teal-600 text-xs"></i>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3 py-2.5">
            <div className="flex gap-1 items-center">
              <span className="text-xs text-gray-400 mr-1">SRObot está pensando</span>
              <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
