/**
 * timezoneUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilidades centralizadas de timezone para el sistema SRO.
 *
 * REGLA DE ORO:
 *  - Los timestamps se guardan en UTC (ISO 8601) en la base de datos.
 *  - La UI siempre convierte desde UTC → timezone del almacén para mostrar.
 *  - Los inputs del usuario se interpretan como hora local del almacén → UTC al guardar.
 *  - NUNCA usar getHours(), setHours(), toTimeString() sin pasar por estas utilidades.
 *
 * Timezones soportados (escalable):
 *  - America/Costa_Rica  (UTC-6, sin DST)
 *  - America/Caracas     (UTC-4:30, sin DST)
 *  - Cualquier IANA timezone válida
 */

// ─── Catálogo de timezones soportados ────────────────────────────────────────

export interface SupportedTimezone {
  value: string;
  label: string;
  offset: string;
}

export const SUPPORTED_TIMEZONES: SupportedTimezone[] = [
  { value: 'America/Costa_Rica', label: 'Costa Rica (UTC-6)', offset: 'UTC-6' },
  { value: 'America/Caracas',    label: 'Venezuela (UTC-4:30)', offset: 'UTC-4:30' },
  { value: 'America/New_York',   label: 'Este EE.UU. (UTC-5/-4)', offset: 'UTC-5' },
  { value: 'America/Chicago',    label: 'Centro EE.UU. (UTC-6/-5)', offset: 'UTC-6' },
  { value: 'America/Denver',     label: 'Montaña EE.UU. (UTC-7/-6)', offset: 'UTC-7' },
  { value: 'America/Los_Angeles', label: 'Pacífico EE.UU. (UTC-8/-7)', offset: 'UTC-8' },
  { value: 'America/Bogota',     label: 'Colombia (UTC-5)', offset: 'UTC-5' },
  { value: 'America/Lima',       label: 'Perú (UTC-5)', offset: 'UTC-5' },
  { value: 'America/Santiago',   label: 'Chile (UTC-4/-3)', offset: 'UTC-4' },
  { value: 'America/Sao_Paulo',  label: 'Brasil (UTC-3/-2)', offset: 'UTC-3' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (UTC-3)', offset: 'UTC-3' },
  { value: 'America/Mexico_City', label: 'México Centro (UTC-6/-5)', offset: 'UTC-6' },
  { value: 'America/Panama',     label: 'Panamá (UTC-5)', offset: 'UTC-5' },
  { value: 'America/Guatemala',  label: 'Guatemala (UTC-6)', offset: 'UTC-6' },
  { value: 'America/Managua',    label: 'Nicaragua (UTC-6)', offset: 'UTC-6' },
  { value: 'America/Tegucigalpa', label: 'Honduras (UTC-6)', offset: 'UTC-6' },
  { value: 'America/El_Salvador', label: 'El Salvador (UTC-6)', offset: 'UTC-6' },
  { value: 'UTC',                label: 'UTC (UTC+0)', offset: 'UTC+0' },
];

export const DEFAULT_TIMEZONE = 'America/Costa_Rica';

// ─── Helper: obtener timezone de un almacén ──────────────────────────────────

/**
 * Retorna el timezone IANA del almacén.
 * Si no tiene timezone configurado, usa el default (America/Costa_Rica).
 */
export function getWarehouseTimezone(warehouse: { timezone?: string | null } | null | undefined): string {
  return warehouse?.timezone || DEFAULT_TIMEZONE;
}

// ─── Conversión UTC → timezone del almacén ───────────────────────────────────

/**
 * Convierte un Date (UTC) a un objeto con los componentes de fecha/hora
 * en el timezone especificado.
 *
 * @param dateUtc  Date object (se interpreta como UTC)
 * @param timezone IANA timezone string
 * @returns { year, month, day, hour, minute, second, weekday }
 */
export function getDatePartsInTimezone(
  dateUtc: Date,
  timezone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = fmt.formatToParts(dateUtc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  const hourRaw = parseInt(get('hour'), 10);
  // Intl puede devolver 24 en lugar de 0 para medianoche
  const hour = hourRaw === 24 ? 0 : hourRaw;

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

/**
 * Retorna la fecha en formato 'YYYY-MM-DD' según el timezone del almacén.
 * Útil para comparar días sin importar la TZ del browser.
 */
export function toWarehouseDateString(dateUtc: Date, timezone: string): string {
  return dateUtc.toLocaleDateString('en-CA', { timeZone: timezone }); // 'YYYY-MM-DD'
}

/**
 * Retorna la hora en formato 'HH:MM' según el timezone del almacén.
 */
export function toWarehouseTimeString(dateUtc: Date, timezone: string): string {
  const { hour, minute } = getDatePartsInTimezone(dateUtc, timezone);
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Formatea un Date UTC en el timezone del almacén con el patrón dado.
 * Usa Intl.DateTimeFormat para máxima compatibilidad.
 *
 * @param dateUtc   Date object
 * @param timezone  IANA timezone
 * @param options   Intl.DateTimeFormatOptions
 */
export function formatInWarehouseTimezone(
  dateUtc: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: timezone,
    ...options,
  }).format(dateUtc);
}

/**
 * Formatea hora en formato HH:MM en el timezone del almacén.
 */
export function formatTimeInWarehouseTimezone(dateUtc: Date, timezone: string): string {
  return formatInWarehouseTimezone(dateUtc, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ─── Conversión hora local del almacén → UTC ─────────────────────────────────

/**
 * Convierte una fecha/hora expresada en el timezone del almacén a un Date UTC.
 *
 * Estrategia: construir el ISO string como si fuera UTC, luego corregir el offset
 * real del timezone en ese instante (usando Intl para calcular el offset exacto).
 *
 * @param localDateStr  'YYYY-MM-DD'
 * @param localTimeStr  'HH:MM' o 'HH:MM:SS'
 * @param timezone      IANA timezone
 * @returns Date en UTC
 */
export function fromWarehouseLocalToUtc(
  localDateStr: string,
  localTimeStr: string,
  timezone: string
): Date {
  // Normalizar tiempo
  const timePart = localTimeStr.length === 5 ? `${localTimeStr}:00` : localTimeStr;
  const isoLocal = `${localDateStr}T${timePart}`;

  // Crear un Date "naive" (sin timezone info) — el browser lo interpreta como local
  // Pero nosotros necesitamos interpretarlo como si fuera `timezone`.
  // Usamos el truco de calcular el offset real del timezone en ese instante.

  // Paso 1: Crear un Date provisional en UTC (asumiendo que el string es UTC)
  const provisionalUtc = new Date(`${isoLocal}Z`);

  // Paso 2: Calcular qué hora muestra ese UTC en el timezone destino
  const partsInTz = getDatePartsInTimezone(provisionalUtc, timezone);

  // Paso 3: Calcular la diferencia entre lo que queremos (localDateStr/localTimeStr)
  // y lo que muestra el provisional
  const [wantYear, wantMonth, wantDay] = localDateStr.split('-').map(Number);
  const [wantHour, wantMinute] = localTimeStr.split(':').map(Number);

  const wantTotalMinutes = wantHour * 60 + wantMinute;
  const gotTotalMinutes = partsInTz.hour * 60 + partsInTz.minute;

  // Diferencia en minutos (puede ser negativa si el timezone está adelante de UTC)
  const diffMinutes = wantTotalMinutes - gotTotalMinutes;

  // Ajustar también si el día cambió (para timezones con offset grande)
  const wantDate = new Date(Date.UTC(wantYear, wantMonth - 1, wantDay));
  const gotDate = new Date(Date.UTC(partsInTz.year, partsInTz.month - 1, partsInTz.day));
  const dayDiffMs = wantDate.getTime() - gotDate.getTime();

  // Resultado: provisional + corrección de día + corrección de minutos
  return new Date(provisionalUtc.getTime() + dayDiffMs + diffMinutes * 60_000);
}

// ─── Inicio/fin de día en timezone ───────────────────────────────────────────

/**
 * Retorna el inicio del día (00:00:00) en el timezone dado, expresado como Date UTC.
 * Método robusto que no depende de la TZ del browser.
 */
export function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  const dateStr = toWarehouseDateString(date, timezone); // 'YYYY-MM-DD'
  return fromWarehouseLocalToUtc(dateStr, '00:00:00', timezone);
}

/**
 * Retorna el fin del día (23:59:59.999) en el timezone dado, expresado como Date UTC.
 */
export function getEndOfDayInTimezone(date: Date, timezone: string): Date {
  const dateStr = toWarehouseDateString(date, timezone);
  const endOfDay = fromWarehouseLocalToUtc(dateStr, '23:59:59', timezone);
  return new Date(endOfDay.getTime() + 999); // + 999ms
}

// ─── Comparación de días ─────────────────────────────────────────────────────

/**
 * Compara si dos Dates caen en el mismo día calendario en el timezone dado.
 * NO depende de la TZ del browser.
 */
export function isSameDayInTimezone(a: Date, b: Date, timezone: string): boolean {
  return toWarehouseDateString(a, timezone) === toWarehouseDateString(b, timezone);
}

/**
 * Retorna la hora actual en el timezone dado como un Date.
 * Útil para el indicador de "ahora" en el calendario.
 */
export function getNowInTimezone(timezone: string): Date {
  // Creamos un Date que representa "ahora" pero con los componentes de hora del timezone
  const now = new Date();
  const parts = getDatePartsInTimezone(now, timezone);
  // Retornamos el Date UTC real (no modificado), pero con los parts disponibles para cálculos
  // En realidad, para el indicador de "ahora" necesitamos el Date UTC real
  return now; // El Date UTC es correcto; los cálculos de posición usan getStartOfDayInTimezone
}

// ─── Cálculo de posición en el calendario ────────────────────────────────────

/**
 * Calcula la posición top (en px) de un evento en el calendario,
 * relativa al inicio del horario hábil del almacén.
 *
 * @param eventStart       Date UTC del inicio del evento
 * @param day              Date que representa el día en el calendario
 * @param businessStartMin Minutos desde medianoche del inicio del horario hábil (ej: 6*60=360)
 * @param pxPerMinute      Píxeles por minuto (ej: 60px / 60min = 1)
 * @param timezone         IANA timezone del almacén
 */
export function getEventTopPx(
  eventStart: Date,
  day: Date,
  businessStartMin: number,
  pxPerMinute: number,
  timezone: string
): number {
  const dayStart = getStartOfDayInTimezone(day, timezone);
  const minutesFromMidnight = (eventStart.getTime() - dayStart.getTime()) / 60_000;
  const minutesFromBusinessStart = minutesFromMidnight - businessStartMin;
  return minutesFromBusinessStart * pxPerMinute;
}

/**
 * Calcula la altura (en px) de un evento dado su duración.
 */
export function getEventHeightPx(
  eventStart: Date,
  eventEnd: Date,
  pxPerMinute: number
): number {
  const durationMinutes = (eventEnd.getTime() - eventStart.getTime()) / 60_000;
  return durationMinutes * pxPerMinute;
}

/**
 * Construye un Date UTC a partir de un día y minutos desde medianoche en el timezone dado.
 * Reemplaza el patrón: new Date(day); day.setHours(h, m, 0, 0)
 *
 * @param day              Date que representa el día
 * @param minutesFromMidnight Minutos desde medianoche en el timezone del almacén
 * @param timezone         IANA timezone
 */
export function buildDateFromMinutesInTimezone(
  day: Date,
  minutesFromMidnight: number,
  timezone: string
): Date {
  const dayStart = getStartOfDayInTimezone(day, timezone);
  return new Date(dayStart.getTime() + minutesFromMidnight * 60_000);
}

// ─── Weekday en timezone ─────────────────────────────────────────────────────

/**
 * Retorna el día de la semana (0=Dom, 6=Sáb) de un Date en el timezone dado.
 * Reemplaza date.getDay() que usa la TZ del browser.
 */
export function getWeekdayInTimezone(date: Date, timezone: string): number {
  return getDatePartsInTimezone(date, timezone).weekday;
}
