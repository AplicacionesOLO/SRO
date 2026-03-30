import { useState, useEffect, useCallback } from 'react';
import { usePermissions } from './usePermissions';
import { fetchAuditLogs } from '../services/chatService';
import type { ChatAuditLog } from '../types/chat';

const PAGE_SIZE = 50;

interface UseChatAuditReturn {
  logs: ChatAuditLog[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

export function useChatAudit(filterUserId?: string): UseChatAuditReturn {
  const { orgId } = usePermissions();
  const [logs, setLogs] = useState<ChatAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(
    async (reset = false) => {
      if (!orgId) return;
      setLoading(true);
      setError(null);
      const currentOffset = reset ? 0 : offset;
      try {
        const data = await fetchAuditLogs(orgId, {
          userId: filterUserId,
          limit: PAGE_SIZE,
          offset: currentOffset,
        });
        if (reset) {
          setLogs(data);
        } else {
          setLogs((prev) => [...prev, ...data]);
        }
        setHasMore(data.length === PAGE_SIZE);
        setOffset(currentOffset + data.length);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [orgId, filterUserId, offset]
  );

  useEffect(() => {
    setOffset(0);
    setLogs([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, filterUserId]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) load();
  }, [loading, hasMore, load]);

  const reload = useCallback(() => {
    setOffset(0);
    setLogs([]);
    load(true);
  }, [load]);

  return { logs, loading, error, hasMore, loadMore, reload };
}
