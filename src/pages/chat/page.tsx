import { useChatSession } from '../../hooks/useChatSession';
import ChatSidebar from './components/ChatSidebar';
import ChatWindow from './components/ChatWindow';

export default function ChatPage() {
  const {
    sessions,
    activeSession,
    messages,
    loadingSessions,
    loadingMessages,
    sending,
    error,
    selectSession,
    startNewSession,
    sendMessage,
    renameSession,
    removeSession,
    clearError,
  } = useChatSession();

  const handleSend = async (question: string) => {
    await sendMessage(question);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="hidden md:flex">
        <ChatSidebar
          sessions={sessions}
          activeSession={activeSession}
          loading={loadingSessions}
          onSelect={selectSession}
          onNew={startNewSession}
          onRename={renameSession}
          onArchive={removeSession}
        />
      </div>

      {/* Chat window */}
      <ChatWindow
        session={activeSession}
        messages={messages}
        loading={loadingMessages}
        sending={sending}
        error={error}
        onSend={handleSend}
        onNewSession={startNewSession}
        onClearError={clearError}
      />
    </div>
  );
}
