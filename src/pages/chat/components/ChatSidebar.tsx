import type { ChatSession } from '../../../types/chat';

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  loading: boolean;
  onSelect: (session: ChatSession) => void;
  onNew: () => void;
  onRename: (sessionId: string, title: string) => void;
  onArchive: (sessionId: string) => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function ChatSidebar({
  sessions,
  activeSession,
  loading,
  onSelect,
  onNew,
  onRename,
  onArchive,
}: ChatSidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors cursor-pointer"
        >
          <i className="ri-add-line"></i>
          Nueva conversación
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <i className="ri-loader-4-line text-xl text-teal-500 animate-spin"></i>
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <i className="ri-chat-3-line text-3xl text-gray-200 block mb-2"></i>
            <p className="text-xs text-gray-400">Sin conversaciones aún</p>
          </div>
        ) : (
          <ul className="py-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onSelect(s)}
                  className={`w-full flex items-start gap-2 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer text-left group ${
                    activeSession?.id === s.id ? 'bg-teal-50 border-r-2 border-teal-500' : ''
                  }`}
                >
                  <i className={`ri-chat-3-line text-base mt-0.5 flex-shrink-0 ${activeSession?.id === s.id ? 'text-teal-600' : 'text-gray-400'}`}></i>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${activeSession?.id === s.id ? 'text-teal-700' : 'text-gray-700'}`}>
                      {s.title || 'Conversación'}
                    </p>
                    <p className="text-xs text-gray-400">{timeAgo(s.last_message_at || s.created_at)}</p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newTitle = window.prompt('Nuevo nombre:', s.title || '');
                        if (newTitle) onRename(s.id, newTitle.trim());
                      }}
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-teal-600 cursor-pointer"
                      title="Renombrar"
                    >
                      <i className="ri-edit-line text-xs"></i>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onArchive(s.id); }}
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer"
                      title="Archivar"
                    >
                      <i className="ri-delete-bin-line text-xs"></i>
                    </button>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
