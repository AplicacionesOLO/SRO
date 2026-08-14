import { useEffect, useState } from 'react';
import { getFileUrl } from '@/services/messagingService';

// Caché en memoria de URLs firmadas por attachment_id para no refetchear en cada render.
const cache = new Map<string, string>();

export function useSignedUrl(attachmentId: string): string | null {
  const [url, setUrl] = useState<string | null>(() => cache.get(attachmentId) ?? null);

  useEffect(() => {
    if (cache.has(attachmentId)) {
      setUrl(cache.get(attachmentId) ?? null);
      return;
    }
    let active = true;
    getFileUrl(attachmentId)
      .then((res) => {
        cache.set(attachmentId, res.url);
        if (active) setUrl(res.url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [attachmentId]);

  return url;
}