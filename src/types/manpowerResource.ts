export type ResourceCategoryType = 'PERSONAL' | 'EQUIPMENT';
export type ResourceStatus = 'ACTIVO' | 'MANTENIMIENTO' | 'INACTIVO';

export interface ResourceCategory {
  id: string;
  org_id: string;
  name: string;
  type: ResourceCategoryType;
  unit_label?: string | null;
  rate_per_hour?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface ManpowerResource {
  id: string;
  org_id: string;
  category_id: string;
  country_id: string;
  warehouse_id: string;
  quantity: number;
  rate_per_hour?: number | null;
  status: ResourceStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  // Relaciones enriquecidas
  category?: ResourceCategory;
  country?: { id: string; name: string };
  warehouse?: { id: string; name: string };
}

export interface ResourceCategoryFormData {
  name: string;
  type: ResourceCategoryType;
  unit_label?: string;
  rate_per_hour?: number | null;
  is_active: boolean;
}

export interface ManpowerResourceFormData {
  category_id: string;
  country_id: string;
  warehouse_id: string;
  quantity: number;
  rate_per_hour?: number | null;
  status: ResourceStatus;
  notes?: string;
}