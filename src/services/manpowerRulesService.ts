import { supabase } from '@/lib/supabase';
import type {
  ManpowerRule,
  ManpowerRuleFormData,
  ManpowerRuleItem,
} from '@/types/manpowerRule';
import type { ResourceCategory } from '@/types/manpowerResource';

export const manpowerRulesService = {
  // ============================================================
  // LECTURA
  // ============================================================
  async getRules(
    orgId: string,
    filters?: { countryId?: string; warehouseId?: string; cargoTypeId?: string }
  ): Promise<ManpowerRule[]> {
    let q = supabase
      .from('manpower_resource_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (filters?.countryId) q = q.eq('country_id', filters.countryId);
    if (filters?.warehouseId) q = q.eq('warehouse_id', filters.warehouseId);
    if (filters?.cargoTypeId) q = q.eq('cargo_type_id', filters.cargoTypeId);

    const { data, error } = await q;
    if (error) throw new Error(`Error al cargar reglas: ${error.message}`);

    return this._enrich(orgId, (data ?? []) as ManpowerRule[]);
  },

  // ============================================================
  // CREAR / ACTUALIZAR / ELIMINAR
  // ============================================================
  async createRule(
    orgId: string,
    userId: string,
    data: ManpowerRuleFormData
  ): Promise<ManpowerRule> {
    const { data: inserted, error } = await supabase
      .from('manpower_resource_rules')
      .insert({
        org_id: orgId,
        country_id: data.country_id,
        warehouse_id: data.warehouse_id,
        cargo_type_id: data.cargo_type_id,
        min_bultos: data.min_bultos,
        max_bultos: data.max_bultos,
        provider_id: data.provider_id,
        is_active: data.is_active,
        priority: data.priority,
        notes: data.notes?.trim() || null,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Error al crear la regla: ${error.message}`);

    const rule = inserted as ManpowerRule;
    await this._replaceItems(orgId, userId, rule.id, data.items);

    const [enriched] = await this._enrich(orgId, [rule]);
    return enriched;
  },

  async updateRule(
    orgId: string,
    userId: string,
    ruleId: string,
    data: ManpowerRuleFormData
  ): Promise<ManpowerRule> {
    const { data: updated, error } = await supabase
      .from('manpower_resource_rules')
      .update({
        country_id: data.country_id,
        warehouse_id: data.warehouse_id,
        cargo_type_id: data.cargo_type_id,
        min_bultos: data.min_bultos,
        max_bultos: data.max_bultos,
        provider_id: data.provider_id,
        is_active: data.is_active,
        priority: data.priority,
        notes: data.notes?.trim() || null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ruleId)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (error) throw new Error(`Error al actualizar la regla: ${error.message}`);

    const rule = updated as ManpowerRule;
    await this._replaceItems(orgId, userId, rule.id, data.items);

    const [enriched] = await this._enrich(orgId, [rule]);
    return enriched;
  },

  async deleteRule(orgId: string, ruleId: string): Promise<void> {
    const { error } = await supabase
      .from('manpower_resource_rules')
      .delete()
      .eq('id', ruleId)
      .eq('org_id', orgId);

    if (error) throw new Error(`Error al eliminar la regla: ${error.message}`);
  },

  // ============================================================
  // ITEMS
  // ============================================================
  async _replaceItems(
    orgId: string,
    userId: string,
    ruleId: string,
    items: ManpowerRuleFormData['items']
  ): Promise<void> {
    await supabase
      .from('manpower_resource_rule_items')
      .delete()
      .eq('rule_id', ruleId)
      .eq('org_id', orgId);

    const validItems = items.filter((i) => i.category_id && i.quantity >= 0);
    if (validItems.length === 0) return;

    const rows = validItems.map((i) => ({
      org_id: orgId,
      rule_id: ruleId,
      category_id: i.category_id,
      quantity: i.quantity,
      created_by: userId,
    }));

    const { error } = await supabase
      .from('manpower_resource_rule_items')
      .insert(rows);

    if (error) throw new Error(`Error al guardar recursos de la regla: ${error.message}`);
  },

  // ============================================================
  // ENRIQUECIMIENTO (evita joins anidados / problemas de RLS)
  // ============================================================
  async _enrich(orgId: string, rules: ManpowerRule[]): Promise<ManpowerRule[]> {
    if (!rules.length) return rules;

    const ruleIds = rules.map((r) => r.id);
    const countryIds = Array.from(new Set(rules.map((r) => r.country_id)));
    const warehouseIds = Array.from(new Set(rules.map((r) => r.warehouse_id)));
    const cargoTypeIds = Array.from(new Set(rules.map((r) => r.cargo_type_id)));
    const providerIds = Array.from(new Set(rules.map((r) => r.provider_id).filter(Boolean) as string[]));

    const [items, countries, warehouses, cargoTypes, providers] = await Promise.all([
      supabase
        .from('manpower_resource_rule_items')
        .select('*')
        .eq('org_id', orgId)
        .in('rule_id', ruleIds)
        .then((r) => r.data ?? []),
      countryIds.length
        ? supabase.from('countries').select('id, name').in('id', countryIds).then((r) => r.data ?? [])
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      warehouseIds.length
        ? supabase.from('warehouses').select('id, name').in('id', warehouseIds).then((r) => r.data ?? [])
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      cargoTypeIds.length
        ? supabase.from('cargo_types').select('id, name').in('id', cargoTypeIds).then((r) => r.data ?? [])
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      providerIds.length
        ? supabase.from('providers').select('id, name').in('id', providerIds).then((r) => r.data ?? [])
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);

    const itemCategoryIds = Array.from(
      new Set((items as ManpowerRuleItem[]).map((i) => i.category_id))
    );

    const categories: ResourceCategory[] = itemCategoryIds.length
      ? await supabase
          .from('manpower_resource_categories')
          .select('*')
          .in('id', itemCategoryIds)
          .then((r) => (r.data ?? []) as ResourceCategory[])
      : [];

    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const countryMap = new Map(countries.map((c) => [c.id, c]));
    const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
    const cargoTypeMap = new Map(cargoTypes.map((c) => [c.id, c]));
    const providerMap = new Map(providers.map((p) => [p.id, p]));

    const itemsByRule = new Map<string, ManpowerRuleItem[]>();
    for (const item of items as ManpowerRuleItem[]) {
      const enrichedItem = { ...item, category: categoryMap.get(item.category_id) };
      if (!itemsByRule.has(item.rule_id)) itemsByRule.set(item.rule_id, []);
      itemsByRule.get(item.rule_id)!.push(enrichedItem);
    }

    return rules.map((r) => ({
      ...r,
      country: countryMap.get(r.country_id),
      warehouse: warehouseMap.get(r.warehouse_id),
      cargo_type: cargoTypeMap.get(r.cargo_type_id),
      provider: r.provider_id ? providerMap.get(r.provider_id) : undefined,
      items: itemsByRule.get(r.id) ?? [],
    }));
  },
};