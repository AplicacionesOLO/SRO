import { useState, useEffect, useCallback } from 'react';
import { usePermissions } from './usePermissions';
import {
  fetchDocuments,
  createDocumentRecord,
  uploadDocumentFile,
  updateDocument,
  updateDocumentRelations,
  archiveDocument,
} from '../services/knowledgeService';
import { processDocument, reindexDocument } from '../services/chatService';
import type { KnowledgeDocumentWithRelations, UpdateDocumentPayload } from '../types/knowledge';

interface UseKnowledgeDocumentsReturn {
  documents: KnowledgeDocumentWithRelations[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  uploadAndCreate: (
    file: File,
    payload: {
      title: string;
      description?: string;
      access_level: string;
      visibility_mode: string;
      tags?: string[];
      role_ids?: string[];
      permission_keys?: string[];
    }
  ) => Promise<string>;
  updateDoc: (id: string, payload: UpdateDocumentPayload) => Promise<void>;
  updateRelations: (id: string, tags: string[], roleIds: string[], permKeys: string[]) => Promise<void>;
  archive: (id: string) => Promise<void>;
  process: (id: string) => Promise<void>;
  reindex: (id: string) => Promise<void>;
}

export function useKnowledgeDocuments(): UseKnowledgeDocumentsReturn {
  const { orgId, userId } = usePermissions();
  const [documents, setDocuments] = useState<KnowledgeDocumentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const docs = await fetchDocuments(orgId);
      setDocuments(docs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadAndCreate = useCallback(
    async (
      file: File,
      payload: {
        title: string;
        description?: string;
        access_level: string;
        visibility_mode: string;
        tags?: string[];
        role_ids?: string[];
        permission_keys?: string[];
      }
    ): Promise<string> => {
      if (!orgId || !userId) throw new Error('Sin sesión activa');

      const { filePath } = await uploadDocumentFile(orgId, file);
      const doc = await createDocumentRecord(orgId, userId, filePath, file.name, file.size, payload);
      await load();
      return doc.id;
    },
    [orgId, userId, load]
  );

  const updateDoc = useCallback(async (id: string, payload: UpdateDocumentPayload) => {
    await updateDocument(id, payload);
    await load();
  }, [load]);

  const updateRelations = useCallback(
    async (id: string, tags: string[], roleIds: string[], permKeys: string[]) => {
      await updateDocumentRelations(id, tags, roleIds, permKeys);
      await load();
    },
    [load]
  );

  const archive = useCallback(async (id: string) => {
    await archiveDocument(id);
    await load();
  }, [load]);

  const process = useCallback(async (id: string) => {
    await processDocument(id);
    await load();
  }, [load]);

  const reindex = useCallback(async (id: string) => {
    await reindexDocument(id);
    await load();
  }, [load]);

  return {
    documents,
    loading,
    error,
    reload: load,
    uploadAndCreate,
    updateDoc,
    updateRelations,
    archive,
    process,
    reindex,
  };
}
