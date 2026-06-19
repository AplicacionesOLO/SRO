export interface OrigenProveedor {
  id: string;
  org_id: string;
  source_code: string;
  client_id: string | null;
  description: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}