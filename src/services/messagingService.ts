import { supabase } from '@/lib/supabase';
import type {
  MessagingBootstrap,
  MessagingThread,
  MessagingMessage,
  MessagingAdminData,
} from '@/types/messaging';

/**
 * Extrae un mensaje de error legible desde la respuesta de una edge function,
 * sin importar cómo el SDK envuelva el cuerpo (objeto, string JSON, o texto).
 */
async function extractErrorMessage(error: unknown): Promise<string> {
  const e = error as any;
  if (!e) return 'Error de servidor';

  // FunctionsHttpError expone el body como un objeto Response en `context`.
  // Hay que detectarlo ANTES que el objeto plano, porque un Response también es un object.
  if (e.context && typeof e.context.json === 'function') {
    try {
      const parsed = await e.context.json();
      const msg = parsed?.message || parsed?.error || parsed?.detail;
      if (msg) return typeof msg === 'string' ? msg : JSON.stringify(msg);
    } catch {
      // fall through
    }
  }

  if (e.context && typeof e.context === 'object' && !Array.isArray(e.context)) {
    const c = e.context;
    return c?.message || c?.error || c?.detail || e.message || 'Error de servidor';
  }

  if (typeof e.context === 'string') {
    try {
      const parsed = JSON.parse(e.context);
      return parsed?.message || parsed?.error || parsed?.detail || e.context;
    } catch {
      return e.context;
    }
  }

  if (e.message && !e.message.includes('non-2xx')) return e.message;
  return 'Error de servidor';
}

async function invoke<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as any });
  if (error) {
    throw new Error(await extractErrorMessage(error));
  }
  return data as T;
}

export async function bootstrapMessaging(orgId: string): Promise<MessagingBootstrap> {
  return invoke<MessagingBootstrap>('msg-bootstrap', { org_id: orgId });
}

export async function fetchThread(conversationId: string): Promise<MessagingThread> {
  return invoke<MessagingThread>('msg-messages', { conversation_id: conversationId });
}

export async function sendTextMessage(
  orgId: string,
  params: { conversation_id?: string; recipient_id?: string; content: string; reply_to_message_id?: string | null }
): Promise<{ message: MessagingMessage; conversation_id: string }> {
  return invoke('msg-send', {
    org_id: orgId,
    conversation_id: params.conversation_id,
    recipient_id: params.recipient_id,
    content: params.content,
    reply_to_message_id: params.reply_to_message_id || null,
  });
}

export async function sendFilesMessage(
  orgId: string,
  params: { conversation_id?: string; recipient_id?: string; files: File[]; content?: string; reply_to_message_id?: string | null }
): Promise<{ message: MessagingMessage; conversation_id: string }> {
  const form = new FormData();
  form.append('org_id', orgId);
  if (params.conversation_id) form.append('conversation_id', params.conversation_id);
  if (params.recipient_id) form.append('recipient_id', params.recipient_id);
  if (params.content) form.append('content', params.content);
  if (params.reply_to_message_id) form.append('reply_to_message_id', params.reply_to_message_id);
  for (const file of params.files) {
    form.append('files', file);
  }

  const { data, error } = await supabase.functions.invoke('msg-send', { body: form });
  if (error) {
    throw new Error(await extractErrorMessage(error));
  }
  return data as { message: MessagingMessage; conversation_id: string };
}

export async function createDirectConversation(
  orgId: string,
  recipientId: string
): Promise<{ conversation: any }> {
  return invoke('msg-conversation', { action: 'create_direct', org_id: orgId, recipient_id: recipientId });
}

export async function createGroupConversation(
  orgId: string,
  title: string,
  memberIds: string[]
): Promise<{ conversation: any }> {
  return invoke('msg-conversation', { action: 'create_group', org_id: orgId, title, member_ids: memberIds });
}

export async function addGroupMembers(
  orgId: string,
  conversationId: string,
  memberIds: string[]
): Promise<{ ok: boolean }> {
  return invoke('msg-conversation', { action: 'add_members', org_id: orgId, conversation_id: conversationId, member_ids: memberIds });
}

export async function renameGroup(
  orgId: string,
  conversationId: string,
  title: string
): Promise<{ ok: boolean }> {
  return invoke('msg-conversation', { action: 'rename', org_id: orgId, conversation_id: conversationId, title });
}

export async function toggleExpressConversation(
  orgId: string,
  conversationId: string
): Promise<{ ok: boolean; is_express: boolean }> {
  return invoke('msg-conversation', { action: 'toggle_express', org_id: orgId, conversation_id: conversationId });
}

export async function deleteMessage(
  orgId: string,
  conversationId: string,
  messageId: string
): Promise<{ ok: boolean }> {
  return invoke('msg-delete-message', { org_id: orgId, conversation_id: conversationId, message_id: messageId });
}

export async function deleteConversation(
  orgId: string,
  conversationId: string
): Promise<{ ok: boolean }> {
  return invoke('msg-conversation', { action: 'delete_conversation', org_id: orgId, conversation_id: conversationId });
}

export async function leaveConversation(
  orgId: string,
  conversationId: string
): Promise<{ ok: boolean }> {
  return invoke('msg-conversation', { action: 'leave', org_id: orgId, conversation_id: conversationId });
}

export async function getFileUrl(attachmentId: string): Promise<{ url: string; file_path: string }> {
  return invoke('msg-file-url', { attachment_id: attachmentId });
}

export async function fetchAdminData(orgId: string): Promise<MessagingAdminData> {
  return invoke<MessagingAdminData>('msg-admin', { org_id: orgId });
}