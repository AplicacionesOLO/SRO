import { useState, useEffect, useCallback, useRef } from 'react';
import { clientBlockedStatusesService } from '../services/clientBlockedStatusesService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { ClientBlockedStatusConfig } from '../types/client';

/**
 * Hook para verificar si una reserva está bloqueada según las reglas del CLIENTE.
 *
 * Evalúa la regla compuesta:
 *   - blocked_status_ids: estados que bloquean
 *   - bypass_role_ids:    roles que pueden saltarse el bloqueo
 *   - bypass_user_ids:    usuarios específicos que pueden saltarse el bloqueo
 *
 * Prioridad:
 *   1. ADMIN / Full Access → siempre pasan
 *   2. user.id ∈ bypass_user_ids
 *   3. user.role_id ∈ bypass_role_ids
 */
export function useBlockedStatuses(orgId: string | null) {
  const { canLocal, user } = useAuth();

  const isPrivileged =
    canLocal('admin.users.create') || canLocal('admin.matrix.update');

  // Caché de configuración completa por clientId
  const configCacheRef = useRef<Map<string, ClientBlockedStatusConfig>>(new Map());

  // role_id del usuario actual (cargado una vez)
  const userRoleIdRef = useRef<string | null>(null);
  const roleIdLoadedRef = useRef(false);

  // Cargar role_id del usuario una sola vez
  useEffect(() => {
    if (!user?.id || !orgId || roleIdLoadedRef.current) return;
    roleIdLoadedRef.current = true;

    supabase
      .from('user_org_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        userRoleIdRef.current = data?.role_id ?? null;
      });
  }, [user?.id, orgId]);

  const getConfigForClient = useCallback(
    async (clientId: string): Promise<ClientBlockedStatusConfig> => {
      if (!orgId) return { blocked_status_ids: [], bypass_role_ids: [], bypass_user_ids: [] };
      if (configCacheRef.current.has(clientId)) {
        return configCacheRef.current.get(clientId)!;
      }
      try {
        const config = await clientBlockedStatusesService.getConfig(orgId, clientId);
        configCacheRef.current.set(clientId, config);
        return config;
      } catch {
        return { blocked_status_ids: [], bypass_role_ids: [], bypass_user_ids: [] };
      }
    },
    [orgId]
  );

  // Mantener compatibilidad con código existente
  const getBlockedIdsForClient = useCallback(
    async (clientId: string): Promise<string[]> => {
      const config = await getConfigForClient(clientId);
      return config.blocked_status_ids;
    },
    [getConfigForClient]
  );

  /**
   * Verifica si una reserva está bloqueada para el usuario actual.
   * Evalúa la regla compuesta (blocked_status_ids + bypass_role_ids + bypass_user_ids).
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
        const resolvedClientId = clientId
          || await clientBlockedStatusesService.getClientIdForReservation(orgId, reservationId);

        if (!resolvedClientId) return false;

        return await clientBlockedStatusesService.isBlockedForUser(
          orgId,
          resolvedClientId,
          statusId,
          user?.id,
          userRoleIdRef.current,
          isPrivileged
        );
      } catch {
        return false;
      }
    },
    [isPrivileged, orgId, user?.id]
  );

  /**
   * Versión síncrona para drag/drop (requiere caché precargado).
   */
  const isReservationBlockedSync = useCallback(
    (clientId: string | null | undefined, statusId: string | null | undefined): boolean => {
      if (isPrivileged) return false;
      if (!statusId || !clientId) return false;

      const config = configCacheRef.current.get(clientId);
      return clientBlockedStatusesService.isBlockedForUserSync(
        config,
        statusId,
        user?.id,
        userRoleIdRef.current,
        isPrivileged
      );
    },
    [isPrivileged, user?.id]
  );

  const preloadClient = useCallback(
    async (clientId: string): Promise<void> => {
      await getConfigForClient(clientId);
    },
    [getConfigForClient]
  );

  const invalidateClient = useCallback((clientId: string) => {
    configCacheRef.current.delete(clientId);
  }, []);

  return {
    isReservationBlockedAsync,
    isReservationBlockedSync,
    preloadClient,
    invalidateClient,
    isPrivileged,
    getBlockedIdsForClient,
    // Compatibilidad legacy
    isReservationBlocked: (_statusId: string | null | undefined) => false,
  };
}

/**
 * Hook especializado para el ReservationModal.
 * Evalúa la regla compuesta con bypass por rol y usuario.
 */
export function useReservationBlockedStatus(
  orgId: string | null,
  reservationId: string | null | undefined,
  statusId: string | null | undefined,
  clientId?: string | null
) {
  const { canLocal, user } = useAuth();
  const isPrivileged = canLocal('admin.users.create') || canLocal('admin.matrix.update');

  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  // role_id del usuario actual
  const userRoleIdRef = useRef<string | null>(null);
  const roleIdLoadedRef = useRef(false);

  useEffect(() => {
    if (!user?.id || !orgId || roleIdLoadedRef.current) return;
    roleIdLoadedRef.current = true;

    supabase
      .from('user_org_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        userRoleIdRef.current = data?.role_id ?? null;
      });
  }, [user?.id, orgId]);

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
        const resolvedClientId = clientId
          || await clientBlockedStatusesService.getClientIdForReservation(orgId, reservationId);

        const blocked = await clientBlockedStatusesService.isBlockedForUser(
          orgId,
          resolvedClientId,
          statusId,
          user?.id,
          userRoleIdRef.current,
          isPrivileged
        );

        if (!cancelled) setIsBlocked(blocked);
      } catch {
        if (!cancelled) setIsBlocked(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    evaluate();

    return () => { cancelled = true; };
  }, [orgId, reservationId, statusId, clientId, isPrivileged, user?.id]);

  return { isBlocked, loading };
}
