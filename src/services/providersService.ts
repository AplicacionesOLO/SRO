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

// ── Cache en memoria de origen_proveedores para evitar N+1 queries ──
let origenCache: Record<string, { clientId: string; name: string }> | null = null;
let origenCacheTs = 0;
const ORIGEN_CACHE_TTL = 60_000; // 1 minuto

// ── Cache de los dos barridos pesados de getProviderAssignmentsOptimized ──
let assignmentsFullCache: {
  orgId: string;
  allPwRows: any[];
  allCpRows: any[];
  ts: number;
} | null = null;
const ASSIGNMENTS_FULL_CACHE_TTL = 30_000; // 30 segundos — suficiente para navegación fluida

function invalidateAssignmentsCache() {
  assignmentsFullCache = null;
}

async function getOrigenProveedoresMap(orgId: string): Promise<Record<string, { clientId: string; name: string }>> {
  const now = Date.now();
  if (origenCache && origenCacheTs + ORIGEN_CACHE_TTL > now && (origenCache as any)._orgId === orgId) {
    return origenCache;
  }

  const { data, error } = await supabase
    .from('origen_proveedores')
    .select('source_code, client_id, description, clients(name)')
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (error) {
    return {};
  }

  const map: Record<string, { clientId: string; name: string }> = { _orgId: orgId } as any;
  for (const row of (data ?? [])) {
    const key = row.source_code?.toUpperCase().trim();
    if (key) {
      const clientName = (row.clients as any)?.name || row.description || row.client_id;
      map[key] = { clientId: row.client_id, name: clientName };
    }
  }

  origenCache = map;
  origenCacheTs = now;
  return map;
}

function resolveClientBySource(source: string | null | undefined, orgMap: Record<string, { clientId: string; name: string }> = {}): { id: string; name: string } | null {
  if (!source) return null;
  const normalized = source.trim().toUpperCase();
  // Primero buscar en la tabla de origen_proveedores
  const fromTable = orgMap[normalized];
  if (fromTable) return { id: fromTable.clientId, name: fromTable.name };
  // Fallback legacy para nombres de compañía
  // El campo 'source' indica el sistema de origen de los datos:
  //   - 'EPA'      = datos provenientes del sistema EPA (IDCOMPANIA=109, código 0109)
  //   - 'COFERSA'  = datos provenientes del sistema COFERSA (IDCOMPANIA=29, código 029)
  //   - 'FEBECA'   = datos provenientes del sistema FEBECA
  //   - 'SILLACA'  = datos provenientes del sistema SILLACA
  // Mapeo directo: origen → cliente con el mismo nombre
  const legacyMap: Record<string, { id: string; name: string }> = {
    'COFERSA':  { id: 'ae488aaf-706a-46fa-9251-d00a35e78384', name: 'Cofersa' },
    'EPA':      { id: 'f897b0e2-721f-498d-a5d2-800dd3755139', name: 'Epa' },
    'FEBECA':   { id: 'f64dd648-5b6d-48fd-9f93-64e5a07c34d9', name: 'Febeca C.A' },
    'SILLACA':  { id: '9703c174-6789-4487-acaa-36a37d94a6ca', name: 'Sillaca S.A' },
    '0109':     { id: 'ae488aaf-706a-46fa-9251-d00a35e78384', name: 'Cofersa' },
    '029':      { id: 'f897b0e2-721f-498d-a5d2-800dd3755139', name: 'Epa' },
    '0029':     { id: 'f897b0e2-721f-498d-a5d2-800dd3755139', name: 'Epa' },
  };
  return legacyMap[normalized] ?? null;
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
   * Resolver cliente automáticamente por source_code vía tabla origen_proveedores.
   * Exportado para uso en componentes UI.
   */
  resolveClientBySource,

  /** Invalidar cache de asignaciones (usar tras crear/editar/eliminar proveedores). */
  invalidateAssignmentsCache,

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
        .select('id, org_id, name, active, provider_type, provider_code, source, source_code, client_id, created_at')
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
        .select('id, org_id, name, active, provider_type, provider_code, source, source_code, client_id, created_at')
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
    searchTerm?: string,
    clientId?: string | null,
  ): Promise<{ data: Provider[]; total: number; totalPages: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('providers')
      .select('id, org_id, name, active, provider_type, provider_code, source, source_code, client_id, created_at', { count: 'exact' })
      .eq('org_id', orgId);

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (searchTerm && searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`name.ilike.${term},provider_code.ilike.${term},source.ilike.${term},source_code.ilike.${term}`);
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
    searchTerm?: string,
    clientId?: string | null,
  ): Promise<{ data: Provider[]; total: number; totalPages: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('providers')
      .select('id, org_id, name, active, provider_type, provider_code, source, source_code, client_id, created_at', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('active', true);

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (searchTerm && searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`name.ilike.${term},provider_code.ilike.${term},source.ilike.${term},source_code.ilike.${term}`);
    }

    const { data, error, count } = await query
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw error;
    const total = count ?? 0;
    return { data: data ?? [], total, totalPages: Math.ceil(total / pageSize) };
  },

  async createProvider(orgId: string, name: string, providerType: 'almacenaje' | 'pesado' = 'almacenaje', providerCode?: string | null, source?: string | null, clientId?: string | null, sourceCode?: string | null): Promise<Provider> {
    const normalizedName = name.trim().toUpperCase();
    const normalizedCode = providerCode?.trim().toUpperCase() || null;
    const normalizedSource = source?.trim().toUpperCase() || null;
    const normalizedSourceCode = sourceCode?.trim().toUpperCase() || null;
    // Auto-detectar cliente por source_code si no se proporcionó clientId
    const orgMap = await getOrigenProveedoresMap(orgId);
    const autoClient = clientId ? null : resolveClientBySource(normalizedSourceCode, orgMap);
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
        source_code: normalizedSourceCode,
        client_id: finalClientId,
      })
      .select('id, org_id, name, active, provider_type, provider_code, source, source_code, client_id, created_at')
      .single();

    if (error) throw error;
    return data;
  },

  async updateProvider(id: string, updates: Partial<Pick<Provider, 'name' | 'active' | 'provider_type' | 'provider_code' | 'source' | 'source_code' | 'client_id'>>): Promise<Provider> {
    const normalized: any = { ...updates };
    if (updates.name !== undefined) normalized.name = updates.name.trim().toUpperCase();
    if (updates.provider_code !== undefined) normalized.provider_code = updates.provider_code?.trim().toUpperCase() || null;
    if (updates.source !== undefined) normalized.source = updates.source?.trim().toUpperCase() || null;
    if (updates.source_code !== undefined) normalized.source_code = updates.source_code?.trim().toUpperCase() || null;
    
    const { data, error } = await supabase
      .from('providers')
      .update(normalized)
      .eq('id', id)
      .select('id, org_id, name, active, provider_type, provider_code, source, source_code, client_id, created_at')
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
    const seen = new Set<string>(); // Deduplicar por provider_id

    while (true) {
      let query = supabase
        .from('providers')
        .select('id, org_id, name, active, provider_type, provider_code, source, source_code, client_id, created_at, provider_warehouses!inner(warehouse_id)')
        .eq('org_id', orgId)
        .eq('provider_warehouses.warehouse_id', warehouseId)
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1);

      if (activeOnly) {
        query = query.eq('active', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rawPage = data ?? [];
      const page = rawPage.map(({ provider_warehouses: _pw, ...p }: any) => p as Provider)
        .filter((p: Provider) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      allProviders = allProviders.concat(page);
      if (rawPage.length < pageSize) break;
      from += pageSize;
    }

    return allProviders;
  },

  /**
   * Paginación con filtro por almacén.
   * Trae todos los proveedores del almacén, filtra en memoria por búsqueda/cliente,
   * y pagina en memoria. Esto evita el problema de duplicados en provider_warehouses
   * y del 414 URI Too Long con .in() de miles de IDs.
   */
  async getByWarehousePaginated(
    orgId: string,
    warehouseId: string,
    page: number,
    pageSize: number,
    searchTerm?: string,
    clientId?: string | null,
    activeOnly = true,
  ): Promise<{ data: Provider[]; total: number; totalPages: number }> {
    const allProviders = await this.getByWarehouse(orgId, warehouseId, activeOnly);

    let filtered = allProviders;

    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((p) =>
        p.name.toLowerCase().includes(term) ||
        (p.provider_code || '').toLowerCase().includes(term) ||
        (p.source || '').toLowerCase().includes(term) ||
        (p.source_code || '').toLowerCase().includes(term)
      );
    }

    if (clientId) {
      filtered = filtered.filter((p) => p.client_id === clientId);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    const data = filtered.slice(offset, offset + pageSize);

    return { data, total, totalPages };
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
    // Deduplicar por provider_id + warehouse_id para evitar duplicados en la UI
    const pwSeen = new Set<string>();
    const pwRows = allPwRows.filter((r: any) => {
      if (!providerSet.has(r.provider_id)) return false;
      const key = `${r.provider_id}|${r.warehouse_id}`;
      if (pwSeen.has(key)) return false;
      pwSeen.add(key);
      return true;
    });

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
    // Deduplicar por provider_id + client_id para evitar duplicados
    const cpSeen = new Set<string>();
    const cpRows = allCpRows.filter((r: any) => {
      if (!providerSet.has(r.provider_id)) return false;
      const key = `${r.provider_id}|${r.client_id}`;
      if (cpSeen.has(key)) return false;
      cpSeen.add(key);
      return true;
    });

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

    // Fallback: obtener client_id directo de la tabla providers para proveedores sin client_providers
    let providerClientIdsMap: Record<string, string> = {};
    if (providerIds.length > 0) {
      const { data: providerRows } = await supabase
        .from('providers')
        .select('id, client_id')
        .eq('org_id', orgId)
        .in('id', providerIds);
      for (const pr of (providerRows ?? []) as any[]) {
        if (pr.client_id) providerClientIdsMap[pr.id] = pr.client_id;
      }
    }

    // Merge client_id directo en providerToClients
    for (const [pid, cid] of Object.entries(providerClientIdsMap)) {
      if (!providerToClients[pid]) providerToClients[pid] = new Set();
      providerToClients[pid].add(cid);
      if (!clientNames[cid]) {
        const { data: clientRow } = await supabase
          .from('clients')
          .select('name')
          .eq('id', cid)
          .maybeSingle();
        if (clientRow?.name) clientNames[cid] = clientRow.name;
      }
    }

    // Construir texto final por proveedor
    const result: Record<string, string> = {};

    for (const pid of providerIds) {
      const warehouses = (pwRows ?? []).filter((r: any) => r.provider_id === pid);

      if (warehouses.length === 0) {
        // Fallback: buscar cliente por source_code o source del provider
        const { data: providerSources } = await supabase
          .from('providers')
          .select('source_code, source')
          .eq('id', pid)
          .maybeSingle();
        const orgMap = await getOrigenProveedoresMap(orgId);
        const lookupKey = providerSources?.source_code || providerSources?.source || null;
        const autoClient = lookupKey ? resolveClientBySource(lookupKey, orgMap) : null;
        result[pid] = autoClient ? `OLO: (${autoClient.name})` : 'Sin asignación';
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
        // Fallback: si no hay matching clients via warehouse_clients, pero hay clientes directos del proveedor, mostrarlos
        const allClients = [...providerClientIds]
          .map(cid => clientNames[cid] ?? cid)
          .sort();
        if (allClients.length > 0) {
          return `${warehouseName}: (${allClients.join(', ')})`;
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
   * Versión optimizada: recibe los providers ya cargados para usar su source_code como fallback
   * sin hacer N+1 queries a la BD.
   */
  async getProviderAssignmentsOptimized(
    orgId: string,
    providers: Provider[]
  ): Promise<Record<string, string>> {
    const providerIds = providers.map(p => p.id);
    if (providerIds.length === 0) return {};
    const providerSet = new Set(providerIds);
    // Índice rápido: providerId → source_code y source
    const providerSourceCodeMap: Record<string, string | null> = {};
    const providerSourceMap: Record<string, string | null> = {};
    for (const p of providers) {
      providerSourceCodeMap[p.id] = p.source_code || null;
      providerSourceMap[p.id] = p.source || null;
    }

    // ── Cache check: si ya tenemos los datos completos de esta org frescos, saltamos los barridos ──
    const now = Date.now();
    const cacheValid = assignmentsFullCache
      && assignmentsFullCache.orgId === orgId
      && assignmentsFullCache.ts + ASSIGNMENTS_FULL_CACHE_TTL > now;

    let allPwRows: any[];
    let allCpRows: any[];

    if (cacheValid) {
      allPwRows = assignmentsFullCache!.allPwRows;
      allCpRows = assignmentsFullCache!.allCpRows;
    } else {
      const pageSize = 1000;

      // ── PARALELO: los dos barridos son independientes, los disparamos juntos ──
      async function fetchAllPages(
        table: string,
        select: string,
        eqField: string,
        eqValue: string
      ): Promise<any[]> {
        let from = 0;
        const rows: any[] = [];
        while (true) {
          const { data, error } = await supabase
            .from(table)
            .select(select)
            .eq(eqField, eqValue)
            .order('created_at', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          rows.push(...(data ?? []));
          if ((data ?? []).length < pageSize) break;
          from += pageSize;
        }
        return rows;
      }

      const [pwResult, cpResult] = await Promise.all([
        fetchAllPages('provider_warehouses', 'provider_id, warehouse_id, warehouses(name)', 'org_id', orgId),
        fetchAllPages('client_providers', 'provider_id, client_id, clients(name)', 'org_id', orgId),
      ]);

      allPwRows = pwResult;
      allCpRows = cpResult;

      // Guardar en cache
      assignmentsFullCache = { orgId, allPwRows, allCpRows, ts: now };
    }

    // ── Filtrado en memoria (rápido, son operaciones sobre arrays) ──
    const pwRows = allPwRows.filter((r: any) => providerSet.has(r.provider_id));
    const pwRowsDeduped: any[] = [];
    const pwSeen = new Set<string>();
    for (const r of pwRows) {
      const key = `${r.provider_id}|${r.warehouse_id}`;
      if (pwSeen.has(key)) continue;
      pwSeen.add(key);
      pwRowsDeduped.push(r);
    }
    const pwRowsFinal = pwRowsDeduped;

    const cpRows = allCpRows.filter((r: any) => providerSet.has(r.provider_id));
    const cpRowsDeduped: any[] = [];
    const cpSeen = new Set<string>();
    for (const r of cpRows) {
      const key = `${r.provider_id}|${r.client_id}`;
      if (cpSeen.has(key)) continue;
      cpSeen.add(key);
      cpRowsDeduped.push(r);
    }
    const cpRowsFinal = cpRowsDeduped;

    // ── warehouse_clients (chico, siempre rápido) ──
    const warehouseIds = [...new Set(pwRowsFinal.map((r: any) => r.warehouse_id as string))];
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

    // Índices en memoria
    const warehouseToClients: Record<string, Set<string>> = {};
    for (const wc of wcRows) {
      if (!warehouseToClients[wc.warehouse_id]) warehouseToClients[wc.warehouse_id] = new Set();
      warehouseToClients[wc.warehouse_id].add(wc.client_id);
    }

    const clientNames: Record<string, string> = {};
    for (const cp of (cpRowsFinal ?? [])) {
      if (cp.clients && cp.client_id) {
        clientNames[cp.client_id] = (cp.clients as any).name ?? cp.client_id;
      }
    }

    const providerToClients: Record<string, Set<string>> = {};
    for (const cp of (cpRowsFinal ?? [])) {
      if (!providerToClients[cp.provider_id]) providerToClients[cp.provider_id] = new Set();
      providerToClients[cp.provider_id].add(cp.client_id);
    }

    // Fallback: incluir client_id directo de providers si no está en client_providers
    const directClientIds: Set<string> = new Set();
    for (const p of providers) {
      if (p.client_id) {
        if (!providerToClients[p.id]) providerToClients[p.id] = new Set();
        providerToClients[p.id].add(p.client_id);
        if (!clientNames[p.client_id]) {
          directClientIds.add(p.client_id);
        }
      }
    }

    // Si faltan nombres de clientes directos, los buscamos
    if (directClientIds.size > 0) {
      const { data: missingClients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', [...directClientIds]);
      for (const c of (missingClients ?? [])) {
        clientNames[c.id] = c.name;
      }
    }

    // Construir texto final
    const result: Record<string, string> = {};

    for (const pid of providerIds) {
      const warehouses = (pwRowsFinal ?? []).filter((r: any) => r.provider_id === pid);

      if (warehouses.length === 0) {
        const sourceCode = providerSourceCodeMap[pid];
        const source = providerSourceMap[pid];
        const orgMap = await getOrigenProveedoresMap(orgId);
        const lookupKey = sourceCode || source;
        const autoClient = lookupKey ? resolveClientBySource(lookupKey, orgMap) : null;
        result[pid] = autoClient ? `OLO: (${autoClient.name})` : 'Sin asignación';
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
        // Fallback: si no hay matching clients via warehouse_clients, pero hay clientes directos del proveedor, mostrarlos
        const allClients = [...providerClientIds]
          .map(cid => clientNames[cid] ?? cid)
          .sort();
        if (allClients.length > 0) {
          return `${warehouseName}: (${allClients.join(', ')})`;
        }
        return warehouseName;
      });

      result[pid] = parts.join(' / ');
    }

    return result;
  },
};