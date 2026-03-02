// Tipos para el módulo Casetilla
export interface CreateCasetillaIngresoInput {
  chofer: string;
  matricula: string;
  dua: string;
  factura: string;
  orden_compra?: string;
  numero_pedido?: string;
  reservation_id?: string; // ✅ NUEVO: ID de reserva explícito
}

export interface CasetillaIngreso {
  id: string;
  org_id: string;
  chofer: string;
  matricula: string;
  dua: string;
  factura: string;
  orden_compra?: string | null;
  numero_pedido?: string | null;
  reservation_id?: string | null;
  created_by: string;
  created_at: string;
}

// Tipos para Salidas
export interface CasetillaSalida {
  id: string;
  org_id: string;
  reservation_id: string;
  chofer: string;
  matricula: string;
  dua?: string | null;
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
}
