export type DocumentStatus = 'draft' | 'processing' | 'active' | 'failed' | 'archived';
export type DocumentAccessLevel = 'basic' | 'extended' | 'internal';
export type DocumentVisibilityMode = 'public' | 'role_based' | 'permission_based' | 'mixed';

export interface KnowledgeDocument {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  storage_bucket: string;
  mime_type: string;
  file_size: number | null;
  version_label: string | null;
  status: DocumentStatus;
  visibility_mode: DocumentVisibilityMode;
  access_level: DocumentAccessLevel;
  is_active: boolean;
  openai_file_id: string | null;
  openai_vector_store_id: string | null;
  openai_vector_store_file_id: string | null;
  uploaded_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  search_text_preview: string | null;
}

export interface KnowledgeDocumentWithRelations extends KnowledgeDocument {
  tags: string[];
  role_ids: string[];
  permission_keys: string[];
  uploader_name?: string | null;
}

export interface KnowledgeDocumentTag {
  id: string;
  document_id: string;
  tag: string;
  created_at: string;
}

export interface KnowledgeDocumentRole {
  id: string;
  document_id: string;
  role_id: string;
  created_at: string;
}

export interface KnowledgeDocumentPermission {
  id: string;
  document_id: string;
  permission_key: string;
  created_at: string;
}

export interface KnowledgeDocumentVersion {
  id: string;
  document_id: string;
  version_label: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  openai_file_id: string | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface CreateDocumentPayload {
  title: string;
  description?: string;
  file: File;
  access_level: DocumentAccessLevel;
  visibility_mode: DocumentVisibilityMode;
  tag_ids?: string[];
  role_ids?: string[];
  permission_keys?: string[];
}

export interface UpdateDocumentPayload {
  title?: string;
  description?: string;
  access_level?: DocumentAccessLevel;
  visibility_mode?: DocumentVisibilityMode;
  is_active?: boolean;
  status?: DocumentStatus;
}
