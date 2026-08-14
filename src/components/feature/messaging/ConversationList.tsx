import { useState } from 'react';
import type { MessagingConversation } from '@/types/messaging';
import Avatar from './Avatar';

interface ConversationListProps {
  conversations: MessagingConversation[];
  activeConversationId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export default function ConversationList({
  conversations,
  activeConversationId,
  loading,
  onSelect,
  onNewChat,
}: ConversationListProps) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? conversations.filter((c) => {
        const q = query.trim().toLowerCase();
        return (
          (c.title || '').toLowerCase().includes(q) ||
          (c.peer?.name || '').toLowerCase().includes(q) ||
          (c.peer?.email || '').toLowerCase().includes(q)
        );
      })
    : conversations;

  const displayName = (c: MessagingConversation) => {
    if (c.type === 'group') return c.title || 'Grupo';
    return c.peer?.name || c.title || 'Conversación';
  };

  const avatarUrl = (c: MessagingConversation) => {
    if (c.type === 'group') return null;
    return c.peer?.avatar_url || null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 bg-emerald-600 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-sm font-semibold text-white">Mensajería</p>
          <p className="text-[11px] text-emerald-100">Chat interno de tu organización</p>
        </div>
        <button
          onClick={onNewChat}
          title="Nueva conversación"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
        >
          <i className="ri-edit-2-line text-base"></i>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className="relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400"></i>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversación..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <i className="ri-loader-4-line text-xl text-emerald-500 animate-spin"></i>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <i className="ri-chat-1-line text-3xl text-gray-200 block mb-2"></i>
            <p className="text-xs text-gray-400">
              {query.trim() ? 'Sin resultados' : 'Todavía no tenés conversaciones'}
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer text-left ${
                    activeConversationId === c.id ? 'bg-emerald-50' : ''
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {c.type === 'group' ? (
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <i className="ri-team-line text-lg"></i>
                      </div>
                    ) : (
                      <Avatar name={displayName(c)} url={avatarUrl(c)} size={36} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">{displayName(c)}</p>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                        {timeAgo(c.last_message_at)}
                      </span>
                    </div>
                    {c.is_express && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1">
                        <i className="ri-timer-flash-line"></i> Express
                      </p>
                    )}
                    {c.type === 'direct' && c.peer?.email && (
                      <p className="text-[11px] text-gray-400 truncate">{c.peer.email}</p>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-gray-500 truncate flex-1">
                        {c.last_message_preview || 'Sin mensajes'}
                      </p>
                      {c.unread_count > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}