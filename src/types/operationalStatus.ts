export interface OperationalStatus {
  id: string;
  org_id: string;
  name: string;
  code: string;
  color: string | null;
  order_index: number | null;
  is_active: boolean;
  created_at: string;
}