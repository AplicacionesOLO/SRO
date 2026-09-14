import type { ResourceCategory } from './manpowerResource';

export interface ManpowerRuleItem {
  id: string;
  org_id: string;
  rule_id: string;
  category_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  // Relación enriquecida
  category?: ResourceCategory;
}

export interface ManpowerRule {
  id: string;
  org_id: string;
  country_id: string;
  warehouse_id: string;
  cargo_type_id: string;
  min_bultos: number | null;
  max_bultos: number | null;
  provider_id: string | null;
  is_active: boolean;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  // Relaciones enriquecidas
  country?: { id: string; name: string };
  warehouse?: { id: string; name: string };
  cargo_type?: { id: string; name: string };
  provider?: { id: string; name: string };
  items?: ManpowerRuleItem[];
}

export interface ManpowerRuleItemInput {
  category_id: string;
  quantity: number;
}

export interface ManpowerRuleFormData {
  country_id: string;
  warehouse_id: string;
  cargo_type_id: string;
  min_bultos: number | null;
  max_bultos: number | null;
  provider_id: string | null;
  is_active: boolean;
  priority: number;
  notes: string;
  items: ManpowerRuleItemInput[];
}