import { useState, useEffect, useCallback, useRef } from 'react';
import { usePermissions } from './usePermissions';
import {
  fetchSessions,
  createSession,
  updateSessionTitle,
  archiveSession,
  fetchMessages,
  askChat,
} from '../services/chatService';
import type { ChatSession, ChatMessage, AskChatResponse } from '../types/chat';

interface UseChatSessionReturn {
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  messages: ChatMessage[];
  loadingSessions: boolean;
  loadingMessages: boolean;
  sending: boolean;
  error: string | null;
  selectSession: (session: ChatSession) => void;
  startNewSession: () => Promise<void>;
  sendMessage: (question: string) => Promise<AskChatResponse | null>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  removeSession: (sessionId: string) => Promise<void>;
  clearError: () => void;
}

export function useChatSession(): UseChatSessionReturn {
  const { orgId, userId } = usePermissions();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const optimisticMessages = useRef<ChatMessage[]>([]);

  const loadSessions = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoadingSessions(true);
    try {
      const data = await fetchSessions(orgId, userId);
      setSessions(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSessions(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true);
    try {
      const data = await fetchMessages(sessionId);
      setMessages(data);
      optimisticMessages.current = data;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const selectSession = useCallback(
    (session: ChatSession) => {
      setActiveSession(session);
      setMessages([]);
      loadMessages(session.id);
    },
    [loadMessages]
  );

  const startNewSession = useCallback(async () => {
    if (!orgId || !userId) return;
    try {
      const session = await createSession(orgId, userId);
      setSessions((prev) => [session, ...prev]);
      setActiveSession(session);
      setMessages([]);
      optimisticMessages.current = [];
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orgId, userId]);

  const sendMessage = useCallback(
    async (question: string): Promise<AskChatResponse | null> => {
      if (!activeSession) return null;
      setSending(true);
      setError(null);

      // Optimistic user message
      const tempId = `temp_${Date.now()}`;
      const tempMsg: ChatMessage = {
        id: tempId,
        session_id: activeSession.id,
        org_id: activeSession.org_id,
        user_id: userId || null,
        role: 'user',
        content: question,
        citations: [],
        used_document_ids: [],
        model: null,
        input_tokens: null,
        output_tokens: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMsg]);

      try {
        const response = await askChat({ question, session_id: activeSession.id });
        // Reload messages from DB to get real data
        const updated = await fetchMessages(activeSession.id);

        // Attach suggested_questions to the last assistant message (in-memory only)
        if (response?.suggested_questions?.length) {
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = { ...updated[lastIdx], suggested_questions: response.suggested_questions };
          }
        }
        setMessages(updated);

        // Refresh sessions list (title may have been auto-set)
        await loadSessions();

        return response;
      } catch (e) {
        setError((e as Error).message);
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return null;
      } finally {
        setSending(false);
      }
    },
    [activeSession, userId, loadSessions]
  );

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    await updateSessionTitle(sessionId, title);
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
    );
    if (activeSession?.id === sessionId) {
      setActiveSession((prev) => (prev ? { ...prev, title } : prev));
    }
  }, [activeSession]);

  const removeSession = useCallback(async (sessionId: string) => {
    await archiveSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
      setMessages([]);
    }
  }, [activeSession]);

  const clearError = useCallback(() => setError(null), []);

  return {
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
  };
}
