/**
 * recurrenceUtils.ts
 * Lógica pura de generación de fechas recurrentes.
 * Sin dependencias externas, sin efectos secundarios.
 */

export interface RecurrenceConfig {
  enabled: boolean;
  type: 'daily' | 'weekly' | 'monthly';
  interval: number;        // cada N días/semanas/meses
  weekdays: number[];      // 0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb  (solo weekly)
  endType: 'never' | 'until' | 'count';
  endDate: string;         // YYYY-MM-DD (para endType=until)
  count: number;           // total de ocurrencias INCLUYENDO la original (para endType=count)
}

export const DEFAULT_RECURRENCE_CONFIG: RecurrenceConfig = {
  enabled: false,
  type: 'weekly',
  interval: 1,
  weekdays: [],
  endType: 'count',
  endDate: '',
  count: 4,
};

const MAX_SAFETY_OCCURRENCES = 365;

/**
 * Genera las fechas de las ocurrencias ADICIONALES (no incluye la fecha original del formulario).
 * La primera reserva siempre es la del formulario.
 *
 * @param startDatetimeISO  ISO string del inicio de la reserva original
 * @param endDatetimeISO    ISO string del fin de la reserva original
 * @param config            Configuración de recurrencia
 * @returns Array de {startDatetime, endDatetime} para las ocurrencias adicionales
 */
export function generateRecurringDates(
  startDatetimeISO: string,
  endDatetimeISO: string,
  config: RecurrenceConfig
): Array<{ startDatetime: string; endDatetime: string }> {
  if (!config.enabled) return [];

  const baseStart = new Date(startDatetimeISO);
  const baseEnd = new Date(endDatetimeISO);
  const durationMs = baseEnd.getTime() - baseStart.getTime();

  if (durationMs <= 0) return [];

  // Determinar límites
  let maxDate: Date | null = null;
  // count incluye la original, entonces adicionales = count - 1
  let additionalLimit = MAX_SAFETY_OCCURRENCES;

  if (config.endType === 'count') {
    additionalLimit = Math.max(0, config.count - 1);
  } else if (config.endType === 'until' && config.endDate) {
    maxDate = new Date(config.endDate + 'T23:59:59');
    additionalLimit = MAX_SAFETY_OCCURRENCES;
  } else {
    // never: 1 año hacia adelante, cap 100
    maxDate = new Date(baseStart.getTime() + 365 * 24 * 60 * 60 * 1000);
    additionalLimit = 100;
  }

  const results: Array<{ startDatetime: string; endDatetime: string }> = [];

  if (config.type === 'daily') {
    generateDaily(baseStart, durationMs, config.interval, additionalLimit, maxDate, results);
  } else if (config.type === 'weekly') {
    generateWeekly(baseStart, durationMs, config.interval, config.weekdays, additionalLimit, maxDate, results);
  } else if (config.type === 'monthly') {
    generateMonthly(baseStart, durationMs, config.interval, additionalLimit, maxDate, results);
  }

  return results;
}

function generateDaily(
  baseStart: Date,
  durationMs: number,
  interval: number,
  limit: number,
  maxDate: Date | null,
  results: Array<{ startDatetime: string; endDatetime: string }>
) {
  let current = new Date(baseStart);
  current.setDate(current.getDate() + interval);

  while (results.length < limit) {
    if (maxDate && current > maxDate) break;
    const end = new Date(current.getTime() + durationMs);
    results.push({ startDatetime: current.toISOString(), endDatetime: end.toISOString() });
    current = new Date(current);
    current.setDate(current.getDate() + interval);
  }
}

function generateWeekly(
  baseStart: Date,
  durationMs: number,
  interval: number,
  weekdays: number[],
  limit: number,
  maxDate: Date | null,
  results: Array<{ startDatetime: string; endDatetime: string }>
) {
  if (!weekdays.length) return;

  // Encontrar el domingo de la semana que contiene baseStart
  const weekSunday = new Date(baseStart);
  weekSunday.setDate(weekSunday.getDate() - weekSunday.getDay());
  weekSunday.setHours(0, 0, 0, 0);

  const sortedDays = [...weekdays].sort((a, b) => a - b);
  let weekOffset = 0;
  let safetyCounter = 0;

  while (results.length < limit) {
    safetyCounter++;
    if (safetyCounter > 1000) break;

    const weekStart = new Date(weekSunday.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000);

    // Si el lunes de la semana ya supera maxDate, salir
    if (maxDate && weekStart > maxDate) break;

    for (const dow of sortedDays) {
      const occ = new Date(weekStart);
      occ.setDate(occ.getDate() + dow);
      occ.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);

      // Saltar si es la misma fecha/hora que la original o anterior
      if (occ <= baseStart) continue;
      if (maxDate && occ > maxDate) continue;
      if (results.length >= limit) break;

      const end = new Date(occ.getTime() + durationMs);
      results.push({ startDatetime: occ.toISOString(), endDatetime: end.toISOString() });
    }

    weekOffset += interval;
    if (results.length >= limit) break;
  }
}

function generateMonthly(
  baseStart: Date,
  durationMs: number,
  interval: number,
  limit: number,
  maxDate: Date | null,
  results: Array<{ startDatetime: string; endDatetime: string }>
) {
  const dayOfMonth = baseStart.getDate();
  let current = new Date(baseStart);

  for (let i = 0; i < limit; i++) {
    const nextMonthRaw = current.getMonth() + interval;
    const nextYear = current.getFullYear() + Math.floor(nextMonthRaw / 12);
    const nextMonth = nextMonthRaw % 12;

    // Manejar días finales de mes (ej: 31 enero → 28 feb)
    const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const nextDay = Math.min(dayOfMonth, daysInNextMonth);

    current = new Date(nextYear, nextMonth, nextDay, baseStart.getHours(), baseStart.getMinutes(), 0, 0);

    if (maxDate && current > maxDate) break;

    const end = new Date(current.getTime() + durationMs);
    results.push({ startDatetime: current.toISOString(), endDatetime: end.toISOString() });
  }
}

/**
 * Genera la lista de TODAS las ocurrencias (incluida la original) para mostrar en la vista previa.
 */
export function generatePreviewDates(
  startDatetimeISO: string,
  endDatetimeISO: string,
  config: RecurrenceConfig,
  maxPreview = 10
): Date[] {
  const baseStart = new Date(startDatetimeISO);
  const additional = generateRecurringDates(startDatetimeISO, endDatetimeISO, config);

  const all = [baseStart, ...additional.map((d) => new Date(d.startDatetime))];
  return all.slice(0, maxPreview);
}

/**
 * Cuenta total de ocurrencias (incluida la original).
 */
export function countOccurrences(
  startDatetimeISO: string,
  endDatetimeISO: string,
  config: RecurrenceConfig
): number {
  const additional = generateRecurringDates(startDatetimeISO, endDatetimeISO, config);
  return 1 + additional.length;
}

/**
 * Formatea una Date como "Lun, 27 Mar 2026 10:00" en timezone América/Costa_Rica.
 */
export function formatPreviewDate(date: Date): string {
  return date.toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
