import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePermissions } from './usePermissions';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Roles que tienen acceso global sin restricción de warehouse.
 * Solo estos roles pueden ver datos de toda la organización
 * CUANDO no tienen asignaciones en user_warehouse_access con restricted=true.
 */
const GLOBAL_ACCESS_ROLES = ['ADMIN', 'SUPERVISOR', 'Full Access'] as const;

/**
 * REGLA DE INTERSECCIÓN:
 * El scope final de warehouses = user_warehouse_access ∩ warehouses_de_países_permitidos
 * Si el usuario tiene user_country_access, solo puede ver warehouses de esos países.
 * Si un warehouse está en user_warehouse_access pero su país no está en user_country_access,
 * ese warehouse queda EXCLUIDO del scope final.
 */

export interface UserScopeClient {
  id: string;
  name: string;
}

export interface UserScope {
  /** null = sin restricción (super admin / global) — ve todos los warehouses */
  allowedWarehouseIds: string[] | null;
  /** null = sin restricción — ve todos los clientes */
  allowedClientIds: string[] | null;
  /** Lista de clientes disponibles para el usuario (dentro de sus warehouses) */
  availableClients: UserScopeClient[];
  /** Lista de warehouses disponibles para el usuario */
  availableWarehouses: { id: string; name: string; timezone: string; location: string | null }[];
  /** true si el usuario puede ver todo (no tiene restricciones de warehouse) */
  isGlobalAccess: boolean;
  /** true mientras se está cargando el scope */
  loading: boolean;
  /** Recargar el scope manualmente */
  reload: () => void;
}

// ── Cache global para useUserScope — compartida entre todas las instancias ──
interface ScopeCacheEntry {
  allowedWarehouseIds: string[] | null;
  allowedClientIds: string[] | null;
  availableClients: UserScopeClient[];
  availableWarehouses: { id: string; name: string; timezone: string; location: string | null }[];
  isGlobalAccess: boolean;
  timestamp: number;
  pendingPromise?: Promise<void>;
}

const scopeCache = new Map<string, ScopeCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getScopeCacheKey(userId: string, orgId: string): string {
  return `${userId}:${orgId}`;
}

// ── Pub/Sub global para invalidación de caché ──────────────────────────────
type ReloadListener = () => void;
const reloadListeners = new Set<ReloadListener>();

/**
 * Invalida el caché de scope de TODOS los usuarios/orgs y notifica a todas
 * las instancias activas de useUserScope para que recarguen inmediatamente.
 * Llamar después de crear/actualizar/eliminar warehouses.
 */
export function invalidateScopeAndReload(): void {
  scopeCache.clear();
  reloadListeners.forEach((fn) => fn());
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Hook centralizado de segregación de datos.
 *
 * FUENTE DE VERDAD: tabla user_warehouse_access
 * - restricted = true  → usuario restringido a ese warehouse
 * - restricted = false → usuario sin restricción (acceso global)
 * - sin filas          → si rol es global (ADMIN/SUPERVISOR) → acceso total
 *                        si rol es operativo → 0 resultados
 *
 * Uso:
 *   const { allowedWarehouseIds, allowedClientIds, isGlobalAccess } = useUserScope();
 */
export function useUserScope(): UserScope {
  const { orgId, userId } = usePermissions();
  const { user } = useAuth();

  const [allowedWarehouseIds, setAllowedWarehouseIds] = useState<string[] | null>(null);
  const [allowedClientIds, setAllowedClientIds] = useState<string[] | null>(null);
  const [availableClients, setAvailableClients] = useState<UserScopeClient[]>([]);
  const [availableWarehouses, setAvailableWarehouses] = useState<
    { id: string; name: string; timezone: string; location: string | null }[]
  >([]);
  const [isGlobalAccess, setIsGlobalAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => {
    if (userId && orgId) {
      const cacheKey = getScopeCacheKey(userId, orgId);
      scopeCache.delete(cacheKey);
    }
    setReloadTick((t) => t + 1);
  }, [userId, orgId]);

  // Suscribirse al sistema global de invalidación de caché
  useEffect(() => {
    const listener: ReloadListener = () => setReloadTick((t) => t + 1);
    reloadListeners.add(listener);
    return () => {
      reloadListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cacheKey = getScopeCacheKey(userId, orgId);

    const load = async () => {
      // ── 1. Verificar caché válida ─────────────────────────────────
      const cached = scopeCache.get(cacheKey);
      const now = Date.now();
      if (cached && !cached.pendingPromise && (now - cached.timestamp) < CACHE_TTL_MS) {
        if (!cancelled) {
          setAllowedWarehouseIds(cached.allowedWarehouseIds);
          setAllowedClientIds(cached.allowedClientIds);
          setAvailableClients(cached.availableClients);
          setAvailableWarehouses(cached.availableWarehouses);
          setIsGlobalAccess(cached.isGlobalAccess);
          setLoading(false);
        }
        return;
      }

      // ── 2. Si hay pendingPromise, esperarla ───────────────────────
      if (cached?.pendingPromise) {
        await cached.pendingPromise;
        const afterPending = scopeCache.get(cacheKey);
        if (afterPending && !afterPending.pendingPromise && (Date.now() - afterPending.timestamp) < CACHE_TTL_MS) {
          if (!cancelled) {
            setAllowedWarehouseIds(afterPending.allowedWarehouseIds);
            setAllowedClientIds(afterPending.allowedClientIds);
            setAvailableClients(afterPending.availableClients);
            setAvailableWarehouses(afterPending.availableWarehouses);
            setIsGlobalAccess(afterPending.isGlobalAccess);
            setLoading(false);
          }
          return;
        }
      }
      let resolvePending: (() => void) | undefined;
      const pendingPromise = new Promise<void>((resolve) => {
        resolvePending = resolve;
      });
      scopeCache.set(cacheKey, {
        ...(cached || {
          allowedWarehouseIds: null,
          allowedClientIds: null,
          availableClients: [],
          availableWarehouses: [],
          isGlobalAccess: false,
          timestamp: 0,
        }),
        pendingPromise,
      });

      setLoading(true);

      // Variables temporales para acumular resultado
      let resultAllowedWarehouseIds: string[] | null = null;
      let resultAllowedClientIds: string[] | null = null;
      let resultAvailableClients: UserScopeClient[] = [];
      let resultAvailableWarehouses: { id: string; name: string; timezone: string; location: string | null }[] = [];
      let resultIsGlobalAccess = false;

      try {
        const userRole = user?.role || 'OPERADOR';
        const roleAllowsGlobal = (GLOBAL_ACCESS_ROLES as readonly string[]).includes(userRole);

        // ── Query 1: user_country_access ─────────
        const { data: ucaRows, error: ucaErr } = await supabase
          .from('user_country_access')
          .select('country_id')
          .eq('org_id', orgId)
          .eq('user_id', userId);
        if (ucaErr) throw ucaErr;

        const allowedCountryIds: string[] | null =
          (ucaRows ?? []).length > 0
            ? (ucaRows ?? []).map((r: any) => r.country_id as string)
            : null;

        // ── Query 2: user_warehouse_access ─────────
        const { data: uwaRows, error: uwaErr } = await supabase
          .from('user_warehouse_access')
          .select('warehouse_id, restricted')
          .eq('org_id', orgId)
          .eq('user_id', userId);
        if (uwaErr) throw uwaErr;

        const hasUnrestrictedRow = (uwaRows ?? []).some((r: any) => r.restricted === false);
        const restrictedRows = (uwaRows ?? []).filter((r: any) => r.restricted === true);
        const hasRestrictedAssignments = restrictedRows.length > 0;

        let rawWarehouseIds: string[] | null;

        if (hasUnrestrictedRow) {
          rawWarehouseIds = null;
        } else if (hasRestrictedAssignments) {
          rawWarehouseIds = restrictedRows.map((r: any) => r.warehouse_id as string);
        } else {
          if (roleAllowsGlobal) {
            rawWarehouseIds = null;
          } else {
            rawWarehouseIds = [];
          }
        }

        // ── 3. INTERSECCIÓN por país ─────────
        let warehouseIds: string[] | null = rawWarehouseIds;
        if (allowedCountryIds !== null) {
          let candidateQuery = supabase
            .from('warehouses')
            .select('id, country_id')
            .eq('org_id', orgId)
            .in('country_id', allowedCountryIds);

          if (rawWarehouseIds !== null && rawWarehouseIds.length > 0) {
            candidateQuery = candidateQuery.in('id', rawWarehouseIds);
          } else if (rawWarehouseIds !== null && rawWarehouseIds.length === 0) {
            resultAllowedWarehouseIds = [];
            resultAllowedClientIds = [];
            resultAvailableClients = [];
            resultAvailableWarehouses = [];
            resultIsGlobalAccess = false;
            return; // early return: finally block still runs
          }

          const { data: candidateWh } = await candidateQuery;
          if (cancelled) return;

          const intersectedIds = (candidateWh ?? []).map((w: any) => w.id as string);
          warehouseIds = intersectedIds;
        }

        const globalAccess = warehouseIds === null;

        // ── 4. Cargar warehouses ─────────
        if (!globalAccess && warehouseIds !== null && warehouseIds.length === 0) {
          resultAllowedWarehouseIds = [];
          resultAllowedClientIds = [];
          resultAvailableClients = [];
          resultAvailableWarehouses = [];
          resultIsGlobalAccess = false;
          return; // early return: finally block still runs
        }

        let whQuery = supabase
          .from('warehouses')
          .select('id, name, timezone, location')
          .eq('org_id', orgId)
          .order('name', { ascending: true });

        if (!globalAccess && warehouseIds && warehouseIds.length > 0) {
          whQuery = whQuery.in('id', warehouseIds);
        }

        const { data: whData } = await whQuery;
        if (cancelled) return;

        const warehouses = (whData ?? []).map((w: any) => ({
          id: w.id,
          name: w.name,
          timezone: w.timezone || 'America/Costa_Rica',
          location: w.location ?? null,
        }));

        // ── 5. Clientes por warehouse ─────────
        let clientQuery = supabase
          .from('warehouse_clients')
          .select('client_id, clients!warehouse_clients_client_id_fkey(id, name)')
          .eq('org_id', orgId);

        if (!globalAccess && warehouseIds && warehouseIds.length > 0) {
          clientQuery = clientQuery.in('warehouse_id', warehouseIds);
        }

        const { data: wcRows } = await clientQuery;
        if (cancelled) return;

        const seenClients = new Set<string>();
        const warehouseClientIds: string[] = [];

        for (const row of (wcRows ?? []) as any[]) {
          const c = (row as any).clients;
          if (c && !seenClients.has(c.id)) {
            seenClients.add(c.id);
            warehouseClientIds.push(c.id);
          }
        }

        // ── 6. user_clients restriction ─────────
        const { data: ucRows } = await supabase
          .from('user_clients')
          .select('client_id')
          .eq('org_id', orgId)
          .eq('user_id', userId);
        if (cancelled) return;

        const explicitClientIds = (ucRows ?? []).map((r: any) => r.client_id as string);
        const hasClientRestriction = explicitClientIds.length > 0;

        const finalClientIds = hasClientRestriction
          ? warehouseClientIds.filter((id) => explicitClientIds.includes(id))
          : warehouseClientIds;

        // ── 7. Cargar nombres de clientes ─────────
        const clients: UserScopeClient[] = [];
        const clientIds: string[] = [];

        if (finalClientIds.length > 0) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('id, name')
            .eq('org_id', orgId)
            .in('id', finalClientIds)
            .eq('is_active', true);

          if (!cancelled) {
            for (const c of (clientData ?? []) as any[]) {
              clients.push({ id: c.id, name: c.name });
              clientIds.push(c.id);
            }
          }
        }

        clients.sort((a, b) => a.name.localeCompare(b.name));

        // ── Asignar resultados temporales ─────────
        resultAllowedWarehouseIds = warehouseIds;
        resultAllowedClientIds = clientIds.length > 0 ? clientIds : null;
        resultAvailableClients = clients;
        resultAvailableWarehouses = warehouses;
        resultIsGlobalAccess = globalAccess;
      } catch (err) {
        // silenciar
        resultAllowedWarehouseIds = [];
        resultAllowedClientIds = [];
        resultAvailableClients = [];
        resultAvailableWarehouses = [];
        resultIsGlobalAccess = false;
      } finally {
        // Guardar en caché (incluso si cancelled, para que otros esperando no queden colgados)
        const cacheData: ScopeCacheEntry = {
          allowedWarehouseIds: resultAllowedWarehouseIds,
          allowedClientIds: resultAllowedClientIds,
          availableClients: resultAvailableClients,
          availableWarehouses: resultAvailableWarehouses,
          isGlobalAccess: resultIsGlobalAccess,
          timestamp: Date.now(),
        };
        scopeCache.set(cacheKey, cacheData);

        // Setear estados solo si no fue cancelado
        if (!cancelled) {
          setAllowedWarehouseIds(resultAllowedWarehouseIds);
          setAllowedClientIds(resultAllowedClientIds);
          setAvailableClients(resultAvailableClients);
          setAvailableWarehouses(resultAvailableWarehouses);
          setIsGlobalAccess(resultIsGlobalAccess);
        }

        resolvePending?.();
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, user?.role, reloadTick]);

  return {
    allowedWarehouseIds,
    allowedClientIds,
    availableClients,
    availableWarehouses,
    isGlobalAccess,
    loading,
    reload,
  };
}