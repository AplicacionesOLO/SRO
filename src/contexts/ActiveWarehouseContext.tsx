import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useUserScope } from '@/hooks/useUserScope';
import { usePermissions } from '@/hooks/usePermissions';

export interface ActiveWarehouseInfo {
  id: string;
  name: string;
  timezone: string;
  location: string | null;
}

export interface ActiveWarehouseContextValue {
  /** Lista de almacenes permitidos para este usuario */
  allowedWarehouses: ActiveWarehouseInfo[];
  /** ID del almacén activo seleccionado. null = ver todos (dentro del scope) */
  activeWarehouseId: string | null;
  /** Objeto completo del almacén activo */
  activeWarehouse: ActiveWarehouseInfo | null;
  /** Cambiar el almacén activo */
  setActiveWarehouseId: (id: string | null) => void;
  /** true si el usuario tiene más de un almacén permitido */
  hasMultipleWarehouses: boolean;
  /** true si el scope todavía está cargando */
  loading: boolean;
  /**
   * IDs efectivos para filtrar queries.
   * - Si activeWarehouseId está seteado → [activeWarehouseId]
   * - Si null (ver todos) → allowedWarehouseIds del scope (puede ser null = global)
   */
  effectiveWarehouseIds: string[] | null;
  /** true si la selección actual fue invalidada y necesita re-selección (para abrir modal) */
  selectionInvalidated: boolean;
  /** Marcar que la selección invalidada ya fue manejada (ej: modal abierto) */
  acknowledgeInvalidation: () => void;
}

const ActiveWarehouseContext = createContext<ActiveWarehouseContextValue | null>(null);

const STORAGE_KEY_PREFIX = 'sro_active_warehouse_';

export function ActiveWarehouseProvider({ children }: { children: React.ReactNode }) {
  const { orgId } = usePermissions();
  const {
    allowedWarehouseIds,
    availableWarehouses,
    isGlobalAccess,
    loading: scopeLoading,
  } = useUserScope();

  const [activeWarehouseId, setActiveWarehouseIdRaw] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [selectionInvalidated, setSelectionInvalidated] = useState(false);

  const storageKey = orgId ? `${STORAGE_KEY_PREFIX}${orgId}` : null;

  // Inicializar desde localStorage una vez que el scope esté listo
  useEffect(() => {
    if (scopeLoading || initialized) return;
    if (availableWarehouses.length === 0 && !isGlobalAccess) {
      // Sin warehouses → no hay nada que seleccionar
      setInitialized(true);
      return;
    }

    let resolved: string | null = null;

    // 1. Intentar restaurar desde localStorage
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'null' || saved === '') {
        resolved = null;
      } else if (saved && availableWarehouses.some((w) => w.id === saved)) {
        resolved = saved;
      }
    }

    // 2. Si el usuario tiene exactamente 1 warehouse → preseleccionarlo automáticamente
    if (resolved === null && availableWarehouses.length === 1 && !isGlobalAccess) {
      resolved = availableWarehouses[0].id;
    }

    // Persistir en localStorage (incluyendo el caso de auto-selección de 1 warehouse)
    if (resolved !== null && storageKey) {
      localStorage.setItem(storageKey, resolved);
    }

    setActiveWarehouseIdRaw(resolved);
    setInitialized(true);
  }, [scopeLoading, availableWarehouses, isGlobalAccess, storageKey, initialized]);

  const setActiveWarehouseId = useCallback(
    (id: string | null) => {
      setActiveWarehouseIdRaw(id);
      setSelectionInvalidated(false);
      if (storageKey) {
        localStorage.setItem(storageKey, id ?? 'null');
      }
    },
    [storageKey]
  );

  const acknowledgeInvalidation = useCallback(() => {
    setSelectionInvalidated(false);
  }, []);

  // Validación continua: si el warehouse activo ya no está en el scope, invalidar
  useEffect(() => {
    if (!initialized || scopeLoading) return;

    // Si no hay selección activa, no hay nada que invalidar
    if (activeWarehouseId === null) return;

    // Verificar si el warehouse activo sigue siendo válido
    const isStillValid = availableWarehouses.some((w) => w.id === activeWarehouseId);

    if (!isStillValid) {

      // Resetear selección
      setActiveWarehouseIdRaw(null);
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
      // Marcar como invalidada para que el UI reaccione (abrir modal)
      setSelectionInvalidated(true);
    }
  }, [initialized, scopeLoading, activeWarehouseId, availableWarehouses, storageKey]);

  const allowedWarehouses: ActiveWarehouseInfo[] = useMemo(
    () =>
      availableWarehouses.map((w) => ({
        id: w.id,
        name: w.name,
        timezone: w.timezone,
        location: w.location,
      })),
    [availableWarehouses]
  );

  const activeWarehouse = useMemo(
    () => (activeWarehouseId ? allowedWarehouses.find((w) => w.id === activeWarehouseId) ?? null : null),
    [activeWarehouseId, allowedWarehouses]
  );

  const hasMultipleWarehouses = allowedWarehouses.length > 1 || isGlobalAccess;

  /**
   * effectiveWarehouseIds:
   * - activeWarehouseId seteado → [activeWarehouseId]
   * - null + usuario restringido → allowedWarehouseIds (array de sus warehouses)
   * - null + global access → null (sin filtro)
   */
  const effectiveWarehouseIds: string[] | null = useMemo(() => {
    if (activeWarehouseId) return [activeWarehouseId];
    if (isGlobalAccess) return null; // global: sin filtro
    return allowedWarehouseIds; // restringido: sus warehouses
  }, [activeWarehouseId, isGlobalAccess, allowedWarehouseIds]);

  const value: ActiveWarehouseContextValue = {
    allowedWarehouses,
    activeWarehouseId,
    activeWarehouse,
    setActiveWarehouseId,
    hasMultipleWarehouses,
    loading: scopeLoading || !initialized,
    effectiveWarehouseIds,
    selectionInvalidated,
    acknowledgeInvalidation,
  };

  return (
    <ActiveWarehouseContext.Provider value={value}>
      {children}
    </ActiveWarehouseContext.Provider>
  );
}

export function useActiveWarehouse(): ActiveWarehouseContextValue {
  const ctx = useContext(ActiveWarehouseContext);
  if (!ctx) {
    throw new Error('useActiveWarehouse must be used inside ActiveWarehouseProvider');
  }
  return ctx;
}
