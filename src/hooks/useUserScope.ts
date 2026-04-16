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

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const userRole = user?.role || 'OPERADOR';
        const roleAllowsGlobal = (GLOBAL_ACCESS_ROLES as readonly string[]).includes(userRole);

        // ── 1. Consultar user_country_access (restricción por país) ─────────
        const { data: ucaRows, error: ucaErr } = await supabase
          .from('user_country_access')
          .select('country_id')
          .eq('org_id', orgId)
          .eq('user_id', userId);

        if (cancelled) return;
        if (ucaErr) throw ucaErr;

        const allowedCountryIds: string[] | null =
          (ucaRows ?? []).length > 0
            ? (ucaRows ?? []).map((r: any) => r.country_id as string)
            : null; // null = sin restricción de país

        // ── 2. Consultar user_warehouse_access (FUENTE REAL DE VERDAD) ──────
        const { data: uwaRows, error: uwaErr } = await supabase
          .from('user_warehouse_access')
          .select('warehouse_id, restricted')
          .eq('org_id', orgId)
          .eq('user_id', userId);

        if (cancelled) return;
        if (uwaErr) throw uwaErr;

        // ── 3. Determinar si el usuario tiene restricciones de warehouse ─────
        const hasUnrestrictedRow = (uwaRows ?? []).some((r: any) => r.restricted === false);
        const restrictedRows = (uwaRows ?? []).filter((r: any) => r.restricted === true);
        const hasRestrictedAssignments = restrictedRows.length > 0;



        let rawWarehouseIds: string[] | null;

        if (hasUnrestrictedRow) {
          // Tiene fila con restricted=false → acceso global explícito de warehouse
          rawWarehouseIds = null;
        } else if (hasRestrictedAssignments) {
          // Tiene filas con restricted=true → restringido a esos warehouses
          rawWarehouseIds = restrictedRows.map((r: any) => r.warehouse_id as string);
        } else {
          // Sin filas en user_warehouse_access
          if (roleAllowsGlobal) {
            rawWarehouseIds = null;
          } else {
            rawWarehouseIds = [];
          }
        }

        // ── 4. INTERSECCIÓN: filtrar warehouses por países permitidos ────────
        // Si el usuario tiene restricción de país, solo puede ver warehouses
        // cuyo country_id esté dentro de allowedCountryIds.
        // Esto evita que un warehouse de Costa Rica aparezca si el usuario
        // solo tiene Venezuela en user_country_access.
        let warehouseIds: string[] | null = rawWarehouseIds;

        if (allowedCountryIds !== null) {
          // El usuario tiene restricción de país — necesitamos filtrar
          // Cargar todos los warehouses candidatos para aplicar la intersección
          let candidateQuery = supabase
            .from('warehouses')
            .select('id, country_id')
            .eq('org_id', orgId)
            .in('country_id', allowedCountryIds);

          if (rawWarehouseIds !== null && rawWarehouseIds.length > 0) {
            // También restringido por warehouse: intersección de ambos
            candidateQuery = candidateQuery.in('id', rawWarehouseIds);
          } else if (rawWarehouseIds !== null && rawWarehouseIds.length === 0) {
            // Sin warehouses asignados → 0 resultados
            if (!cancelled) {
              setAllowedWarehouseIds([]);
              setAllowedClientIds([]);
              setAvailableClients([]);
              setAvailableWarehouses([]);
              setIsGlobalAccess(false);
              setLoading(false);
            }
            return;
          }
          // Si rawWarehouseIds === null (global warehouse), solo filtramos por país

          const { data: candidateWh } = await candidateQuery;
          if (cancelled) return;

          const intersectedIds = (candidateWh ?? []).map((w: any) => w.id as string);
          warehouseIds = intersectedIds;


        }

        const globalAccess = warehouseIds === null;

        // ── 5. Cargar info de warehouses disponibles ────────────────────────
        if (!globalAccess && warehouseIds !== null && warehouseIds.length === 0) {
          if (!cancelled) {
            setAllowedWarehouseIds([]);
            setAllowedClientIds([]);
            setAvailableClients([]);
            setAvailableWarehouses([]);
            setIsGlobalAccess(false);
            setLoading(false);
          }
          return;
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

        // ── 4. Obtener clientes disponibles (de los warehouses permitidos) ──
        let clientQuery = supabase
          .from('warehouse_clients')
          .select('client_id, clients!warehouse_clients_client_id_fkey(id, name)')
          .eq('org_id', orgId);

        if (!globalAccess && warehouseIds && warehouseIds.length > 0) {
          clientQuery = clientQuery.in('warehouse_id', warehouseIds);
        }

        const { data: wcRows } = await clientQuery;
        if (cancelled) return;

        // Clientes disponibles por almacén (universo base)
        const seenClients = new Set<string>();
        const warehouseClientIds: string[] = [];

        for (const row of (wcRows ?? []) as any[]) {
          const c = (row as any).clients;
          if (c && !seenClients.has(c.id)) {
            seenClients.add(c.id);
            warehouseClientIds.push(c.id);
          }
        }

        // ── Restricción de cliente: si el usuario tiene asignaciones en user_clients
        //    solo puede ver esos clientes (intersectados con los del almacén).
        //    Si no tiene ninguna, hereda todos los del almacén (compatibilidad).
        const { data: ucRows } = await supabase
          .from('user_clients')
          .select('client_id')
          .eq('org_id', orgId)
          .eq('user_id', userId);

        if (cancelled) return;

        const explicitClientIds = (ucRows ?? []).map((r: any) => r.client_id as string);
        const hasClientRestriction = explicitClientIds.length > 0;

        // Si hay restricción explícita → intersección; si no → todos los del almacén
        const finalClientIds = hasClientRestriction
          ? warehouseClientIds.filter((id) => explicitClientIds.includes(id))
          : warehouseClientIds;

        // Cargar nombres de los clientes finales
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



        // ── 5. Actualizar estado ────────────────────────────────────────────
        setAllowedWarehouseIds(warehouseIds);
        setAllowedClientIds(clientIds.length > 0 ? clientIds : null);
        setAvailableClients(clients);
        setAvailableWarehouses(warehouses);
        setIsGlobalAccess(globalAccess);
      } catch (err) {
        // FAIL CLOSED: en caso de error, siempre restringir (0 resultados)
        setAllowedWarehouseIds([]);
        setAllowedClientIds([]);
        setAvailableClients([]);
        setAvailableWarehouses([]);
        setIsGlobalAccess(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
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
