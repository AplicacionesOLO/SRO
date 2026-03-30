import { useCallback, useEffect, useRef } from 'react';
import type { RecurrenceConfig } from '../utils/recurrenceUtils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ReservationDraftFormData {
  dockId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  purchaseOrder: string;
  truckPlate: string;
  orderRequestNumber: string;
  shipperProvider: string;
  driver: string;
  dua: string;
  invoice: string;
  statusId: string;
  notes: string;
  transportType: string;
  cargoType: string;
}

export interface ReservationDraftData {
  formData: ReservationDraftFormData;
  isImported: boolean;
  cancelReason: string;
  recurrenceConfig: RecurrenceConfig;
  savedAt: string;       // ISO timestamp
  orgId: string;
  defaults?: any;        // slot defaults al momento de crear el borrador
}

export interface DraftContextCheck {
  isConsistent: boolean;
  warnings: string[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** 7 días en ms — expiración del borrador */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Helpers puros (usables fuera del hook) ──────────────────────────────────

/** Genera la clave de localStorage para el borrador de nueva reserva */
export function getDraftKey(orgId: string): string {
  return `draft_reservation_${orgId}_new`;
}

/**
 * Lee y valida el borrador desde localStorage.
 * Retorna null si no existe, está corrupto o expiró.
 */
export function readDraftFromStorage(orgId: string): ReservationDraftData | null {
  const key = getDraftKey(orgId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft: ReservationDraftData = JSON.parse(raw);

    // Validación mínima de integridad
    if (!draft.formData || !draft.savedAt || typeof draft.formData !== 'object') {
      localStorage.removeItem(key);
      return null;
    }

    // Verificar expiración
    const ageMs = Date.now() - new Date(draft.savedAt).getTime();
    if (ageMs > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return draft;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

/** Elimina el borrador de localStorage */
export function clearDraftFromStorage(orgId: string): void {
  localStorage.removeItem(getDraftKey(orgId));
}

/**
 * Verifica si el borrador es consistente con el contexto actual.
 *
 * Contexto "cambiado significativamente" si:
 *   1. El andén guardado en el borrador no existe en la lista actual de andenes
 *   2. El dock_id de los defaults actuales difiere del dock_id con que se inició el borrador
 */
export function checkDraftContext(
  draft: ReservationDraftData,
  currentDockIds: string[],
  currentDefaults?: any
): DraftContextCheck {
  const warnings: string[] = [];

  // Andén del formulario ya no existe en la vista actual
  if (draft.formData.dockId && !currentDockIds.includes(draft.formData.dockId)) {
    warnings.push(
      'El andén guardado en el borrador ya no está disponible en la vista actual.'
    );
  }

  // El slot de origen cambió (usuario abrió "Nueva Reserva" desde un andén diferente)
  if (
    draft.defaults?.dock_id &&
    currentDefaults?.dock_id &&
    draft.defaults.dock_id !== currentDefaults.dock_id
  ) {
    warnings.push(
      'El borrador fue iniciado desde un andén diferente al seleccionado actualmente.'
    );
  }

  return {
    isConsistent: warnings.length === 0,
    warnings,
  };
}

/**
 * Determina si el borrador contiene datos reales ingresados por el usuario
 * (más allá de los valores por defecto).
 */
export function hasMeaningfulDraftData(
  formData: ReservationDraftFormData,
  defaults?: any
): boolean {
  if (formData.purchaseOrder.trim()) return true;
  if (formData.truckPlate.trim()) return true;
  if (formData.driver.trim()) return true;
  if (formData.dua.trim()) return true;
  if (formData.invoice.trim()) return true;
  if (formData.orderRequestNumber.trim()) return true;
  if (formData.notes.trim()) return true;

  // Proveedor o tipo de carga seleccionado manualmente (diferente a defaults)
  if (
    formData.shipperProvider &&
    formData.shipperProvider !== (defaults?.shipper_provider || '')
  )
    return true;
  if (
    formData.cargoType &&
    formData.cargoType !== (defaults?.cargo_type || '')
  )
    return true;

  return false;
}

/**
 * Formatea la antigüedad del borrador de forma legible.
 * Ej: "hace un momento", "hace 5 min", "hace 2 h", "hace 1 día"
 */
export function getDraftAge(savedAt: string): string {
  const ms = Date.now() - new Date(savedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days !== 1 ? 's' : ''}`;
}

// ─── Generic helpers (for any modal form) ────────────────────────────────────

export interface GenericDraftData<T> {
  formData: T;
  savedAt: string;
}

/**
 * Reads any form draft from localStorage by exact key.
 * Returns null if missing, corrupted, or older than 7 days.
 */
export function readGenericDraft<T>(key: string): GenericDraftData<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data: GenericDraftData<T> = JSON.parse(raw);
    if (!data.formData || !data.savedAt) {
      localStorage.removeItem(key);
      return null;
    }
    const ageMs = Date.now() - new Date(data.savedAt).getTime();
    if (ageMs > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

/** Saves any form draft to localStorage by exact key (no debounce — call from inside a timer). */
export function saveGenericDraft<T>(key: string, formData: T): void {
  try {
    const data: GenericDraftData<T> = { formData, savedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage quota exceeded — silent
  }
}

/** Clears any draft from localStorage by exact key. */
export function clearGenericDraft(key: string): void {
  localStorage.removeItem(key);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseReservationDraftOptions {
  orgId: string;
  /** El modal está abierto */
  isOpen: boolean;
  /** true = creando nueva reserva, false = editando existente */
  isNewReservation: boolean;
}

interface UseReservationDraftReturn {
  /** Guarda el borrador con debounce de 500 ms (no-op si editando o cerrado) */
  saveDraft: (data: Omit<ReservationDraftData, 'savedAt' | 'orgId'>) => void;
  /** Limpia el borrador inmediatamente */
  clearDraft: () => void;
  /** Lee el borrador actual desde localStorage */
  readDraft: () => ReservationDraftData | null;
}

export function useReservationDraft({
  orgId,
  isOpen,
  isNewReservation,
}: UseReservationDraftOptions): UseReservationDraftReturn {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraft = useCallback(
    (data: Omit<ReservationDraftData, 'savedAt' | 'orgId'>) => {
      // Solo guardar si el modal está abierto y es una nueva reserva
      if (!isOpen || !isNewReservation) return;

      // Debounce: cancelar el timer anterior y crear uno nuevo
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        try {
          const draft: ReservationDraftData = {
            ...data,
            orgId,
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(getDraftKey(orgId), JSON.stringify(draft));
        } catch {
          // localStorage lleno o bloqueado — fallo silencioso
        }
      }, 500);
    },
    [orgId, isOpen, isNewReservation]
  );

  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearDraftFromStorage(orgId);
  }, [orgId]);

  const readDraft = useCallback(
    () => readDraftFromStorage(orgId),
    [orgId]
  );

  // Limpiar timer al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { saveDraft, clearDraft, readDraft };
}

// ─── Generic form draft hook (for all other modals) ──────────────────────────

interface UseFormDraftOptions {
  /** Full localStorage key (e.g. `draft_dock_orgId_new`) */
  storageKey: string;
  /** true = creating new record; false = editing existing → auto-save disabled */
  isNewRecord: boolean;
}

interface UseFormDraftReturn<T> {
  /** Debounced 500ms save (no-op when isNewRecord = false) */
  saveDraft: (data: T) => void;
  /** Immediate clear */
  clearDraft: () => void;
  /** Read current draft */
  readDraft: () => GenericDraftData<T> | null;
}

export function useFormDraft<T>(
  { storageKey, isNewRecord }: UseFormDraftOptions
): UseFormDraftReturn<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraft = useCallback(
    (data: T) => {
      if (!isNewRecord) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveGenericDraft(storageKey, data);
      }, 500);
    },
    [storageKey, isNewRecord]
  );

  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearGenericDraft(storageKey);
  }, [storageKey]);

  const readDraft = useCallback(
    () => readGenericDraft<T>(storageKey),
    [storageKey]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { saveDraft, clearDraft, readDraft };
}
