import { supabase } from '@/lib/supabase';
import type {
  ResourceCategory,
  ResourceCategoryFormData,
  ManpowerResource,
  ManpowerResourceFormData,
} from '@/types/manpowerResource';

export const DEFAULT_RESOURCE_CATEGORIES: Array<{
  name: string;
  type: ResourceCategoryFormData['type'];
  unit_label: string;
  rate_per_hour: number;
}> = [
  { name: 'Personal', type: 'PERSONAL', unit_label: 'personas', rate_per_hour: 8 },
  { name: 'Montacargas', type: 'EQUIPMENT', unit_label: 'unidades', rate_per_hour: 30 },
  { name: 'Apilador', type: 'EQUIPMENT', unit_label: 'unidades', rate_per_hour: 20 },
  { name: 'Carretilla eléctrica', type: 'EQUIPMENT', unit_label: 'unidades', rate_per_hour: 25 },
  { name: 'Carretilla manual', type: 'EQUIPMENT', unit_label: 'unidades', rate_per_hour: 10 },
];

export const manpowerResourcesService = {
  // ============================================================
  // CATEGORÍAS
  // ============================================================
  async getCategories(orgId: string, includeInactive = false): Promise<ResourceCategory[]> {
    let q = supabase
      .from('manpower_resource_categories')
      .select('*')
      .eq('org_id', orgId)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (!includeInactive) q = q.eq('is_active', true);

    const { data, error } = await q;
    if (error) throw new Error(`Error al cargar categorías: ${error.message}`);
    return (data ?? []) as ResourceCategory[];
  },

  async createCategory(
    orgId: string,
    userId: string,
    data: ResourceCategoryFormData
  ): Promise<ResourceCategory> {
    const { data: inserted, error } = await supabase
      .from('manpower_resource_categories')
      .insert({
        org_id: orgId,
        name: data.name.trim(),
        type: data.type,
        unit_label: data.unit_label?.trim() || null,
        rate_per_hour: data.rate_per_hour ?? null,
        is_active: data.is_active,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Error al crear la categoría: ${error.message}`);
    return inserted as ResourceCategory;
  },

  async updateCategory(
    orgId: string,
    userId: string,
    categoryId: string,
    data: ResourceCategoryFormData
  ): Promise<ResourceCategory> {
    const { data: updated, error } = await supabase
      .from('manpower_resource_categories')
      .update({
        name: data.name.trim(),
        type: data.type,
        unit_label: data.unit_label?.trim() || null,
        rate_per_hour: data.rate_per_hour ?? null,
        is_active: data.is_active,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (error) throw new Error(`Error al actualizar la categoría: ${error.message}`);
    return updated as ResourceCategory;
  },

  async deleteCategory(orgId: string, categoryId: string): Promise<void> {
    const { error } = await supabase
      .from('manpower_resource_categories')
      .delete()
      .eq('id', categoryId)
      .eq('org_id', orgId);

    if (error) throw new Error(`Error al eliminar la categoría: ${error.message}`);
  },

  async seedDefaultCategories(orgId: string, userId: string): Promise<void> {
    const rows = DEFAULT_RESOURCE_CATEGORIES.map((c) => ({
      org_id: orgId,
      name: c.name,
      type: c.type,
      unit_label: c.unit_label,
      rate_per_hour: c.rate_per_hour,
      is_active: true,
      created_by: userId,
    }));

    const { error } = await supabase
      .from('manpower_resource_categories')
      .insert(rows);

    if (error) throw new Error(`Error al cargar categorías estándar: ${error.message}`);
  },

  // ============================================================
  // RECURSOS (pool por país + almacén)
  // ============================================================
  async getResources(
    orgId: string,
    filters?: { categoryId?: string; countryId?: string; warehouseId?: string }
  ): Promise<ManpowerResource[]> {
    let q = supabase
      .from('manpower_resources')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (filters?.categoryId) q = q.eq('category_id', filters.categoryId);
    if (filters?.countryId) q = q.eq('country_id', filters.countryId);
    if (filters?.warehouseId) q = q.eq('warehouse_id', filters.warehouseId);

    const { data, error } = await q;
    if (error) throw new Error(`Error al cargar recursos: ${error.message}`);

    const resources = (data ?? []) as ManpowerResource[];
    return this._enrich(orgId, resources);
  },

  async createResource(
    orgId: string,
    userId: string,
    data: ManpowerResourceFormData
  ): Promise<ManpowerResource> {
    const { data: inserted, error } = await supabase
      .from('manpower_resources')
      .insert({
        org_id: orgId,
        category_id: data.category_id,
        country_id: data.country_id,
        warehouse_id: data.warehouse_id,
        quantity: data.quantity,
        rate_per_hour: data.rate_per_hour ?? null,
        status: data.status,
        notes: data.notes?.trim() || null,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) {
      if (String(error.message).includes('duplicate') || error.code === '23505') {
        throw new Error('Ya existe un registro de ese recurso para el mismo país y almacén.');
      }
      throw new Error(`Error al crear el recurso: ${error.message}`);
    }

    const [enriched] = await this._enrich(orgId, [inserted as ManpowerResource]);
    return enriched;
  },

  async updateResource(
    orgId: string,
    userId: string,
    resourceId: string,
    data: ManpowerResourceFormData
  ): Promise<ManpowerResource> {
    const { data: updated, error } = await supabase
      .from('manpower_resources')
      .update({
        category_id: data.category_id,
        country_id: data.country_id,
        warehouse_id: data.warehouse_id,
        quantity: data.quantity,
        rate_per_hour: data.rate_per_hour ?? null,
        status: data.status,
        notes: data.notes?.trim() || null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resourceId)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (error) {
      if (String(error.message).includes('duplicate') || error.code === '23505') {
        throw new Error('Ya existe un registro de ese recurso para el mismo país y almacén.');
      }
      throw new Error(`Error al actualizar el recurso: ${error.message}`);
    }

    const [enriched] = await this._enrich(orgId, [updated as ManpowerResource]);
    return enriched;
  },

  async deleteResource(orgId: string, resourceId: string): Promise<void> {
    const { error } = await supabase
      .from('manpower_resources')
      .delete()
      .eq('id', resourceId)
      .eq('org_id', orgId);

    if (error) throw new Error(`Error al eliminar el recurso: ${error.message}`);
  },

  // ============================================================
  // Enriquecimiento (evita joins anidados / problemas de RLS)
  // ============================================================
  async _enrich(orgId: string, resources: ManpowerResource[]): Promise<ManpowerResource[]> {
    if (!resources.length) return resources;

    const categoryIds = Array.from(new Set(resources.map((r) => r.category_id)));
    const countryIds = Array.from(new Set(resources.map((r) => r.country_id)));
    const warehouseIds = Array.from(new Set(resources.map((r) => r.warehouse_id)));

    const [categories, countries, warehouses] = await Promise.all([
      categoryIds.length
        ? supabase.from('manpower_resource_categories').select('*').in('id', categoryIds).then((r) => r.data ?? [])
        : Promise.resolve([] as ResourceCategory[]),
      countryIds.length
        ? supabase.from('countries').select('id, name').in('id', countryIds).then((r) => r.data ?? [])
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      warehouseIds.length
        ? supabase.from('warehouses').select('id, name').in('id', warehouseIds).then((r) => r.data ?? [])
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const countryMap = new Map(countries.map((c) => [c.id, c]));
    const whMap = new Map(warehouses.map((w) => [w.id, w]));

    return resources.map((r) => ({
      ...r,
      category: catMap.get(r.category_id),
      country: countryMap.get(r.country_id),
      warehouse: whMap.get(r.warehouse_id),
    }));
  },
};