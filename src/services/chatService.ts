import { supabase } from '../lib/supabase';
import type { ChatSession, ChatMessage, ChatAuditLog, AskChatResponse, AskChatPayload } from '../types/chat';

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

// ─── Sessions ────────────────────────────────────────────────

export async function fetchSessions(orgId: string, userId: string): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export async function createSession(orgId: string, userId: string, title?: string): Promise<ChatSession> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      org_id: orgId,
      user_id: userId,
      title: title || null,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function archiveSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw error;
}

// ─── Messages ────────────────────────────────────────────────

export async function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ─── Ask (Edge Function) ─────────────────────────────────────

export async function askChat(payload: AskChatPayload): Promise<AskChatResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) throw new Error('No hay sesión activa');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/ask-sro-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Error al consultar el asistente');
  }

  return response.json();
}

// ─── Process document (Edge Function) ─────────────────────────

export async function processDocument(documentId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) throw new Error('No hay sesión activa');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-knowledge-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ document_id: documentId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Error al procesar el documento');
  }
}

export async function reindexDocument(documentId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) throw new Error('No hay sesión activa');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/reindex-knowledge-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ document_id: documentId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Error al re-indexar el documento');
  }
}

// ─── Audit ───────────────────────────────────────────────────

export async function fetchAuditLogs(
  orgId: string,
  options?: { userId?: string; limit?: number; offset?: number }
): Promise<ChatAuditLog[]> {
  let query = supabase
    .from('chat_audit_logs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (options?.userId) {
    query = query.eq('user_id', options.userId);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, (options.offset) + (options.limit ?? 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
