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
    if (scopeLoading) {
      return;
    }

    // FIX: Si no hay warehouses disponibles, NO marcar initialized todavía.
    // Esto evita que se marque initialized=true en un render intermedio donde
    // scopeLoading ya es false pero availableWarehouses todavía no se propagó
    // desde useUserScope. El efecto se re-ejecutará automáticamente cuando
    // availableWarehouses cambie (está en las dependencias).
    if (availableWarehouses.length === 0 && !isGlobalAccess) {
      return;
    }

    // Si ya está inicializado y tenemos warehouses, no volver a inicializar
    if (initialized) {
      return;
    }

    let resolved: string | null = null;

    // 1. Si el usuario tiene exactamente 1 warehouse → SIEMPRE preseleccionarlo
    //    Esto tiene prioridad sobre localStorage para evitar estados huérfanos
    if (availableWarehouses.length === 1 && !isGlobalAccess) {
      resolved = availableWarehouses[0].id;
    }

    // 2. Si no se resolvió por único warehouse, intentar restaurar desde localStorage
    if (resolved === null && storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'null' || saved === '') {
        resolved = null;
      } else if (saved && availableWarehouses.some((w) => w.id === saved)) {
        resolved = saved;
      }
    }

    // 3. Si aún es null y no es global, pero hay warehouses disponibles
    //    (múltiples warehouses), forzar el primero para que nunca quede huérfano
    if (resolved === null && !isGlobalAccess && availableWarehouses.length > 0) {
      resolved = availableWarehouses[0].id;
    }

    // Persistir en localStorage
    if (resolved !== null && storageKey) {
      localStorage.setItem(storageKey, resolved);
    } else if (resolved === null && storageKey) {
      localStorage.setItem(storageKey, 'null');
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
      // FIX: Si solo queda 1 warehouse disponible, saltar directo a ese
      // en vez de dejar null y mostrar "Sin almacén seleccionado"
      if (availableWarehouses.length === 1 && !isGlobalAccess) {
        const singleId = availableWarehouses[0].id;
        setActiveWarehouseIdRaw(singleId);
        if (storageKey) {
          localStorage.setItem(storageKey, singleId);
        }
        // No marcar como invalidada — el usuario nunca se entera
        setSelectionInvalidated(false);
      } else {
        // Resetear selección (múltiples warehouses o global)
        setActiveWarehouseIdRaw(null);
        if (storageKey) {
          localStorage.removeItem(storageKey);
        }
        // Marcar como invalidada para que el UI reaccione (abrir modal)
        setSelectionInvalidated(true);
      }
    }
  }, [initialized, scopeLoading, activeWarehouseId, availableWarehouses, storageKey, isGlobalAccess]);

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
