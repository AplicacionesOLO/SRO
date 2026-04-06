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
}
