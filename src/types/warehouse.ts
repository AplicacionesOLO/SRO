export interface Warehouse {
  id: string;
  org_id: string;
  name: string;
  location?: string | null;
  country_id?: string | null;
  business_start_time?: string | null;
  business_end_time?: string | null;
  slot_interval_minutes?: number | null;
  timezone: string; // IANA timezone, e.g. 'America/Costa_Rica'
  no_show_tolerance_minutes?: number | null;
  /** Si está activo, las reservas importadas no se marcan automáticamente como No arribó. */
  no_show_exclude_imported?: boolean | null;
  created_at: string;
}

export interface WarehouseFormData {
  name: string;
  location?: string;
  country_id: string; 
  business_start_time: string;
  business_end_time: string;
  slot_interval_minutes: number;
  timezone: string; // IANA timezone
  no_show_tolerance_minutes?: number | null;
  /** Si está activo, las reservas importadas no se marcan automáticamente como No arribó. */
  no_show_exclude_imported?: boolean | null;
}
