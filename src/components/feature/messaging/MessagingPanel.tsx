import { useState } from 'react';
import type { MessagingContact, MessagingConversation, MessagingThread } from '@/types/messaging';
import ConversationList from './ConversationList';
import ConversationView from './ConversationView';

interface MessagingPanelProps {
  contacts: MessagingContact[];
  conversations: MessagingConversation[];
  activeConversationId: string | null;
  activeThread: MessagingThread | null;
  loading: boolean;
  loadingThread: boolean;
  sending: boolean;
  currentUserId: string | null;
  onlineUserIds: Set<string>;
  onSelect: (id: string) => void;
  onBack: () => void;
  onNewChat: () => void;
  onSendText: (text: string) => void;
  onSendFile: (file: File) => void;
  onToggleExpress: () => void;
  onDeleteMessage: (messageId: string) => void;
  onDeleteConversation: (id: string) => void;
}

export default function MessagingPanel({
  contacts,
  conversations,
  activeConversationId,
  activeThread,
  loading,
  loadingThread,
  sending,
  currentUserId,
  onlineUserIds,
  onSelect,
  onBack,
  onNewChat,
  onSendText,
  onSendFile,
  onToggleExpress,
  onDeleteMessage,
  onDeleteConversation,
}: MessagingPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const showConversation = !!activeConversationId;

  return (
    <div
      className="fixed bottom-36 right-4 sm:bottom-[9.5rem] sm:right-6 z-[9999] flex flex-col rounded-2xl overflow-hidden bg-white transition-all duration-200"
      style={{
        width: isExpanded ? 'min(720px, calc(100vw - 2rem))' : 'min(400px, calc(100vw - 2rem))',
        height: isExpanded ? 'min(760px, 88vh)' : 'min(600px, 72vh)',
        minHeight: isExpanded ? '500px' : '400px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}
    >
      {showConversation ? (
        <ConversationView
          thread={activeThread}
          loading={loadingThread}
          sending={sending}
          currentUserId={currentUserId}
          onlineUserIds={onlineUserIds}
          isExpanded={isExpanded}
          onBack={onBack}
          onSendText={onSendText}
          onSendFile={onSendFile}
          onToggleExpress={onToggleExpress}
          onDeleteMessage={onDeleteMessage}
          onDeleteConversation={onDeleteConversation}
          onToggleExpand={() => setIsExpanded((v) => !v)}
        />
      ) : (
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          loading={loading}
          onSelect={onSelect}
          onNewChat={onNewChat}
        />
      )}
    </div>
  );
}