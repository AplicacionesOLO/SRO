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
}

// Fila del reporte de duración
export interface DurationReportRow {
  reservation_id: string;
  chofer: string;
  matricula: string;
  dua?: string | null;
  ingreso_at: string;
  salida_at: string;
  duracion_minutos: number;
  duracion_formato: string; // formato "hh:mm"
  fotos_ingreso?: string[] | null;
  fotos_salida?: string[] | null;
}
