import { supabase } from '../lib/supabase';
import type {
  KnowledgeDocument,
  KnowledgeDocumentWithRelations,
  UpdateDocumentPayload,
} from '../types/knowledge';

export const KNOWLEDGE_BUCKET = 'knowledge-documents';

// ─── Documents ───────────────────────────────────────────────

export async function fetchDocuments(orgId: string): Promise<KnowledgeDocumentWithRelations[]> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(`
      *,
      knowledge_document_tags(tag),
      knowledge_document_roles(role_id),
      knowledge_document_permissions(permission_key)
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((doc) => ({
    ...doc,
    tags: (doc.knowledge_document_tags ?? []).map((t: { tag: string }) => t.tag),
    role_ids: (doc.knowledge_document_roles ?? []).map((r: { role_id: string }) => r.role_id),
    permission_keys: (doc.knowledge_document_permissions ?? []).map(
      (p: { permission_key: string }) => p.permission_key
    ),
  }));
}

export async function fetchDocumentById(id: string): Promise<KnowledgeDocumentWithRelations | null> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(`
      *,
      knowledge_document_tags(tag),
      knowledge_document_roles(role_id),
      knowledge_document_permissions(permission_key)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    tags: (data.knowledge_document_tags ?? []).map((t: { tag: string }) => t.tag),
    role_ids: (data.knowledge_document_roles ?? []).map((r: { role_id: string }) => r.role_id),
    permission_keys: (data.knowledge_document_permissions ?? []).map(
      (p: { permission_key: string }) => p.permission_key
    ),
  };
}

export async function uploadDocumentFile(
  orgId: string,
  file: File
): Promise<{ filePath: string; publicUrl: string }> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${orgId}/${timestamp}_${safeName}`;

  const { error } = await supabase.storage
    .from(KNOWLEDGE_BUCKET)
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from(KNOWLEDGE_BUCKET).getPublicUrl(filePath);

  return { filePath, publicUrl: urlData.publicUrl };
}

export async function createDocumentRecord(
  orgId: string,
  uploadedBy: string,
  filePath: string,
  fileName: string,
  fileSize: number,
  payload: {
    title: string;
    description?: string;
    access_level: string;
    visibility_mode: string;
    tags?: string[];
    role_ids?: string[];
    permission_keys?: string[];
  }
): Promise<KnowledgeDocument> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .insert({
      org_id: orgId,
      uploaded_by: uploadedBy,
      title: payload.title,
      description: payload.description || null,
      file_name: fileName,
      file_path: filePath,
      file_size: fileSize,
      access_level: payload.access_level,
      visibility_mode: payload.visibility_mode,
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw error;

  const docId = data.id;

  // Insert tags
  if (payload.tags && payload.tags.length > 0) {
    await supabase.from('knowledge_document_tags').insert(
      payload.tags.map((tag) => ({ document_id: docId, tag }))
    );
  }

  // Insert roles
  if (payload.role_ids && payload.role_ids.length > 0) {
    await supabase.from('knowledge_document_roles').insert(
      payload.role_ids.map((role_id) => ({ document_id: docId, role_id }))
    );
  }

  // Insert permissions
  if (payload.permission_keys && payload.permission_keys.length > 0) {
    await supabase.from('knowledge_document_permissions').insert(
      payload.permission_keys.map((permission_key) => ({ document_id: docId, permission_key }))
    );
  }

  return data;
}

export async function updateDocument(
  id: string,
  payload: UpdateDocumentPayload
): Promise<void> {
  const { error } = await supabase
    .from('knowledge_documents')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function updateDocumentRelations(
  docId: string,
  tags: string[],
  roleIds: string[],
  permissionKeys: string[]
): Promise<void> {
  // Replace tags
  await supabase.from('knowledge_document_tags').delete().eq('document_id', docId);
  if (tags.length > 0) {
    await supabase
      .from('knowledge_document_tags')
      .insert(tags.map((tag) => ({ document_id: docId, tag })));
  }

  // Replace roles
  await supabase.from('knowledge_document_roles').delete().eq('document_id', docId);
  if (roleIds.length > 0) {
    await supabase
      .from('knowledge_document_roles')
      .insert(roleIds.map((role_id) => ({ document_id: docId, role_id })));
  }

  // Replace permissions
  await supabase.from('knowledge_document_permissions').delete().eq('document_id', docId);
  if (permissionKeys.length > 0) {
    await supabase
      .from('knowledge_document_permissions')
      .insert(permissionKeys.map((permission_key) => ({ document_id: docId, permission_key })));
  }
}

export async function archiveDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from('knowledge_documents')
    .update({ status: 'archived', is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function getDocumentDownloadUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(KNOWLEDGE_BUCKET)
    .createSignedUrl(filePath, 300);

  if (error) throw error;
  return data.signedUrl;
}

// ─── Roles available ─────────────────────────────────────────

export async function fetchRoles(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('roles')
    .select('id, name')
    .order('name');

  if (error) throw error;
  return data ?? [];
}
