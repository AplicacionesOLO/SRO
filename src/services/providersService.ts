import { supabase } from '../lib/supabase';
import type { Provider, ProviderWithClients } from '../types/catalog';

export interface SyncProviderPayload {
  code: string;
  name: string;
  short_name?: string;
  provider_type?: 'almacenaje' | 'pesado';
}

export interface SyncProviderResult {
  summary: {
    total_api: number;
    matched: number;
    updated: number;
    created: number;
    deactivated: number;
    preserved: number;
    errors: number;
  };
  details: {
    matched: any[];
    created: any[];
    updated: any[];
    deactivated: any[];
    preserved: any[];
    errors: any[];
  };
}

// ── Mapeo source → client_id (usado como fallback en UI y para autodetectar) ──
const SOURCE_TO_CLIENT_MAP: Record<string, { id: string; name: string }> = {
  '029': { id: 'ae488aaf-706a-46fa-9251-d00a35e78384', name: 'COFERSA' },
  '0029': { id: 'ae488aaf-706a-46fa-9251-d00a35e78384', name: 'COFERSA' },
  'COFERSA': { id: 'ae488aaf-706a-46fa-9251-d00a35e78384', name: 'COFERSA' },
  '0109': { id: 'f897b0e2-721f-498d-a5d2-800dd3755139', name: 'EPA' },
  'EPA': { id: 'f897b0e2-721f-498d-a5d2-800dd3755139', name: 'EPA' },
};

function resolveClientBySource(source: string | null | undefined): { id: string; name: string } | null {
  if (!source) return null;
  const normalized = source.trim().toUpperCase();
  return SOURCE_TO_CLIENT_MAP[normalized] ?? null;
}

export const providersService = {
  /**
   * Contar reservas de un proveedor (shipper_provider + reservation_consolidated_providers).
   */
  async getReservationCount(orgId: string, providerId: string): Promise<number> {
    const { count: resCount } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('shipper_provider', providerId);

    const { count: consCount } = await supabase
      .from('reservation_consolidated_providers')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId);

    return (resCount || 0) + (consCount || 0);
  },

  /**
   * Resolver cliente automáticamente por source.
   * Exportado para uso en componentes UI.
   */
  resolveClientBySource,

  /**
   * Sincronizar proveedores desde API externa.
   * Invoca la Edge Function sync-providers.
   */
  async syncProviders(
    orgId: string,
    source: string,
    clientId: string,
    providers: SyncProviderPayload[]
  ): Promise<SyncProviderResult> {
    const { data, error } = await supabase.functions.invoke('sync-providers', {
      body: {
        org_id: orgId,
        source: source,
        client_id: clientId,
        providers: providers,
      },
    });

    if (error) throw error;
    return data as SyncProviderResult;
  },

  async getAll(orgId: string): Promise<Provider[]> {
    const pageSize = 1000;
    let from = 0;
    let allProviders: Provider[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('providers')
        .select('id, org_id, name, active, provider_type, provider_code, source, client_id, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      allProviders = allProviders.concat(data ?? []);
      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    return allProviders;
  },

  async getActive(orgId: string): Promise<Provider[]> {
    const pageSize = 1000;
    let from = 0;
    let allProviders: Provider[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('providers')
        .select('id, org_id, name, active, provider_type, provider_code, source, client_id, created_at')
        .eq('org_id', orgId)
        .eq('active', true)
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      allProviders = allProviders.concat(data ?? []);
      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    return allProviders;
  },

  /**
   * Paginación server-side: obtener proveedores de la org con count total.
   * Si searchTerm se proporciona, filtra por nombre, código o origen (ilike).
   */
  async getAllPaginated(
    orgId: string,
    page: number,
    pageSize: number,
    searchTerm?: string
  ): Promise<{ data: Provider[]; total: number; totalPages: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('providers')
      .select('id, org_id, name, active, provider_type, provider_code, source, client_id, created_at', { count: 'exact' })
      .eq('org_id', orgId);

    if (searchTerm && searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`name.ilike.${term},provider_code.ilike.${term},source.ilike.${term}`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    const total = count ?? 0;
    return { data: data ?? [], total, totalPages: Math.ceil(total / pageSize) };
  },

  /**
   * Paginación server-side: obtener proveedores activos de la org con count total.
   * Si searchTerm se proporciona, filtra por nombre, código o origen (ilike).
   */
  async getActivePaginated(
    orgId: string,
    page: number,
    pageSize: number,
    searchTerm?: string
  ): Promise<{ data: Provider[]; total: number; totalPages: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('providers')
      .select('id, org_id, name, active, provider_type, provider_code, source, client_id, created_at', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('active', true);

    if (searchTerm && searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`name.ilike.${term},provider_code.ilike.${term},source.ilike.${term}`);
    }

    const { data, error, count } = await query
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw error;
    const total = count ?? 0;
    return { data: data ?? [], total, totalPages: Math.ceil(total / pageSize) };
  },

  async createProvider(orgId: string, name: string, providerType: 'almacenaje' | 'pesado' = 'almacenaje', providerCode?: string | null, source?: string | null, clientId?: string | null): Promise<Provider> {
    const normalizedName = name.trim().toUpperCase();
    const normalizedCode = providerCode?.trim().toUpperCase() || null;
    const normalizedSource = source?.trim().toUpperCase() || null;
    // Auto-detectar cliente por source si no se proporcionó clientId
    const autoClient = clientId ? null : resolveClientBySource(normalizedSource);
    const finalClientId = clientId || autoClient?.id || null;
    
    const { data, error } = await supabase
      .from('providers')
      .insert({
        org_id: orgId,
        name: normalizedName,
        active: true,
        provider_type: providerType,
        provider_code: normalizedCode,
        source: normalizedSource,
        client_id: finalClientId,
      })
      .select('id, org_id, name, active, provider_type, provider_code, source, client_id, created_at')
      .single();

    if (error) throw error;
    return data;
  },

  async updateProvider(id: string, updates: Partial<Pick<Provider, 'name' | 'active' | 'provider_type' | 'provider_code' | 'source' | 'client_id'>>): Promise<Provider> {
    const normalized: any = { ...updates };
    if (updates.name !== undefined) normalized.name = updates.name.trim().toUpperCase();
    if (updates.provider_code !== undefined) normalized.provider_code = updates.provider_code?.trim().toUpperCase() || null;
    if (updates.source !== undefined) {
      normalized.source = updates.source?.trim().toUpperCase() || null;
      // Si cambió el source y no hay client_id, autodetectar
      if (normalized.source && !normalized.client_id) {
        const autoClient = resolveClientBySource(normalized.source);
        if (autoClient) normalized.client_id = autoClient.id;
      }
    }
    
    const { data, error } = await supabase
      .from('providers')
      .update(normalized)
      .eq('id', id)
      .select('id, org_id, name, active, provider_type, provider_code, source, client_id, created_at')
      .single();

    if (error) throw error;
    return data;
  },

  async deleteProvider(id: string): Promise<void> {
    const { error } = await supabase
      .from('providers')
      .update({ active: false })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Obtener proveedores filtrados por almacén activo.
   * Si warehouseId es null → devuelve todos los de la org (acceso global).
   *
   * IMPORTANTE: usa !inner solo cuando hay warehouseId específico, para garantizar
   * que solo aparezcan proveedores realmente asignados a ese almacén.
   * Con warehouseId null devuelve todos (incluyendo los sin almacén asignado).
   */
  async getByWarehouse(orgId: string, warehouseId: string | null, activeOnly = false): Promise<Provider[]> {
    if (!warehouseId) {
      // Acceso global: devolver todos los proveedores de la org
      return activeOnly ? this.getActive(orgId) : this.getAll(orgId);
    }

    // JOIN directo con !inner: evita pasar cientos de IDs en la URL (causa 400 Bad Request)
    // y garantiza que solo aparezcan proveedores asignados a este almacén específico.
    // Paginado en bloques de 1000 para orgs con >1000 proveedores por almacén.
    const pageSize = 1000;
    let from = 0;
    let allProviders: Provider[] = [];

    while (true) {
      let query = supabase
        .from('providers')
        .select('id, org_id, name, active, provider_type, provider_code, source, client_id, created_at, provider_warehouses!inner(warehouse_id)')
        .eq('org_id', orgId)
        .eq('provider_warehouses.warehouse_id', warehouseId)
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1);

      if (activeOnly) {
        query = query.eq('active', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      const page = (data ?? []).map(({ provider_warehouses: _pw, ...p }: any) => p as Provider);
      allProviders = allProviders.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    return allProviders;
  },

  /**
   * Obtener los warehouse IDs asignados a un proveedor.
   */
  async getProviderWarehouses(orgId: string, providerId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('provider_warehouses')
      .select('warehouse_id')
      .eq('org_id', orgId)
      .eq('provider_id', providerId);

    if (error) throw error;
    return (data ?? []).map((r: any) => r.warehouse_id as string);
  },

  /**
   * Asignar un proveedor a uno o varios almacenes (reemplaza asignaciones previas).
   */
  async setProviderWarehouses(orgId: string, providerId: string, warehouseIds: string[]): Promise<void> {
    // Eliminar asignaciones previas
    const { error: delErr } = await supabase
      .from('provider_warehouses')
      .delete()
      .eq('org_id', orgId)
      .eq('provider_id', providerId);

    if (delErr) throw delErr;

    if (warehouseIds.length === 0) return;

    const { error: insErr } = await supabase
      .from('provider_warehouses')
      .insert(warehouseIds.map(wid => ({ org_id: orgId, provider_id: providerId, warehouse_id: wid })));

    if (insErr) throw insErr;
  },

  /**
   * Obtener las asignaciones almacén→clientes de una lista de proveedores.
   * Retorna un mapa: providerId → texto legible "Almacén: (Cliente1, Cliente2) / Almacén2: ..."
   *
   * ⚠️ IMPORTANTE: No usa .in('provider_id', providerIds) para evitar 414 URI Too Long
   * con orgs que tienen cientos de proveedores. Se traen todos los registros de la org
   * y se filtra en memoria contra el Set de IDs. URLs siempre de tamaño fijo.
   */
  async getProviderAssignments(orgId: string, providerIds: string[]): Promise<Record<string, string>> {
    if (providerIds.length === 0) return {};

    const providerSet = new Set(providerIds);

    // 1. Traer TODOS los provider_warehouses de la org — paginado (2,622+ filas, el default de 1,000 no alcanza)
    const pageSize = 1000;
    let from = 0;
    let allPwRows: any[] = [];

    while (true) {
      const { data, error: pwErr } = await supabase
        .from('provider_warehouses')
        .select('provider_id, warehouse_id, warehouses(name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (pwErr) throw pwErr;
      allPwRows = allPwRows.concat(data ?? []);
      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    // Filtrar en memoria: solo los proveedores que nos importan
    const pwRows = allPwRows.filter((r: any) => providerSet.has(r.provider_id));

    // 2. Traer TODOS los client_providers de la org — paginado (5,246+ filas, el default de 1,000 no alcanza)
    from = 0;
    let allCpRows: any[] = [];

    while (true) {
      const { data, error: cpErr } = await supabase
        .from('client_providers')
        .select('provider_id, client_id, clients(name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (cpErr) throw cpErr;
      allCpRows = allCpRows.concat(data ?? []);
      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    // Filtrar en memoria: solo los proveedores que nos importan
    const cpRows = allCpRows.filter((r: any) => providerSet.has(r.provider_id));

    // 3. Traer warehouse_clients para saber qué clientes pertenecen a qué almacén
    // Los almacenes son pocos (<50 típicamente) — .in(warehouseIds) es seguro aquí
    const warehouseIds = [...new Set(pwRows.map((r: any) => r.warehouse_id as string))];
    let wcRows: any[] = [];
    if (warehouseIds.length > 0) {
      const { data, error: wcErr } = await supabase
        .from('warehouse_clients')
        .select('warehouse_id, client_id')
        .eq('org_id', orgId)
        .in('warehouse_id', warehouseIds);
      if (wcErr) throw wcErr;
      wcRows = data ?? [];
    }

    // Índice: warehouse_id → Set<client_id>
    const warehouseToClients: Record<string, Set<string>> = {};
    for (const wc of wcRows) {
      if (!warehouseToClients[wc.warehouse_id]) warehouseToClients[wc.warehouse_id] = new Set();
      warehouseToClients[wc.warehouse_id].add(wc.client_id);
    }

    // Índice: client_id → client name (desde cpRows)
    const clientNames: Record<string, string> = {};
    for (const cp of (cpRows ?? [])) {
      if (cp.clients && cp.client_id) {
        clientNames[cp.client_id] = (cp.clients as any).name ?? cp.client_id;
      }
    }

    // Índice: provider_id → Set<client_id> (todos los clientes vinculados al proveedor)
    const providerToClients: Record<string, Set<string>> = {};
    for (const cp of (cpRows ?? [])) {
      if (!providerToClients[cp.provider_id]) providerToClients[cp.provider_id] = new Set();
      providerToClients[cp.provider_id].add(cp.client_id);
    }

    // Construir texto final por proveedor
    const result: Record<string, string> = {};

    for (const pid of providerIds) {
      const warehouses = (pwRows ?? []).filter((r: any) => r.provider_id === pid);

      if (warehouses.length === 0) {
        // Fallback: buscar cliente por source del provider (traído desde la BD)
        const { data: providerSources } = await supabase
          .from('providers')
          .select('source')
          .eq('id', pid)
          .maybeSingle();
        const autoClient = providerSources?.source ? resolveClientBySource(providerSources.source) : null;
        result[pid] = autoClient ? `Cliente: ${autoClient.name}` : 'Sin asignación';
        continue;
      }

      const providerClientIds = providerToClients[pid] ?? new Set();

      const parts: string[] = warehouses.map((pw: any) => {
        const warehouseName: string = (pw.warehouses as any)?.name ?? pw.warehouse_id;
        const wcClients = warehouseToClients[pw.warehouse_id] ?? new Set();

        // Clientes que están vinculados al proveedor Y pertenecen a este almacén
        const matchingClients = [...providerClientIds]
          .filter(cid => wcClients.has(cid))
          .map(cid => clientNames[cid] ?? cid)
          .sort();

        if (matchingClients.length > 0) {
          return `${warehouseName}: (${matchingClients.join(', ')})`;
        }
        return warehouseName;
      });

      result[pid] = parts.join(' / ');
    }

    return result;
  },

  /**
   * Obtener proveedores del almacén activo enriquecidos con sus clientes asociados
   * en ese mismo almacén.
   *
   * Clientes mostrados = intersección de:
   *   - client_providers (proveedor vinculado al cliente)
   *   - warehouse_clients (cliente pertenece al almacén)
   *
   * ⚠️ IMPORTANTE: No usa .in(providerIds) para evitar el error 414 URI Too Long
   * cuando hay muchos proveedores. Filtra en memoria usando el Set de IDs ya cargado.
   * Las 3 queries tienen URLs de tamaño fijo sin importar el volumen de datos.
   */
  async getByWarehouseWithClientContext(
    orgId: string,
    warehouseId: string
  ): Promise<ProviderWithClients[]> {
    // Query 1: Proveedores activos del almacén — usa !inner join (sin .in(), sin 414)
    const providers = await this.getByWarehouse(orgId, warehouseId, true);
    if (providers.length === 0) return [];

    const providerSet = new Set(providers.map(p => p.id));

    // Query 2: TODOS los client_providers de la org — sin .in() → URL fija, sin 414
    // Filtramos en memoria contra providerSet para quedarnos solo con los del almacén
    const { data: cpRows, error: cpErr } = await supabase
      .from('client_providers')
      .select('provider_id, client_id, clients(name)')
      .eq('org_id', orgId);

    if (cpErr) throw cpErr;

    // Query 3: Clientes del almacén activo — URL fija (single warehouseId)
    const { data: wcRows, error: wcErr } = await supabase
      .from('warehouse_clients')
      .select('client_id')
      .eq('org_id', orgId)
      .eq('warehouse_id', warehouseId);

    if (wcErr) throw wcErr;

    const warehouseClientSet = new Set((wcRows ?? []).map((r: any) => r.client_id as string));

    // Filtrado en memoria: proveedor del almacén + cliente del almacén
    const providerClientMap: Record<string, string[]> = {};
    for (const cp of (cpRows ?? []) as any[]) {
      if (!providerSet.has(cp.provider_id)) continue;       // proveedor no es del almacén
      if (!warehouseClientSet.has(cp.client_id)) continue;  // cliente no es del almacén
      const clientName: string = (cp.clients as any)?.name ?? cp.client_id;
      if (!providerClientMap[cp.provider_id]) providerClientMap[cp.provider_id] = [];
      if (!providerClientMap[cp.provider_id].includes(clientName)) {
        providerClientMap[cp.provider_id].push(clientName);
      }
    }

    return providers.map(p => ({
      ...p,
      clientNames: (providerClientMap[p.id] ?? []).sort(),
    }));
  },

  /**
   * Agregar un proveedor a un almacén específico (sin reemplazar otros).
   */
  async addProviderToWarehouse(orgId: string, providerId: string, warehouseId: string): Promise<void> {
    const { error } = await supabase
      .from('provider_warehouses')
      .upsert({ org_id: orgId, provider_id: providerId, warehouse_id: warehouseId }, {
        onConflict: 'org_id,provider_id,warehouse_id'
      });
    if (error) throw error;
  },

  /**
   * Obtener las asignaciones almacén→clientes de una lista de proveedores (OPTIMIZADO).
   * Versión optimizada: recibe los providers ya cargados para usar su source como fallback
   * sin hacer N+1 queries a la BD.
   */
  async getProviderAssignmentsOptimized(
    orgId: string,
    providers: Provider[]
  ): Promise<Record<string, string>> {
    const providerIds = providers.map(p => p.id);
    if (providerIds.length === 0) return {};
    const providerSet = new Set(providerIds);
    // Índice rápido: providerId → source
    const providerSourceMap: Record<string, string | null> = {};
    for (const p of providers) {
      providerSourceMap[p.id] = p.source || null;
    }

    // 1. Traer TODOS los provider_warehouses de la org — paginado
    const pageSize = 1000;
    let from = 0;
    let allPwRows: any[] = [];

    while (true) {
      const { data, error: pwErr } = await supabase
        .from('provider_warehouses')
        .select('provider_id, warehouse_id, warehouses(name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (pwErr) throw pwErr;
      allPwRows = allPwRows.concat(data ?? []);
      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    const pwRows = allPwRows.filter((r: any) => providerSet.has(r.provider_id));

    // 2. Traer TODOS los client_providers de la org — paginado
    from = 0;
    let allCpRows: any[] = [];

    while (true) {
      const { data, error: cpErr } = await supabase
        .from('client_providers')
        .select('provider_id, client_id, clients(name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (cpErr) throw cpErr;
      allCpRows = allCpRows.concat(data ?? []);
      if ((data ?? []).length < pageSize) break;
      from += pageSize;
    }

    const cpRows = allCpRows.filter((r: any) => providerSet.has(r.provider_id));

    // 3. Traer warehouse_clients
    const warehouseIds = [...new Set(pwRows.map((r: any) => r.warehouse_id as string))];
    let wcRows: any[] = [];
    if (warehouseIds.length > 0) {
      const { data, error: wcErr } = await supabase
        .from('warehouse_clients')
        .select('warehouse_id, client_id')
        .eq('org_id', orgId)
        .in('warehouse_id', warehouseIds);
      if (wcErr) throw wcErr;
      wcRows = data ?? [];
    }

    // Índice: warehouse_id → Set<client_id>
    const warehouseToClients: Record<string, Set<string>> = {};
    for (const wc of wcRows) {
      if (!warehouseToClients[wc.warehouse_id]) warehouseToClients[wc.warehouse_id] = new Set();
      warehouseToClients[wc.warehouse_id].add(wc.client_id);
    }

    // Índice: client_id → client name
    const clientNames: Record<string, string> = {};
    for (const cp of (cpRows ?? [])) {
      if (cp.clients && cp.client_id) {
        clientNames[cp.client_id] = (cp.clients as any).name ?? cp.client_id;
      }
    }

    // Índice: provider_id → Set<client_id>
    const providerToClients: Record<string, Set<string>> = {};
    for (const cp of (cpRows ?? [])) {
      if (!providerToClients[cp.provider_id]) providerToClients[cp.provider_id] = new Set();
      providerToClients[cp.provider_id].add(cp.client_id);
    }

    // Construir texto final por proveedor
    const result: Record<string, string> = {};

    for (const pid of providerIds) {
      const warehouses = (pwRows ?? []).filter((r: any) => r.provider_id === pid);

      if (warehouses.length === 0) {
        // Fallback: usar source del provider del mapa (ya cargado, sin query N+1)
        const source = providerSourceMap[pid];
        const autoClient = source ? resolveClientBySource(source) : null;
        result[pid] = autoClient ? `Cliente: ${autoClient.name}` : 'Sin asignación';
        continue;
      }

      const providerClientIds = providerToClients[pid] ?? new Set();

      const parts: string[] = warehouses.map((pw: any) => {
        const warehouseName: string = (pw.warehouses as any)?.name ?? pw.warehouse_id;
        const wcClients = warehouseToClients[pw.warehouse_id] ?? new Set();

        const matchingClients = [...providerClientIds]
          .filter(cid => wcClients.has(cid))
          .map(cid => clientNames[cid] ?? cid)
          .sort();

        if (matchingClients.length > 0) {
          return `${warehouseName}: (${matchingClients.join(', ')})`;
        }
        return warehouseName;
      });

      result[pid] = parts.join(' / ');
    }

    return result;
  },
};