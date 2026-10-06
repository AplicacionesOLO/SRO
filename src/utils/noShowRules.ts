// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura de la regla "No arribó" (No-Show).
//
// Centraliza la decisión de marcar (o no) una reserva como No arribó, para que
// sea reutilizable desde el frontend (listas de Pending, bloqueo de ingreso y
// lector QR) y fácil de cubrir con pruebas unitarias.
//
// Reglas de negocio:
//   1. Una reserva CANCELADA nunca se marca No arribó (se canceló, no es que
//      no llegó). El estado de cancelación se mantiene.
//   2. Si el almacén tiene activada la exclusión de importados, las reservas
//      con carga IMPORTADA nunca se marcan No arribó (la aduana puede tardar),
//      así se conserva el espacio y el IN/OUT igual puede registrar el ingreso.
//   3. Si el almacén no tiene tolerancia configurada (> 0), no aplica la regla.
//   4. Si ya pasó la hora de la cita + la tolerancia (y no hay ingreso), se marca.
//
// Nota: este archivo es intencionalmente puro (sin imports, sin efectos) para
// poder ejecutarse en cualquier entorno (navegador, Deno, tests con Node).
// ─────────────────────────────────────────────────────────────────────────────

export type NoShowDecision =
  | 'mark' // hay que marcar No arribó
  | 'keep' // todavía está dentro de la tolerancia → no marcar
  | 'skip_cancelled' // está cancelada → nunca marcar
  | 'skip_imported' // es importada y el almacén excluye importados → nunca marcar
  | 'skip_no_tolerance' // el almacén no tiene tolerancia configurada → no aplica
  | 'skip_no_start'; // no hay hora de cita para evaluar → no aplica

export interface NoShowEvaluationInput {
  /** Hora de inicio de la cita (ISO). */
  startDatetime?: string | null;
  /** Tolerancia del almacén en minutos (null/0 = desactivado). */
  toleranceMinutes?: number | null;
  /** La reserva está cancelada. */
  isCancelled?: boolean | null;
  /** La reserva es de carga importada. */
  isImported?: boolean | null;
  /** El almacén tiene activada la exclusión de importados. */
  excludeImported?: boolean | null;
  /** Momento a comparar (por defecto: ahora). Inyectable para tests. */
  now?: Date;
}

/**
 * Determina si una reserva queda EXENTA de la regla de No arribó por estado
 * (cancelada) o por política del almacén (exclusión de importados).
 */
export function isExemptFromNoShow(params: {
  isCancelled?: boolean | null;
  isImported?: boolean | null;
  excludeImported?: boolean | null;
}): boolean {
  if (params.isCancelled === true) return true;
  if (params.excludeImported === true && params.isImported === true) return true;
  return false;
}

/**
 * ¿La reserva ya superó la hora de cita + tolerancia?
 * Devuelve false si falta la fecha, si no hay tolerancia, o si no venció aún.
 */
export function isNoShowExpired(params: {
  startDatetime?: string | null;
  toleranceMinutes?: number | null;
  now?: Date;
}): boolean {
  const { startDatetime, toleranceMinutes, now = new Date() } = params;
  if (!startDatetime) return false;
  if (toleranceMinutes == null || Number(toleranceMinutes) <= 0) return false;
  const start = new Date(startDatetime);
  if (Number.isNaN(start.getTime())) return false;
  const cutoff = start.getTime() + Number(toleranceMinutes) * 60_000;
  return now.getTime() > cutoff;
}

/**
 * Decisión completa de No arribó para una reserva dentro de un almacén.
 * Es la función que usan la lista de pendientes, el bloqueo de ingreso y el QR.
 */
export function evaluateNoShow(input: NoShowEvaluationInput): NoShowDecision {
  const { startDatetime, toleranceMinutes, isCancelled, isImported, excludeImported, now } = input;

  if (isCancelled === true) return 'skip_cancelled';
  if (excludeImported === true && isImported === true) return 'skip_imported';
  if (toleranceMinutes == null || Number(toleranceMinutes) <= 0) return 'skip_no_tolerance';
  if (!startDatetime) return 'skip_no_start';

  return isNoShowExpired({ startDatetime, toleranceMinutes, now }) ? 'mark' : 'keep';
}

/** Conveniencia: sólo true cuando la reserva debe marcarse No arribó. */
export function shouldMarkNoShow(input: NoShowEvaluationInput): boolean {
  return evaluateNoShow(input) === 'mark';
}

/**
 * Resuelve si una reserva es "importada".
 * Fuente de verdad: is_imported. Fallback: si es null pero ya tiene DUA, es importada.
 */
export function resolveIsImported(row: {
  is_imported?: boolean | null;
  dua?: string | null;
}): boolean {
  if (row.is_imported === true) return true;
  if (row.is_imported == null) return !!(row.dua && row.dua.trim().length > 0);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reducción visual de una cita en estado "No arribó"
//
// La cita NO se elimina del calendario, pero deja de ocupar todo su tiempo:
// se conserva un bloque visible MÍNIMO (15 min desde su inicio) y el resto del
// horario queda LIBRE para nuevas citas (igual que la salida anticipada).
// Si la cita duraba menos de 15 min, conserva su duración original.
// ─────────────────────────────────────────────────────────────────────────────

/** Minutos visibles mínimos que conserva una cita "No arribó" en el calendario. */
export const NO_SHOW_MIN_VISIBLE_MINUTES = 15;

/**
 * Fin efectivo de una cita en estado "No arribó": inicio + 15 min visibles,
 * nunca mayor que su fin planificado. El resto del tiempo queda libre.
 */
export function getNoShowReducedEnd(startDatetime: string, endDatetime: string): Date {
  const start = new Date(startDatetime).getTime();
  const plannedEnd = new Date(endDatetime).getTime();
  if (Number.isNaN(start) || Number.isNaN(plannedEnd)) return new Date(endDatetime);
  const reduced = start + NO_SHOW_MIN_VISIBLE_MINUTES * 60_000;
  return new Date(Math.min(reduced, plannedEnd));
}

/** ¿El código de estado corresponde a "No arribó" (NO_SHOW)? */
export function isNoShowStatusCode(code?: string | null): boolean {
  return (code || '').toUpperCase() === 'NO_SHOW';
}