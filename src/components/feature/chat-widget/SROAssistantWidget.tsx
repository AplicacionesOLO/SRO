import { useState, useCallback, useEffect } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';
import { useChatSession } from '../../../hooks/useChatSession';
import { supabase } from '../../../lib/supabase';
import { CHAT_WIDGET_ENABLED } from './config';
import SROAssistantBubble from './SROAssistantBubble';
import SROAssistantPanel from './SROAssistantPanel';

export default function SROAssistantWidget() {
  const { can, loading: permsLoading, userId } = usePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [userName, setUserName] = useState<string>('');

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
    clearError,
  } = useChatSession();

  // Fetch user's first name once
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) {
          setUserName(data.name.split(' ')[0]);
        }
      });
  }, [userId]);

  useEffect(() => {
    if (isOpen && !initialized && !loadingSessions) {
      setInitialized(true);
      if (sessions.length > 0) {
        selectSession(sessions[0]);
      }
    }
  }, [isOpen, initialized, loadingSessions, sessions, selectSession]);

  const handleClose = useCallback(() => setIsOpen(false), []);
  const handleToggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const handleNewSession = useCallback(async () => {
    await startNewSession();
  }, [startNewSession]);

  const handleSend = useCallback(async (question: string) => {
    if (!activeSession) {
      await startNewSession();
      setTimeout(async () => {
        await sendMessage(question);
      }, 150);
      return;
    }
    await sendMessage(question);
  }, [activeSession, startNewSession, sendMessage]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  if (!CHAT_WIDGET_ENABLED) return null;
  if (permsLoading) return null;
  if (!userId) return null;
  if (!can('chat.view') && !can('chat.ask')) return null;

  const isLoading = loadingSessions || loadingMessages;

  return (
    <>
      <SROAssistantBubble isOpen={isOpen} onClick={handleToggle} />
      {isOpen && (
        <SROAssistantPanel
          session={activeSession}
          messages={messages}
          loading={isLoading}
          sending={sending}
          error={error}
          userName={userName}
          onSend={handleSend}
          onClose={handleClose}
          onNewSession={handleNewSession}
          onClearError={clearError}
        />
      )}
    </>
  );
}
