import { useState, useEffect, useCallback, useRef } from 'react';
import { clientBlockedStatusesService } from '../services/clientBlockedStatusesService';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook para verificar si una reserva está bloqueada según las reglas del CLIENTE.
 *
 * IMPORTANTE: Usa client_id DIRECTO de la reserva (columna real en BD).
 * No infiere el cliente desde shipper_provider.
 */
export function useBlockedStatuses(orgId: string | null) {
  const { canLocal } = useAuth();

  const isPrivileged =
    canLocal('admin.users.create') || canLocal('admin.matrix.update');

  const cacheRef = useRef<Map<string, string[]>>(new Map());

  const getBlockedIdsForClient = useCallback(
    async (clientId: string): Promise<string[]> => {
      if (!orgId) return [];
      if (cacheRef.current.has(clientId)) {
        return cacheRef.current.get(clientId)!;
      }
      try {
        const ids = await clientBlockedStatusesService.getBlockedStatusIds(orgId, clientId);
        cacheRef.current.set(clientId, ids);
        return ids;
      } catch {
        return [];
      }
    },
    [orgId]
  );

  /**
   * Verifica si una reserva está bloqueada usando client_id directo.
   * Si no hay client_id, usa el servicio que hace fallback via shipper_provider.
   */
  const isReservationBlockedAsync = useCallback(
    async (
      reservationId: string,
      statusId: string | null | undefined,
      clientId?: string | null
    ): Promise<boolean> => {
      if (isPrivileged) return false;
      if (!statusId || !orgId) return false;

      try {
        // ✅ Si tenemos client_id directo, usarlo sin fetch extra
        if (clientId) {
          const blockedIds = await getBlockedIdsForClient(clientId);
          return blockedIds.includes(statusId);
        }
        // Fallback: el servicio busca client_id de la reserva
        return await clientBlockedStatusesService.isReservationBlocked(orgId, reservationId, statusId);
      } catch {
        return false;
      }
    },
    [isPrivileged, orgId, getBlockedIdsForClient]
  );

  /**
   * Versión síncrona para drag/drop (requiere caché precargado).
   */
  const isReservationBlockedSync = useCallback(
    (clientId: string | null | undefined, statusId: string | null | undefined): boolean => {
      if (isPrivileged) return false;
      if (!statusId || !clientId) return false;

      const cached = cacheRef.current.get(clientId);
      if (!cached) return false;
      return cached.includes(statusId);
    },
    [isPrivileged]
  );

  const preloadClient = useCallback(
    async (clientId: string): Promise<void> => {
      await getBlockedIdsForClient(clientId);
    },
    [getBlockedIdsForClient]
  );

  const invalidateClient = useCallback((clientId: string) => {
    cacheRef.current.delete(clientId);
  }, []);

  return {
    isReservationBlockedAsync,
    isReservationBlockedSync,
    preloadClient,
    invalidateClient,
    isPrivileged,
    isReservationBlocked: (_statusId: string | null | undefined) => false,
  };
}

/**
 * Hook especializado para el ReservationModal.
 * Usa client_id DIRECTO de la reserva para evaluar el bloqueo.
 */
export function useReservationBlockedStatus(
  orgId: string | null,
  reservationId: string | null | undefined,
  statusId: string | null | undefined,
  clientId?: string | null
) {
  const { canLocal } = useAuth();
  const isPrivileged = canLocal('admin.users.create') || canLocal('admin.matrix.update');

  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPrivileged) {
      setIsBlocked(false);
      return;
    }
    if (!orgId || !reservationId || !statusId) {
      setIsBlocked(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const evaluate = async () => {
      try {
        let blocked = false;

        // ✅ Si tenemos client_id directo, usarlo (más rápido, sin fetch extra)
        if (clientId) {
          blocked = await clientBlockedStatusesService.isBlockedByClientId(orgId, clientId, statusId);
        } else {
          // Fallback: el servicio busca client_id de la reserva
          blocked = await clientBlockedStatusesService.isReservationBlocked(orgId, reservationId, statusId);
        }

        if (!cancelled) setIsBlocked(blocked);
      } catch {
        if (!cancelled) setIsBlocked(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    evaluate();

    return () => { cancelled = true; };
  }, [orgId, reservationId, statusId, clientId, isPrivileged]);

  return { isBlocked, loading };
}
