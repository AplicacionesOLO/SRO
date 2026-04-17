export interface Provider {
  id: string;
  org_id: string;
  name: string;
  active: boolean;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

/**
 * Provider enriquecido con los clientes asociados en el contexto de un almacén específico.
 * Extiende Provider sin romper compatibilidad con código existente.
 */
export interface ProviderWithClients extends Provider {
  /** Nombres de los clientes vinculados a este proveedor en el almacén activo */
  clientNames: string[];
}

export interface CargoType {
  id: string;
  org_id: string;
  name: string;
  default_minutes?: number;
  active: boolean;
  is_dynamic?: boolean;
  is_active?: boolean;
  /** Clave de la unidad de medida para tipos dinámicos: 'lines', 'pallets', 'bultos', 'weight_kg', etc. */
  measurement_key?: string | null;
  /** Etiqueta legible que se muestra en el formulario de reserva. Ej: "Cantidad de líneas" */
  unit_label?: string | null;
  /**
   * Segundos por unidad para cálculo dinámico del tipo de carga.
   * Fórmula: duration_minutes = ceil((seconds_per_unit * quantity) / 60)
   * Se puede sobreescribir a nivel de perfil proveedor×tipo.
   */
  seconds_per_unit?: number | null;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface ProviderCargoTimeProfile {
  id: string;
  org_id: string;
  provider_id: string;
  cargo_type_id: string;
  /** Minutos fijos para tipos NO dinámicos. Se mantiene siempre para retrocompatibilidad. */
  avg_minutes: number;
  warehouse_id?: string | null;
  /** Minutos base para tipos dinámicos (legacy fase 1). */
  base_minutes?: number | null;
  /** Minutos por unidad (legacy fase 1). */
  minutes_per_unit?: number | null;
  /**
   * Segundos por unidad a nivel de perfil proveedor×tipo.
   * Sobreescribe el seconds_per_unit del cargo_type para esta combinación específica.
   * Fórmula: duration_minutes = ceil((seconds_per_unit * quantity) / 60)
   */
  seconds_per_unit?: number | null;
  p90_minutes?: number;
  sample_size?: number;
  source?: string;
  confidence?: string;
  last_observed_at?: string;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}
