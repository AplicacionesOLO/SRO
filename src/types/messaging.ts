export type ConversationType = 'direct' | 'group';
export type MessageType = 'text' | 'file' | 'system';

export interface MessagingContact {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  shared_warehouse_names: string[];
  is_global: boolean;
}

export interface MessagingMember {
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  member_role: string;
  last_read_at?: string | null;
}

export interface MessagingConversation {
  id: string;
  type: ConversationType;
  title: string | null;
  peer: { id: string; name: string; email: string | null; avatar_url: string | null } | null;
  is_express: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
  members: MessagingMember[];
}

export interface MessagingAttachment {
  id: string;
  message_id: string;
  org_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface MessagingMessage {
  id: string;
  conversation_id: string;
  org_id: string;
  sender_id: string;
  type: MessageType;
  content: string;
  deleted_at?: string | null;
  created_at: string;
  sender_name: string;
  sender_avatar_url: string | null;
  attachments: MessagingAttachment[];
}

export interface MessagingBootstrap {
  me: { id: string; name: string };
  contacts: MessagingContact[];
  conversations: MessagingConversation[];
  total_unread: number;
}

export interface MessagingThread {
  conversation: {
    id: string;
    org_id: string;
    type: ConversationType;
    title: string | null;
    created_by: string;
    is_express: boolean;
    last_message_at: string | null;
    last_message_preview: string | null;
    last_message_sender_id: string | null;
  } | null;
  members: MessagingMember[];
  messages: MessagingMessage[];
}

export interface MessagingAdminStats {
  total_conversations: number;
  total_messages: number;
  total_attachments: number;
  active_users: number;
}

export interface MessagingAdminConversation {
  id: string;
  org_id: string;
  type: ConversationType;
  title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  members: { user_id: string; name: string; email: string | null; member_role: string }[];
}

export interface MessagingAdminData {
  stats: MessagingAdminStats;
  conversations: MessagingAdminConversation[];
}