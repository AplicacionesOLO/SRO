export interface Collaborator {
  id: string;
  org_id: string;
  country_id: string;
  full_name: string;
  ficha?: string;
  cedula?: string;
  work_type_id: string;
  is_active: boolean;
  created_at: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
  // Relaciones
  country?: {
    id: string;
    name: string;
  };
  work_type?: {
    id: string;
    name: string;
  };
  warehouses?: Array<{
    id: string;
    name: string;
  }>;
}

export interface CollaboratorWarehouse {
  id: string;
  org_id: string;
  collaborator_id: string;
  warehouse_id: string;
  created_at: string;
  created_by?: string;
}

export interface WorkType {
  id: string;
  org_id: string;
  name: string;
  active: boolean;
}

export interface CollaboratorFormData {
  full_name: string;
  ficha?: string;
  cedula?: string;
  country_id: string;
  work_type_id: string;
  is_active: boolean;
  warehouse_ids: string[];
}
