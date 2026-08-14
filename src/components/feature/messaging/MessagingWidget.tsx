import { useState, useEffect, useCallback } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useMessaging } from '@/hooks/useMessaging';
import MessagingBubble from './MessagingBubble';
import MessagingPanel from './MessagingPanel';
import NewChatModal from './NewChatModal';

export default function MessagingWidget() {
  const { can, loading: permsLoading, userId } = usePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'info' | 'warn'; text: string } | null>(null);

  const {
    loading,
    contacts,
    conversations,
    totalUnread,
    activeConversationId,
    activeThread,
    loadingThread,
    sending,
    error,
    openConversation,
    closeConversation,
    startDirect,
    startGroup,
    sendText,
    sendFile,
    toggleExpress,
    deleteMessage,
    deleteConversation,
    clearError,
    requestNotificationPermission,
    onlineUserIds,
  } = useMessaging();

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && !permissionRequested) {
        setPermissionRequested(true);
        requestNotificationPermission().then((result) => {
          if (result === 'granted') {
            setNotice({ type: 'success', text: 'Notificaciones activadas: vas a recibir avisos de mensajes nuevos.' });
          } else if (result === 'denied') {
            setNotice({ type: 'warn', text: 'Notificaciones bloqueadas. Activalas desde el candado del navegador para no perderte mensajes.' });
          } else {
            setNotice({ type: 'info', text: 'Activá las notificaciones para no perderte mensajes nuevos.' });
          }
        });
      }
      return next;
    });
  }, [permissionRequested, requestNotificationPermission]);

  // Auto-ocultar el aviso
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  if (permsLoading) return null;
  if (!userId) return null;
  if (!can('chat.messages.view')) return null;

  return (
    <>
      <MessagingBubble isOpen={isOpen} unreadCount={totalUnread} onClick={handleToggle} />

      {isOpen && (
        <MessagingPanel
          contacts={contacts}
          conversations={conversations}
          activeConversationId={activeConversationId}
          activeThread={activeThread}
          loading={loading}
          loadingThread={loadingThread}
          sending={sending}
          currentUserId={userId}
          onlineUserIds={onlineUserIds}
          onSelect={openConversation}
          onBack={closeConversation}
          onNewChat={() => setShowNewChat(true)}
          onSendText={sendText}
          onSendFile={sendFile}
          onToggleExpress={toggleExpress}
          onDeleteMessage={deleteMessage}
          onDeleteConversation={deleteConversation}
        />
      )}

      <NewChatModal
        open={showNewChat}
        contacts={contacts}
        onClose={() => setShowNewChat(false)}
        onStartDirect={(id) => {
          setShowNewChat(false);
          startDirect(id);
        }}
        onStartGroup={(title, ids) => {
          setShowNewChat(false);
          startGroup(title, ids);
        }}
      />

      {/* Aviso de notificaciones */}
      {notice && (
        <div
          className={`fixed bottom-[11.5rem] right-4 sm:bottom-24 sm:right-24 z-[10003] max-w-xs flex items-start gap-2 px-4 py-3 rounded-lg text-sm border shadow-md ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : notice.type === 'warn'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <i
            className={`flex-shrink-0 mt-0.5 ${
              notice.type === 'success'
                ? 'ri-notification-3-line text-emerald-600'
                : notice.type === 'warn'
                ? 'ri-error-warning-line text-amber-600'
                : 'ri-notification-2-line text-blue-600'
            }`}
          ></i>
          <span className="flex-1 leading-snug">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-current opacity-60 hover:opacity-100 cursor-pointer flex-shrink-0">
            <i className="ri-close-line"></i>
          </button>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-36 right-4 sm:right-6 z-[10002] max-w-sm flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 shadow-md">
          <i className="ri-error-warning-line flex-shrink-0"></i>
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-700 cursor-pointer flex-shrink-0">
            <i className="ri-close-line"></i>
          </button>
        </div>
      )}
    </>
  );
}