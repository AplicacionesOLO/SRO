import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { MessagingThread, MessagingMessage, MessagingAttachment, MessagingMember, MessagingReplyTo } from '@/types/messaging';
import { getFileUrl } from '@/services/messagingService';
import Avatar from './Avatar';
import ChatComposer from './ChatComposer';
import VoiceNotePlayer from './VoiceNotePlayer';
import MediaAttachment from './MediaAttachment';

const DELETE_WINDOW_MS = 60 * 1000; // 1 minuto

interface ConversationViewProps {
  thread: MessagingThread | null;
  loading: boolean;
  sending: boolean;
  currentUserId: string | null;
  onlineUserIds: Set<string>;
  isExpanded: boolean;
  onBack: () => void;
  onSend: (text: string, files: File[], replyToMessageId?: string | null) => void;
  onSendVoiceNote: (file: File, replyToMessageId?: string | null) => void;
  onToggleExpress: () => void;
  onDeleteMessage: (messageId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onToggleExpand: () => void;
  draft?: { text: string; files: File[] };
  onDraftChange: (text: string, files: File[]) => void;
}

type MessageStatus = 'sent' | 'delivered' | 'read';

function computeStatus(
  message: MessagingMessage,
  currentUserId: string | null,
  members: MessagingMember[],
  onlineUserIds: Set<string>,
): MessageStatus {
  const others = members.filter((m) => m.user_id !== currentUserId);
  if (others.length === 0) return 'sent';
  const msgTime = new Date(message.created_at).getTime();
  const allRead = others.every((m) => m.last_read_at && new Date(m.last_read_at).getTime() >= msgTime);
  if (allRead) return 'read';
  if (others.some((m) => onlineUserIds.has(m.user_id))) return 'delivered';
  return 'sent';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const nodes: ReactNode[] = [];
  let idx = 0;
  let found = lower.indexOf(lowerQ);
  let key = 0;
  while (found !== -1) {
    if (found > idx) nodes.push(text.slice(idx, found));
    nodes.push(
      <mark key={key++} className="bg-amber-200 text-inherit rounded-sm px-0.5">
        {text.slice(found, found + lowerQ.length)}
      </mark>
    );
    idx = found + lowerQ.length;
    found = lower.indexOf(lowerQ, idx);
  }
  if (idx < text.length) nodes.push(text.slice(idx));
  return <>{nodes}</>;
}

function AttachmentChip({ attachment, highlightQuery }: { attachment: MessagingAttachment; highlightQuery?: string }) {
  const [loading, setLoading] = useState(false);

  const fileType = attachment.file_type || '';
  const isVoiceNote = fileType.startsWith('audio/') && (attachment.file_name || '').startsWith('nota-de-voz');
  const isImage = fileType.startsWith('image/');
  const isVideo = fileType.startsWith('video/');

  if (isVoiceNote) {
    return <VoiceNotePlayer attachment={attachment} />;
  }

  if (isImage || isVideo) {
    return <MediaAttachment attachment={attachment} />;
  }

  const handleOpen = async () => {
    setLoading(true);
    try {
      const { url } = await getFileUrl(attachment.id);
      window.open(url, '_blank', 'noopener');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleOpen}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer max-w-full"
      title={attachment.file_name}
    >
      {isImage ? (
        <i className="ri-image-line text-emerald-600 flex-shrink-0"></i>
      ) : (
        <i className="ri-file-3-line text-emerald-600 flex-shrink-0"></i>
      )}
      <span className="text-xs text-emerald-800 truncate max-w-[180px]">
        {highlightQuery ? <HighlightedText text={attachment.file_name} query={highlightQuery} /> : attachment.file_name}
      </span>
      <span className="text-[10px] text-emerald-600 flex-shrink-0">{formatFileSize(attachment.file_size)}</span>
      {loading ? (
        <i className="ri-loader-4-line animate-spin text-xs text-emerald-600 flex-shrink-0"></i>
      ) : (
        <i className="ri-download-2-line text-xs text-emerald-600 flex-shrink-0"></i>
      )}
    </button>
  );
}

function replyPreview(replyTo: MessagingReplyTo): string {
  if (replyTo.deleted) return 'Mensaje eliminado';
  if (replyTo.content && replyTo.content.trim()) return replyTo.content;
  if (replyTo.has_attachments) return '📎 Archivo adjunto';
  return '';
}

function ReplyQuote({ replyTo, isMine, onClick }: { replyTo: MessagingReplyTo; isMine?: boolean; onClick?: () => void }) {
  const preview = replyPreview(replyTo);
  const clickable = !replyTo.deleted && typeof onClick === 'function';
  return (
    <div
      onClick={clickable ? onClick : undefined}
      title={clickable ? 'Ir al mensaje original' : undefined}
      className={`mb-1.5 px-2.5 py-1.5 rounded-lg text-xs leading-snug flex gap-2 transition-colors ${
        clickable ? 'cursor-pointer' : ''
      } ${isMine ? 'bg-emerald-700/40 text-emerald-50 hover:bg-emerald-700/60' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
    >
      <span className={`w-0.5 self-stretch rounded-full flex-shrink-0 ${isMine ? 'bg-emerald-200' : 'bg-emerald-400'}`}></span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold mb-0.5 ${isMine ? 'text-emerald-100' : 'text-emerald-700'}`}>{replyTo.sender_name}</p>
        <p className={`truncate ${replyTo.deleted ? 'italic opacity-70' : ''}`}>{preview || ' '}</p>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  isMine,
  deletable,
  onDelete,
  onReply,
  onScrollToMessage,
  highlightQuery,
  status,
}: {
  message: MessagingMessage;
  isMine: boolean;
  deletable: boolean;
  onDelete: () => void;
  onReply: () => void;
  onScrollToMessage: (id: string) => void;
  highlightQuery?: string;
  status?: MessageStatus | null;
}) {
  const hasFiles = message.attachments.length > 0;

  if (isMine) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[78%]">
          {message.reply_to && (
            <ReplyQuote replyTo={message.reply_to} isMine onClick={() => onScrollToMessage(message.reply_to!.id)} />
          )}
          {message.content && (
            <div className="bg-emerald-600 text-white px-3 py-2 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words">
              {highlightQuery ? <HighlightedText text={message.content} query={highlightQuery} /> : message.content}
            </div>
          )}
          {hasFiles && (
            <div className="mt-1 flex flex-col items-end gap-1.5">
              {message.attachments.map((a) => (
                <AttachmentChip key={a.id} attachment={a} highlightQuery={highlightQuery} />
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <button
              onClick={onReply}
              className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
              title="Responder"
            >
              <i className="ri-reply-line text-xs"></i>
            </button>
            {deletable && (
              <button
                onClick={onDelete}
                className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                title="Eliminar mensaje"
              >
                <i className="ri-delete-bin-6-line text-xs"></i>
              </button>
            )}
            {isMine && status && (
              <span
                className={`w-4 h-4 flex items-center justify-center ${
                  status === 'read' ? 'text-emerald-500' : 'text-gray-400'
                }`}
                title={status === 'read' ? 'Leído' : status === 'delivered' ? 'Recibido' : 'Enviado'}
              >
                <i className={`${status === 'sent' ? 'ri-check-line' : 'ri-check-double-line'} text-sm`}></i>
              </span>
            )}
            <p className="text-[11px] text-gray-400 text-right">{formatTime(message.created_at)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 mb-3">
      <div className="mt-0.5 flex-shrink-0">
        <Avatar name={message.sender_name} url={message.sender_avatar_url} size={28} />
      </div>
      <div className="max-w-[78%] min-w-0">
        <p className="text-[11px] text-gray-400 mb-0.5">{message.sender_name}</p>
        {message.reply_to && (
          <ReplyQuote replyTo={message.reply_to} onClick={() => onScrollToMessage(message.reply_to!.id)} />
        )}
        {message.content && (
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
            {highlightQuery ? <HighlightedText text={message.content} query={highlightQuery} /> : message.content}
          </div>
        )}
        {hasFiles && (
          <div className="mt-1 flex flex-col gap-1.5">
            {message.attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} highlightQuery={highlightQuery} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-[11px] text-gray-400">{formatTime(message.created_at)}</p>
          <button
            onClick={onReply}
            className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
            title="Responder"
          >
            <i className="ri-reply-line text-xs"></i>
          </button>
          {deletable && (
            <button
              onClick={onDelete}
              className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              title="Eliminar mensaje"
            >
              <i className="ri-delete-bin-6-line text-xs"></i>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConversationView({
  thread,
  loading,
  sending,
  currentUserId,
  onlineUserIds,
  isExpanded,
  onBack,
  onSend,
  onSendVoiceNote,
  onToggleExpress,
  onDeleteMessage,
  onDeleteConversation,
  onToggleExpand,
  draft,
  onDraftChange,
}: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const title = thread?.conversation?.title || 'Conversación';
  const members = thread?.members || [];
  const messages = thread?.messages || [];
  const isGroup = thread?.conversation?.type === 'group';
  const isExpress = thread?.conversation?.is_express === true;
  const createdBy = thread?.conversation?.created_by ?? null;
  const peer = !isGroup ? members.find((m) => m.user_id !== currentUserId) : null;
  const headerTitle = isGroup ? (title || 'Grupo') : (peer?.name || title || 'Conversación');
  const peerOnline = peer ? onlineUserIds.has(peer.user_id) : false;
  const onlineCount = members.filter((m) => onlineUserIds.has(m.user_id)).length;

  const searchTrimmed = searchQuery.trim().toLowerCase();
  const matchedIds = useMemo(() => {
    if (!searchTrimmed) return [] as string[];
    return messages
      .filter(
        (m) =>
          (m.content || '').toLowerCase().includes(searchTrimmed) ||
          m.attachments.some((a) => (a.file_name || '').toLowerCase().includes(searchTrimmed))
      )
      .map((m) => m.id);
  }, [messages, searchTrimmed]);

  useEffect(() => {
    if (matchedIds.length === 0) return;
    const id = matchedIds[activeMatch % matchedIds.length];
    messageRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatch, matchedIds]);

  const deleteWarning = isGroup
    ? 'Vas a salir de este grupo y dejar de ver la conversación y todo su contenido. Esta acción no se puede deshacer.'
    : 'Se eliminará esta conversación y todo su contenido de tu lado. Si la otra persona también la elimina, se borrará definitivamente de la base de datos. Esta acción no se puede deshacer.';

  const canDelete = (m: MessagingMessage): boolean => {
    if (!currentUserId || !m.created_at) return false;
    const elapsed = Date.now() - new Date(m.created_at).getTime();
    if (elapsed > DELETE_WINDOW_MS) return false;
    const isMine = m.sender_id === currentUserId;
    const isCreator = createdBy === currentUserId;
    return isMine || isCreator;
  };

  const goNext = () => {
    if (matchedIds.length === 0) return;
    setActiveMatch((i) => (i + 1) % matchedIds.length);
  };

  const goPrev = () => {
    if (matchedIds.length === 0) return;
    setActiveMatch((i) => (i - 1 + matchedIds.length) % matchedIds.length);
  };

  const handleSend = (text: string, files: File[]) => {
    onSend(text, files, replyTo?.id ?? null);
    setReplyTo(null);
  };

  const handleSendVoiceNote = (file: File) => {
    onSendVoiceNote(file, replyTo?.id ?? null);
    setReplyTo(null);
  };

  const scrollToMessage = (id: string) => {
    const el = messageRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(id);
      window.setTimeout(() => {
        setFlashId((cur) => (cur === id ? null : cur));
      }, 1600);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 bg-emerald-600 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors cursor-pointer"
          title="Volver"
        >
          <i className="ri-arrow-left-line text-base"></i>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {!isGroup && peer && (
            <div className="flex-shrink-0">
              <Avatar name={peer.name} url={peer.avatar_url} size={30} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{headerTitle}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-100 truncate">
              {isGroup ? (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${onlineCount > 0 ? 'bg-green-300' : 'bg-white/40'}`}></span>
                  <span className="truncate">
                    {onlineCount > 0 ? `${onlineCount} de ${members.length} en línea` : `${members.length} miembros`}
                  </span>
                </>
              ) : (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${peerOnline ? 'bg-green-300' : 'bg-white/40'}`}></span>
                  <span className="truncate">
                    {peerOnline ? 'En línea' : 'Sin conexión'}
                    {peer?.email ? ` · ${peer.email}` : ''}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {isGroup && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {members.slice(0, 4).map((m) => (
              <div key={m.user_id} className="-ml-1 first:ml-0">
                <Avatar name={m.name} url={m.avatar_url} size={24} />
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => {
            if (searchOpen) {
              setSearchOpen(false);
              setSearchQuery('');
              setActiveMatch(0);
            } else {
              setSearchOpen(true);
            }
          }}
          className="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors cursor-pointer flex-shrink-0"
          title="Buscar en la conversación"
        >
          <i className="ri-search-line text-base"></i>
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors cursor-pointer flex-shrink-0"
          title="Eliminar conversación"
        >
          <i className="ri-delete-bin-6-line text-base"></i>
        </button>
        <button
          onClick={onToggleExpand}
          className="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors cursor-pointer flex-shrink-0"
          title={isExpanded ? 'Restaurar' : 'Ampliar'}
        >
          <i className={`text-base ${isExpanded ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'}`}></i>
        </button>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-3 py-2 bg-white border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
          <i className="ri-search-line text-gray-400 text-sm flex-shrink-0"></i>
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveMatch(0);
            }}
            placeholder="Buscar en la conversación..."
            className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
          />
          {searchQuery.trim() !== '' && (
            <>
              <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
                {matchedIds.length === 0 ? 'Sin resultados' : `${(activeMatch % matchedIds.length) + 1} de ${matchedIds.length}`}
              </span>
              <button
                onClick={goPrev}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer flex-shrink-0"
                title="Anterior"
              >
                <i className="ri-arrow-up-s-line"></i>
              </button>
              <button
                onClick={goNext}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer flex-shrink-0"
                title="Siguiente"
              >
                <i className="ri-arrow-down-s-line"></i>
              </button>
            </>
          )}
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
              setActiveMatch(0);
            }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer flex-shrink-0"
            title="Cerrar búsqueda"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      )}

      {/* Express banner */}
      {isExpress && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 flex-shrink-0">
          <i className="ri-timer-flash-line text-amber-600 text-sm flex-shrink-0"></i>
          <span className="text-[11px] text-amber-700">Conversación express: los mensajes se eliminan a las 24h</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <i className="ri-loader-4-line text-xl text-emerald-500 animate-spin"></i>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <i className="ri-chat-smile-2-line text-3xl text-gray-200 mb-2"></i>
            <p className="text-sm text-gray-500">No hay mensajes todavía</p>
            <p className="text-xs text-gray-400 mt-1">Escribí el primero 👋</p>
          </div>
        ) : (
          <>
            {messages.map((m) => {
              const isActive = matchedIds.length > 0 && m.id === matchedIds[activeMatch % matchedIds.length];
              const isMine = m.sender_id === currentUserId;
              const status = isMine ? computeStatus(m, currentUserId, members, onlineUserIds) : null;
              return (
                <div
                  key={m.id}
                  ref={(el) => {
                    if (el) messageRefs.current.set(m.id, el);
                    else messageRefs.current.delete(m.id);
                  }}
                  className={
                    isActive
                      ? 'bg-amber-100/80 rounded-lg'
                      : flashId === m.id
                      ? 'bg-emerald-100/80 rounded-lg transition-colors'
                      : ''
                  }
                >
                  <MessageItem
                    message={m}
                    isMine={isMine}
                    deletable={canDelete(m)}
                    onDelete={() => onDeleteMessage(m.id)}
                    onReply={() => setReplyTo(m)}
                    onScrollToMessage={scrollToMessage}
                    highlightQuery={searchOpen ? searchQuery : ''}
                    status={status}
                  />
                </div>
              );
            })}
            {sending && (
              <div className="flex justify-end mb-3">
                <div className="bg-emerald-100 text-emerald-600 px-3 py-2 rounded-2xl text-xs flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Enviando...
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Express toggle + composer */}
      <div className="flex-shrink-0">
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isExpress}
              onChange={onToggleExpress}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
            <span className="text-xs text-gray-600">Conversación express (borrar en 24h)</span>
          </label>
        </div>
        <ChatComposer
          sending={sending}
          initialText={draft?.text ?? ''}
          initialFiles={draft?.files ?? []}
          onSend={handleSend}
          onSendVoiceNote={handleSendVoiceNote}
          onDraftChange={onDraftChange}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-red-100 border-2 border-red-200 flex items-center justify-center">
                <i className="ri-delete-bin-6-line text-xl text-red-600"></i>
              </div>
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-2">Eliminar conversación</h3>
            <p className="text-sm text-gray-600 text-center leading-relaxed whitespace-pre-line">{deleteWarning}</p>
            <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium whitespace-nowrap cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  if (thread?.conversation?.id) onDeleteConversation(thread.conversation.id);
                }}
                className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium whitespace-nowrap cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}