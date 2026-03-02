export interface Client {
  id: string;
  org_id: string;
  name: string;
  legal_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientFormData {
  name: string;
  legal_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
}

export interface ClientRules {
  id: string;
  org_id: string;
  client_id: string;
  edit_cutoff_hours: number;
  allow_all_docks: boolean;
  dock_allocation_mode: string;
  created_at: string;
  updated_at: string;
}

export interface ClientRulesFormData {
  edit_cutoff_hours: number;
  allow_all_docks: boolean;
  dock_allocation_mode: string;
}

export interface ClientDock {
  id: string;
  org_id: string;
  client_id: string;
  dock_id: string;
  created_at: string;
}

export interface ClientProvider {
  id: string;
  org_id: string;
  client_id: string;
  provider_id: string;
  is_default: boolean;
  created_at: string;
}

export interface ClientProviderPayload {
  provider_id: string;
  is_default?: boolean;
}
