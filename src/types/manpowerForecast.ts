import type { ResourceCategoryType } from './manpowerResource';

export interface ForecastResourceAllocation {
  category_id: string;
  category_name: string;
  type: ResourceCategoryType;
  unit_label: string | null;
  /** Ritmo efectivo (unidades por hora) usado para el cálculo de duración */
  rate_per_hour: number | null;
  quantity: number;
}

/** Reserva mínima necesaria para el pronóstico (sin joins) */
export interface ForecastReservation {
  id: string;
  dock_id: string;
  start_datetime: string;
  end_datetime: string;
  cargo_type: string | null;
  quantity_value: number | null;
  shipper_provider: string | null;
  truck_plate: string | null;
  purchase_order: string | null;
}

export interface ReservationForecast {
  reservation: ForecastReservation;
  warehouse_id: string | null;
  warehouse_name: string | null;
  country_id: string | null;
  country_name: string | null;
  cargo_type_name: string | null;
  provider_name: string | null;
  bultos: number | null;
  matched: boolean;
  matched_rule_id: string | null;
  matched_rule_priority: number | null;
  match_reason: string | null;
  min_resources: ForecastResourceAllocation[];
  recommended_resources: ForecastResourceAllocation[];
  min_duration_hours: number | null;
  recommended_duration_hours: number | null;
  /** Rango de tiempo real seteado en la cita (end_datetime - start_datetime) en horas */
  appointment_duration_hours: number | null;
  /** true si la duración recomendada supera el tiempo real de la cita (posible error de cálculo) */
  duration_exceeds_appointment: boolean;
}

export interface DailyCategoryNeed {
  category_id: string;
  category_name: string;
  type: ResourceCategoryType;
  unit_label: string | null;
  needed_min: number;
  needed_rec: number;
  stock: number;
  /** true si existe un registro de recurso (stock) para esta categoría+país+almacén */
  stock_loaded: boolean;
  /** Faltante = max(0, needed_rec - stock) */
  deficit: number;
}

/** Resumen ligero de una reserva dentro de la agregación diaria (para sugerencias) */
export interface DailyReservationSummary {
  reservation_id: string;
  cargo_type_name: string | null;
  provider_name: string | null;
  bultos: number | null;
  /** Hora de inicio en el timezone del almacén (HH:MM) */
  time: string;
}

/** Necesidad de una categoría de recurso dentro de una franja horaria */
export interface DailyTimeBlockCategory {
  category_id: string;
  category_name: string;
  type: ResourceCategoryType;
  unit_label: string | null;
  needed_min: number;
  needed_rec: number;
  stock: number;
  stock_loaded: boolean;
  deficit: number;
}

/** Sugerencia de sustitución de recurso cuando hay faltante de stock */
export interface CategorySubstitution {
  from_category_id: string;
  from_category_name: string;
  /** Cantidad que falta y que se sugiere cubrir con el recurso de reemplazo */
  quantity: number;
  to_category_id: string | null;
  to_category_name: string;
}

/** Bloque de citas consecutivas dentro de un día (franja horaria) */
export interface DailyTimeBlock {
  id: string;
  start_time: string;
  end_time: string;
  label: string;
  reservation_count: number;
  total_bultos: number;
  peak_personas_min: number;
  peak_personas_rec: number;
  participaciones_min: number;
  participaciones_rec: number;
  categories: DailyTimeBlockCategory[];
  substitutions: CategorySubstitution[];
  reservations: DailyReservationSummary[];
}

export interface DailyWarehouseAggregation {
  date: string; // YYYY-MM-DD (en el timezone del almacén)
  date_label: string;
  warehouse_id: string;
  warehouse_name: string;
  country_id: string;
  country_name: string;
  reservation_count: number;
  total_bultos: number;
  min_duration_hours: number;
  recommended_duration_hours: number;
  peak_personas_min: number;
  peak_personas_rec: number;
  /** Total de participaciones (suma de personas en todas las citas del día) */
  participaciones_min: number;
  participaciones_rec: number;
  categories: DailyCategoryNeed[];
  substitutions: CategorySubstitution[];
  requires_external: boolean;
  external_reasons: string[];
  reservations: DailyReservationSummary[];
  blocks: DailyTimeBlock[];
}

export interface WeeklyCategoryNeed {
  category_id: string;
  category_name: string;
  type: ResourceCategoryType;
  unit_label: string | null;
  needed_min: number;
  needed_rec: number;
  stock: number;
  stock_loaded: boolean;
  deficit: number;
}

export interface WeeklyWarehouseAggregation {
  week_start: string;
  week_end: string;
  week_label: string;
  warehouse_id: string;
  warehouse_name: string;
  country_name: string;
  reservation_count: number;
  total_bultos: number;
  min_duration_hours: number;
  recommended_duration_hours: number;
  peak_personas_min: number;
  peak_personas_rec: number;
  participaciones_min: number;
  participaciones_rec: number;
  categories: WeeklyCategoryNeed[];
  substitutions: CategorySubstitution[];
  requires_external: boolean;
}

export interface CalendarSuggestion {
  id: string;
  source_date: string;
  source_date_label: string;
  warehouse_id: string;
  warehouse_name: string;
  country_name: string;
  overload_type: 'deficit' | 'appointment_limit';
  reservations_to_move: DailyReservationSummary[];
  target_date: string | null;
  target_date_label: string | null;
  reason: string;
}

export interface ForecastConfig {
  id?: string;
  org_id: string;
  recommended_margin_pct: number;
  daily_appointment_limit: number | null;
}

export interface ForecastResult {
  config: ForecastConfig;
  reservations: ReservationForecast[];
  daily: DailyWarehouseAggregation[];
  weekly: WeeklyWarehouseAggregation[];
  warnings: string[];
  suggestions: CalendarSuggestion[];
  start_date: string;
  end_date: string;
}