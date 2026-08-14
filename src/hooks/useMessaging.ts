import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { usePermissions } from './usePermissions';
import type {
  MessagingContact,
  MessagingConversation,
  MessagingThread,
} from '@/types/messaging';
import {
  bootstrapMessaging,
  fetchThread,
  sendTextMessage,
  sendFilesMessage,
  createDirectConversation,
  createGroupConversation,
  toggleExpressConversation,
  deleteMessage as deleteMessageService,
  deleteConversation as deleteConversationService,
} from '@/services/messagingService';
import { playNotificationSound } from '@/utils/notificationSound';

export interface UseMessagingReturn {
  loading: boolean;
  contacts: MessagingContact[];
  conversations: MessagingConversation[];
  totalUnread: number;
  activeConversationId: string | null;
  activeThread: MessagingThread | null;
  loadingThread: boolean;
  sending: boolean;
  error: string | null;
  openConversation: (id: string) => void;
  closeConversation: () => void;
  startDirect: (recipientId: string) => Promise<string | null>;
  startGroup: (title: string, memberIds: string[]) => Promise<string | null>;
  sendFiles: (files: File[], text?: string) => Promise<void>;
  sendVoiceNote: (file: File) => Promise<void>;
  toggleExpress: () => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  refresh: () => void;
  clearError: () => void;
  requestNotificationPermission: () => Promise<string>;
  onlineUserIds: Set<string>;
}

export function useMessaging(): UseMessagingReturn {
  const { orgId, userId } = usePermissions();

  const [contacts, setContacts] = useState<MessagingContact[]>([]);
  const [conversations, setConversations] = useState<MessagingConversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<MessagingThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const userIdRef = useRef<string | null>(null);
  const activeConvRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactsRef = useRef<MessagingContact[]>([]);

  userIdRef.current = userId;
  activeConvRef.current = activeConversationId;
  contactsRef.current = contacts;

  const refresh = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await bootstrapMessaging(orgId);
      setContacts(data.contacts);
      setConversations(data.conversations);
      setTotalUnread(data.total_unread);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar la mensajería');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // Initial load
  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    refresh();
  }, [orgId, refresh]);

  const showBrowserNotification = useCallback((title: string, body: string) => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch {
      // ignore
    }
  }, []);

  const notifyIncomingMessage = useCallback((title: string, body: string) => {
    playNotificationSound();
    showBrowserNotification(title, body);
  }, [showBrowserNotification]);

  // Realtime Presence: quién está conectado en esta organización
  useEffect(() => {
    if (!orgId || !userId) return;

    const channel = supabase.channel(`msg-presence-${orgId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        Object.values(state).forEach((entries: any) => {
          entries.forEach((entry: any) => {
            if (entry?.user_id) ids.add(entry.user_id);
          });
        });
        setOnlineUserIds(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId]);

  // Realtime subscription
  useEffect(() => {
    if (!orgId || !userId) return;

    const channel = supabase
      .channel(`msg-realtime-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'msg_messages', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const newMsg = payload.new;
          const isMine = newMsg?.sender_id === userId;
          const isActive = newMsg?.conversation_id === activeConvRef.current;

          // Refresh bootstrap (debounced)
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => refresh(), 400);

          // Refresh open thread
          if (isActive) {
            fetchThread(newMsg.conversation_id)
              .then(setActiveThread)
              .catch(() => {});
          } else if (!isMine) {
            // Browser notification for non-active conversation
            const preview = newMsg?.content ? String(newMsg.content).slice(0, 120) : 'Nuevo archivo';
            notifyIncomingMessage('Nuevo mensaje en SRO', preview);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'msg_messages', filter: `org_id=eq.${orgId}` },
        (payload: any) => {
          const updatedMsg = payload.new;
          const isActive = updatedMsg?.conversation_id === activeConvRef.current;
          if (isActive) {
            fetchThread(updatedMsg.conversation_id)
              .then(setActiveThread)
              .catch(() => {});
          }
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => refresh(), 400);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'msg_conversations', filter: `org_id=eq.${orgId}` },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => refresh(), 400);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'msg_conversation_members', filter: `org_id=eq.${orgId}` },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => refresh(), 400);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [orgId, userId, refresh, notifyIncomingMessage]);

  const openConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setLoadingThread(true);
    fetchThread(id)
      .then((thread) => {
        setActiveThread(thread);
        // refresh unread after marking read
        refresh();
      })
      .catch((err: any) => setError(err?.message || 'Error al abrir la conversación'))
      .finally(() => setLoadingThread(false));
  }, [refresh]);

  const closeConversation = useCallback(() => {
    setActiveConversationId(null);
    setActiveThread(null);
  }, []);

  const startDirect = useCallback(async (recipientId: string): Promise<string | null> => {
    if (!orgId) return null;
    try {
      const res = await createDirectConversation(orgId, recipientId);
      await refresh();
      const convId = res.conversation?.id;
      if (convId) openConversation(convId);
      return convId;
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar la conversación');
      return null;
    }
  }, [orgId, refresh, openConversation]);

  const startGroup = useCallback(async (title: string, memberIds: string[]): Promise<string | null> => {
    if (!orgId) return null;
    try {
      const res = await createGroupConversation(orgId, title, memberIds);
      await refresh();
      const convId = res.conversation?.id;
      if (convId) openConversation(convId);
      return convId;
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear el grupo');
      return null;
    }
  }, [orgId, refresh, openConversation]);

  const sendFiles = useCallback(async (files: File[], text?: string): Promise<void> => {
    if (!orgId) return;
    const trimmed = (text ?? '').trim();
    if (files.length === 0 && !trimmed) return;
    setSending(true);
    try {
      let convId = activeConversationId;
      let res: { conversation_id: string };

      if (files.length > 0) {
        const params: { conversation_id?: string; recipient_id?: string; files: File[]; content?: string } = { files };
        if (convId) params.conversation_id = convId;
        if (trimmed) params.content = trimmed;
        res = await sendFilesMessage(orgId, params);
      } else {
        const payload: { conversation_id?: string; recipient_id?: string; content: string } = { content: trimmed };
        if (convId) payload.conversation_id = convId;
        res = await sendTextMessage(orgId, payload);
      }

      convId = res.conversation_id;

      if (convId && convId !== activeConversationId) {
        openConversation(convId);
      } else if (convId) {
        const thread = await fetchThread(convId);
        setActiveThread(thread);
      }
      refresh();
    } catch (err: any) {
      setError(err?.message || 'Error al enviar el mensaje');
    } finally {
      setSending(false);
    }
  }, [orgId, activeConversationId, openConversation, refresh]);

  const sendVoiceNote = useCallback(async (file: File): Promise<void> => {
    await sendFiles([file]);
  }, [sendFiles]);

  const toggleExpress = useCallback(async (): Promise<void> => {
    if (!orgId || !activeConversationId) return;
    try {
      await toggleExpressConversation(orgId, activeConversationId);
      const thread = await fetchThread(activeConversationId);
      setActiveThread(thread);
      refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar el modo de la conversación');
    }
  }, [orgId, activeConversationId, refresh]);

  const deleteMessage = useCallback(async (messageId: string): Promise<void> => {
    if (!orgId || !activeConversationId) return;
    try {
      await deleteMessageService(orgId, activeConversationId, messageId);
      const thread = await fetchThread(activeConversationId);
      setActiveThread(thread);
      refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar el mensaje');
    }
  }, [orgId, activeConversationId, refresh]);

  const deleteConversation = useCallback(async (conversationId: string): Promise<void> => {
    if (!orgId) return;
    try {
      await deleteConversationService(orgId, conversationId);
      if (activeConversationId === conversationId) {
        closeConversation();
      }
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la conversación');
    }
  }, [orgId, activeConversationId, closeConversation, refresh]);

  const clearError = useCallback(() => setError(null), []);

  const requestNotificationPermission = useCallback(async (): Promise<string> => {
    try {
      if (typeof Notification === 'undefined') return 'unsupported';
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      const res = await Notification.requestPermission();
      return res;
    } catch {
      return 'error';
    }
  }, []);

  return {
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
    sendFiles,
    sendVoiceNote,
    toggleExpress,
    deleteMessage,
    deleteConversation,
    refresh,
    clearError,
    requestNotificationPermission,
    onlineUserIds,
  };
}