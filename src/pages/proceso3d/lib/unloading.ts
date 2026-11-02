import type { Reservation } from '../../../services/calendarService';
import type { CargoTypeInfo, GateTimes, StatusChange } from '../../../services/proceso3dService';
import type { ManpowerRule } from '../../../types/manpowerRule';
import { estimatedDockWindow, statusAt } from './phases';

/**
 * Qué está pasando en el andén mientras el camión está acoplado.
 *   APERTURA     → se abren puertas / revisión (estado "Apertura")
 *   ESPERA       → acoplado, esperando cuadrilla ("Arribó", "Pendiente de descarga")
 *   DESCARGANDO  → "Inicio" / "Descargando…"
 *   DESCARGADO   → descarga terminada, esperando salida
 */
export type DockStage = 'APERTURA' | 'ESPERA' | 'DESCARGANDO' | 'DESCARGADO';

export const STAGE_META: Record<DockStage, { label: string; color: string }> = {
  APERTURA: { label: 'Apertura', color: '#0ea5e9' },
  ESPERA: { label: 'Esperando cuadrilla', color: '#f59e0b' },
  DESCARGANDO: { label: 'Descargando', color: '#14b8a6' },
  DESCARGADO: { label: 'Descargado', color: '#22c55e' },
};

const UNLOAD_CODES = new Set(['START', 'UNLOADING']);
const DONE_CODES = new Set(['DISCHARGED', 'UNLOADED_PENDING_CHECKIN', 'CHECKEDIN_PENDING_CLOSE', 'DISPATCHED', 'DONE']);
const OPEN_CODES = new Set(['IN_PROGRESS']);
const MIN = 60_000;

export interface DockActivity {
  stage: DockStage;
  /** 0 → 1 */
  progress: number;
  startedAt: number | null;
  endedAt: number | null;
  /** Hora estimada de fin (si la descarga sigue en curso) */
  etaAt: number | null;
  /** true si el avance se estima (sin hora real de inicio / fin) */
  estimated: boolean;
}

/** Duración esperada de la descarga según el tipo de carga y la cantidad. */
export function expectedUnloadMs(r: Reservation, cargo?: CargoTypeInfo): number {
  const qty = r.quantity_value ?? null;
  let ms: number | null = null;
  if (cargo?.seconds_per_unit && qty) ms = cargo.seconds_per_unit * qty * 1000;
  else if (cargo?.default_minutes) ms = cargo.default_minutes * MIN;
  if (!ms) {
    const a = new Date(r.start_datetime).getTime();
    const b = new Date(r.end_datetime).getTime();
    ms = b - a;
  }
  return Math.max(10 * MIN, ms);
}

export function dockActivity(
  r: Reservation,
  gate: GateTimes | undefined,
  history: StatusChange[] | undefined,
  t: number,
  now: number,
  cargo?: CargoTypeInfo
): DockActivity {
  const expected = expectedUnloadMs(r, cargo);

  // 1) Historial real: hora de inicio y fin de la descarga
  const startIdx = history?.findIndex((h) => UNLOAD_CODES.has(h.to)) ?? -1;
  if (history && startIdx >= 0 && history[startIdx].at <= t) {
    const startedAt = history[startIdx].at;
    const endChange = history.slice(startIdx + 1).find((h) => DONE_CODES.has(h.to));
    const endedAt = endChange?.at ?? null;
    if (endedAt !== null && endedAt <= t) {
      return { stage: 'DESCARGADO', progress: 1, startedAt, endedAt, etaAt: null, estimated: false };
    }
    if (endedAt !== null) {
      // recorrido: se conoce el fin real
      const progress = Math.min(1, Math.max(0, (t - startedAt) / Math.max(MIN, endedAt - startedAt)));
      return { stage: 'DESCARGANDO', progress, startedAt, endedAt, etaAt: endedAt, estimated: false };
    }
    const progress = Math.min(0.97, Math.max(0.02, (t - startedAt) / expected));
    return { stage: 'DESCARGANDO', progress, startedAt, endedAt: null, etaAt: startedAt + expected, estimated: true };
  }

  // 2) Estado en el instante t: el actual (en vivo) o el del historial (recorrido)
  const raw = t >= now ? r.status?.code ?? '' : history?.length ? statusAt(history, t) ?? '' : null;
  if (raw !== null) {
    const code = raw.toUpperCase();
    if (DONE_CODES.has(code)) return { stage: 'DESCARGADO', progress: 1, startedAt: null, endedAt: null, etaAt: null, estimated: true };
    if (OPEN_CODES.has(code)) return { stage: 'APERTURA', progress: 0, startedAt: null, endedAt: null, etaAt: null, estimated: false };
    if (UNLOAD_CODES.has(code)) {
      // descargando, pero sin hora de inicio: se toma la llegada al sitio
      const from = Math.max(new Date(r.start_datetime).getTime(), new Date(gate?.ingresoAt ?? r.start_datetime).getTime());
      const progress = Math.min(0.95, Math.max(0.05, (t - from) / expected));
      return { stage: 'DESCARGANDO', progress, startedAt: null, endedAt: null, etaAt: from + expected, estimated: true };
    }
    return { stage: 'ESPERA', progress: 0, startedAt: null, endedAt: null, etaAt: null, estimated: false };
  }

  // 3) Sin historial (recorrido): se reparte la ventana estimada en el andén
  const w = estimatedDockWindow(r, gate, now);
  const dockEnd = Math.max(w.dockStart + MIN, w.end - 5 * MIN);
  const f = (t - w.dockStart) / (dockEnd - w.dockStart);
  if (f < 0.12) return { stage: 'APERTURA', progress: 0, startedAt: null, endedAt: null, etaAt: null, estimated: true };
  if (f < 0.9) {
    return { stage: 'DESCARGANDO', progress: Math.min(1, (f - 0.12) / 0.78), startedAt: null, endedAt: null, etaAt: null, estimated: true };
  }
  return { stage: 'DESCARGADO', progress: 1, startedAt: null, endedAt: null, etaAt: null, estimated: true };
}

/* ─────────────────────────────── Cuadrilla ─────────────────────────────── */

export interface CrewMix {
  personas: number;
  electrica: number;
  manual: number;
  montacargas: number;
  apilador: number;
}

export interface Crew {
  mix: CrewMix;
  items: { name: string; quantity: number }[];
  /** true si sale de una regla configurada en Recursos; false = cuadrilla por defecto */
  fromRule: boolean;
}

const DEFAULT_CREW: CrewMix = { personas: 2, electrica: 1, manual: 1, montacargas: 0, apilador: 0 };

function kindOf(name: string, type?: string): keyof CrewMix {
  const n = name.toLowerCase();
  if (/montacarga|forklift|monta/.test(n)) return 'montacargas';
  if (/apilador|stacker/.test(n)) return 'apilador';
  if (/manual|transpaleta/.test(n)) return 'manual';
  if (/el[eé]ctric/.test(n)) return 'electrica';
  if (type === 'EQUIPMENT') return 'electrica';
  return 'personas';
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function resolveCargo(r: Reservation, cargoTypes: Map<string, CargoTypeInfo>): CargoTypeInfo | undefined {
  if (!r.cargo_type) return undefined;
  const byId = cargoTypes.get(r.cargo_type);
  if (byId) return byId;
  const name = r.cargo_type.trim().toLowerCase();
  for (const c of cargoTypes.values()) if (c.name.trim().toLowerCase() === name) return c;
  return undefined;
}

/**
 * Cuadrilla de la descarga, con la misma lógica que el pronóstico de Recursos:
 * almacén + tipo de carga + rango de bultos, prefiriendo reglas del proveedor.
 */
export function crewFor(
  r: Reservation,
  warehouseId: string | null | undefined,
  rules: ManpowerRule[],
  cargo: CargoTypeInfo | undefined
): Crew {
  const bultos = r.quantity_value ?? null;
  const candidates = rules.filter(
    (rule) =>
      rule.is_active &&
      (!warehouseId || rule.warehouse_id === warehouseId) &&
      !!cargo &&
      rule.cargo_type_id === cargo.id &&
      (rule.min_bultos == null || (bultos != null && bultos >= rule.min_bultos)) &&
      (rule.max_bultos == null || (bultos != null && bultos <= rule.max_bultos))
  );
  const provider = r.shipper_provider && isUuid(r.shipper_provider) ? r.shipper_provider : null;
  const specific = candidates.filter((c) => c.provider_id && c.provider_id === provider);
  const pool = (specific.length ? specific : candidates.filter((c) => !c.provider_id)).sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0)
  );
  const rule = pool[0];
  if (!rule || !rule.items?.length) {
    return {
      mix: { ...DEFAULT_CREW },
      items: [
        { name: 'Personal', quantity: DEFAULT_CREW.personas },
        { name: 'Carretilla eléctrica', quantity: DEFAULT_CREW.electrica },
        { name: 'Carretilla manual', quantity: DEFAULT_CREW.manual },
      ],
      fromRule: false,
    };
  }
  const mix: CrewMix = { personas: 0, electrica: 0, manual: 0, montacargas: 0, apilador: 0 };
  const items = rule.items.map((it) => {
    const name = it.category?.name ?? 'Recurso';
    mix[kindOf(name, it.category?.type)] += it.quantity;
    return { name, quantity: it.quantity };
  });
  return { mix, items, fromRule: true };
}

/** Carga suelta (a piso, por bultos) o paletizada: cambia cómo se anima la descarga. */
export function isLooseCargo(cargo: CargoTypeInfo | undefined): boolean {
  if (!cargo) return false;
  return /piso|bulto|suelt/i.test(cargo.name) || cargo.measurement_key === 'bultos';
}

export function unitLabel(cargo: CargoTypeInfo | undefined): string {
  const key = cargo?.measurement_key;
  if (key === 'lines') return 'líneas';
  if (key === 'containers') return 'tarimas';
  if (key === 'bultos') return 'bultos';
  return cargo?.unit_label?.toLowerCase().replace(/^cantidad de\s+/, '') || 'bultos';
}
