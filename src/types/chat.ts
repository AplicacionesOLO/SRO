export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type ChatSessionStatus = 'active' | 'archived';
export type ChatAuditStatus = 'success' | 'denied' | 'error';

export interface ChatCitation {
  document_id: string;
  document_title: string;
  file_name: string;
  excerpt?: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  org_id: string;
  user_id: string | null;
  role: ChatMessageRole;
  content: string;
  citations: ChatCitation[];
  used_document_ids: string[];
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  /** In-memory only: suggested follow-up questions returned by the last AI response */
  suggested_questions?: string[];
}

export interface ChatSession {
  id: string;
  org_id: string;
  user_id: string;
  title: string | null;
  status: ChatSessionStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  message_count?: number;
}

export interface ChatAuditLog {
  id: string;
  org_id: string;
  user_id: string;
  session_id: string | null;
  question: string;
  answer: string | null;
  allowed_document_ids: string[];
  used_document_ids: string[];
  denied_documents: string[];
  access_snapshot: Record<string, unknown>;
  status: ChatAuditStatus;
  error_message: string | null;
  created_at: string;
}

export interface ChatPromptConfig {
  id: string;
  org_id: string;
  code: string;
  name: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AskChatPayload {
  question: string;
  session_id?: string;
}

export interface AskChatResponse {
  answer: string;
  session_id: string;
  message_id: string;
  citations: ChatCitation[];
  used_document_ids: string[];
  suggested_questions?: string[];
  access_level_used: string;
  status: ChatAuditStatus;
}

export interface AuditLogWithUser extends ChatAuditLog {
  user_name?: string;
  user_email?: string;
}
