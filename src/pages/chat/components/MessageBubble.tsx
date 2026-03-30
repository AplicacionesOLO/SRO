import type { ChatMessage, ChatCitation } from '../../../types/chat';

interface MessageBubbleProps {
  message: ChatMessage;
  showCitations?: boolean;
}

function CitationCard({ citation }: { citation: ChatCitation }) {
  return (
    <div className="flex items-start gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
        <i className="ri-file-pdf-line text-red-400 text-sm"></i>
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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message, showCitations = true }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasCitations = showCitations && message.citations.length > 0;

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-lg">
          <div className="bg-teal-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
            {message.content}
          </div>
          <p className="text-xs text-gray-400 mt-1 text-right">{formatTime(message.created_at)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 mb-4">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-1">
        <i className="ri-robot-2-line text-teal-600 text-sm"></i>
      </div>

      <div className="flex-1 max-w-2xl">
        {/* Message */}
        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Citations */}
        {hasCitations && (
          <div className="mt-2">
            <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
              <i className="ri-book-2-line"></i>
              Fuentes ({message.citations.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {message.citations.map((c, idx) => (
                <CitationCard key={idx} citation={c} />
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-1">{formatTime(message.created_at)}</p>
      </div>
    </div>
  );
}
