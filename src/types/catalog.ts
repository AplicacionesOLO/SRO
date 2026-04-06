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

export interface CargoType {
  id: string;
  org_id: string;
  name: string;
  default_minutes?: number;
  active: boolean;
  is_dynamic?: boolean;
  is_active?: boolean;
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
  avg_minutes: number;
  warehouse_id?: string | null;
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
