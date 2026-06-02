import { lazy, ComponentType } from 'react';

/**
 * Wrapper around React.lazy() that handles "Failed to fetch dynamically imported module" errors.
 * This typically happens when a new deployment is made and the old chunk no longer exists.
 * In that case, we automatically reload the page to fetch the new chunks.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(() => {
    return factory().catch((error: Error) => {
      const errorMessage = error?.message || '';
      const isChunkError =
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('error loading dynamically imported module') ||
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('Loading CSS chunk');

      if (isChunkError) {
        // Avoid infinite reload loops: only reload once
        const alreadyReloaded = sessionStorage.getItem('chunk_reload_attempt');
        if (!alreadyReloaded) {
          sessionStorage.setItem('chunk_reload_attempt', '1');
          window.location.reload();
        } else {
          // If already reloaded once and still failing, clear the flag so
          // next attempt can try again, but throw the error so it propagates
          sessionStorage.removeItem('chunk_reload_attempt');
        }
      }

      throw error;
    });
  });
}