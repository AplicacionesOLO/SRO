// Tipos para el módulo Casetilla
export interface CreateCasetillaIngresoInput {
  chofer: string;
  matricula: string;
  dua: string;
  factura: string;
  cedula?: string;
  orden_compra?: string;
  numero_pedido?: string;
  observaciones?: string;
  reservation_id?: string;
  fotos?: string[];
}

export interface CasetillaIngreso {
  id: string;
  org_id: string;
  chofer: string;
  matricula: string;
  dua: string;
  factura: string;
  cedula?: string | null;
  orden_compra?: string | null;
  numero_pedido?: string | null;
  observaciones?: string | null;
  reservation_id?: string | null;
  fotos?: string[] | null;
  created_by: string;
  created_at: string;
}

// Reserva pendiente enriquecida (para pre-carga del formulario de ingreso)
export interface PendingReservation {
  id: string;
  // Campos que se mostrarán en la tabla
  dua: string;
  placa: string;
  chofer: string;
  orden_compra?: string;
  numero_pedido?: string;
  provider_name: string;
  warehouse_name: string;
  created_at: string;
  // Campos adicionales para pre-cargar el form de ingreso
  notes?: string | null;
  /** Fecha y hora de inicio de la cita (start_datetime de la reserva) */
  start_datetime?: string | null;
  /**
   * true si el cargo_type de la reserva contiene "Importado" (case-insensitive)
   * O si la reserva ya tiene un DUA cargado.
   * Determina si el campo DUA es obligatorio en el formulario de ingreso.
   */
  is_imported?: boolean;
  /** Nombre resuelto del cargo_type (para debug/display) */
  cargo_type_name?: string | null;
}

// Tipos para Salidas
export interface CasetillaSalida {
  id: string;
  org_id: string;
  reservation_id: string;
  chofer: string;
  matricula: string;
  dua?: string | null;
  fotos?: string[] | null;
  created_by: string;
  exit_at: string;
  created_at: string;
}

// Reserva elegible para registrar salida
export interface ExitEligibleReservation {
  id: string;
  dua?: string | null;
  matricula?: string | null;
  chofer?: string | null;
  proveedor?: string | null;
  almacen?: string | null;
  orden_compra?: string | null;
  fecha_ingreso?: string | null;
  warehouse_id?: string | null;
  warehouse_timezone?: string;
  provider_id?: string | null;
  provider_name?: string | null;
  warehouse_name?: string | null;
  /** Estado actual de la reserva — solo informativo, no determina elegibilidad */
  status_name?: string | null;
  status_code?: string | null;
  /** ID del status actual — necesario para el trigger de email en createSalida */
  status_id?: string | null;
}

// Reserva marcada como No arribó
export interface NoShowReservation {
  id: string;
  dua: string;
  placa: string;
  chofer: string;
  provider_name: string;
  warehouse_name: string;
  start_datetime: string;
  end_datetime: string;
  created_at: string;
  motivo: string;
}

// Fila del reporte de duración
export interface DurationReportRow {
  reservation_id: string;
  chofer: string;
  matricula: string;
  dua?: string | null;
  provider_name?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  ingreso_at: string;
  salida_at: string;
  duracion_minutos: number;
  duracion_formato: string; // formato "hh:mm"
  expected_duration_minutes?: number | null;
  expected_duration_formato?: string | null; // formato "hh:mm"
  duration_difference_minutes?: number | null;
  duration_difference_formato?: string | null; // ej: "+35 min", "-115 min", "0 min"
  fotos_ingreso?: string[] | null;
  fotos_salida?: string[] | null;
}

// Fila del reporte de distribución por proveedor
export interface ProviderDistributionRow {
  provider_name: string;
  provider_code?: string | null;
  client_name?: string | null;
  provider_type: string; // 'almacenaje' | 'pesado'
  citas_programadas: number;
  citas_con_in: number;
  citas_con_out: number;
  pendientes_out: number;
  tiempo_teorico_minutos: number;
  tiempo_teorico_formato: string; // "hh:mm"
  tiempo_real_minutos: number;
  tiempo_real_formato: string; // "hh:mm"
  diferencia_minutos: number;
  diferencia_formato: string; // "+35 min", "-115 min", "0 min"
  pct_teorico_total: number; // 0.0 - 1.0
  pct_real_total: number; // 0.0 - 1.0
  promedio_teorico_minutos: number;
  promedio_teorico_formato: string; // "hh:mm"
  promedio_real_minutos: number;
  promedio_real_formato: string; // "hh:mm"
}

// Fila del reporte global mensual de tiempos
export interface MonthlyGlobalTimeRow {
  month_label: string; // "YYYY-MM" o "Ene 2025"
  month_key: string; // "YYYY-MM" para ordenar
  citas_programadas: number;
  citas_con_in: number;
  citas_con_out: number;
  pendientes_out: number;
  tiempo_teorico_minutos: number;
  tiempo_teorico_formato: string;
  tiempo_real_minutos: number;
  tiempo_real_formato: string;
  diferencia_minutos: number;
  diferencia_formato: string;
  pct_real_vs_teorico: number; // 0.0 - 1.0 (real / teorico)
  promedio_teorico_minutos: number;
  promedio_teorico_formato: string;
  promedio_real_minutos: number;
  promedio_real_formato: string;
}
