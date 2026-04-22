import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the scope of visible dock IDs for a given user.
 * Logic:
 *  1. Get warehouses the user has access to (user_warehouse_access).
 *  2. If user has restricted=true entries, only those warehouses apply.
 *     If no restricted entries exist, user sees all warehouses in the org.
 *  3. Get docks belonging to those warehouses.
 *  4. If user has user_clients entries, further filter docks via client_docks.
 *  5. If user has user_providers entries, further filter docks via provider_warehouses → docks.
 */
async function resolveVisibleDockIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string
): Promise<string[] | null> {
  // Step 1: Get user warehouse access
  const { data: warehouseAccess } = await supabase
    .from('user_warehouse_access')
    .select('warehouse_id, restricted')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  let allowedWarehouseIds: string[] | null = null;

  if (warehouseAccess && warehouseAccess.length > 0) {
    const restrictedEntries = warehouseAccess.filter((w: any) => w.restricted === true);
    if (restrictedEntries.length > 0) {
      allowedWarehouseIds = restrictedEntries.map((w: any) => w.warehouse_id);
    }
    // If all entries are restricted=false, user sees all warehouses (allowedWarehouseIds stays null)
  }

  // Step 2: Get docks for allowed warehouses
  let docksQuery = supabase.from('docks').select('id').eq('org_id', orgId);
  if (allowedWarehouseIds) {
    docksQuery = docksQuery.in('warehouse_id', allowedWarehouseIds);
  }
  const { data: allDocks } = await docksQuery;
  const allDockIds = (allDocks || []).map((d: any) => d.id);

  if (allDockIds.length === 0) return [];

  // Step 3: Check client scope
  const { data: userClients } = await supabase
    .from('user_clients')
    .select('client_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  let clientDockIds: string[] | null = null;
  if (userClients && userClients.length > 0) {
    const clientIds = userClients.map((uc: any) => uc.client_id);
    const { data: clientDocks } = await supabase
      .from('client_docks')
      .select('dock_id')
      .eq('org_id', orgId)
      .in('client_id', clientIds);
    clientDockIds = (clientDocks || []).map((cd: any) => cd.dock_id);
  }

  // Step 4: Check provider scope
  const { data: userProviders } = await supabase
    .from('user_providers')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  let providerDockIds: string[] | null = null;
  if (userProviders && userProviders.length > 0) {
    const providerIds = userProviders.map((up: any) => up.provider_id);
    const { data: providerWarehouses } = await supabase
      .from('provider_warehouses')
      .select('warehouse_id')
      .eq('org_id', orgId)
      .in('provider_id', providerIds);
    const providerWarehouseIds = (providerWarehouses || []).map((pw: any) => pw.warehouse_id);
    if (providerWarehouseIds.length > 0) {
      const { data: providerDocks } = await supabase
        .from('docks')
        .select('id')
        .eq('org_id', orgId)
        .in('warehouse_id', providerWarehouseIds);
      providerDockIds = (providerDocks || []).map((d: any) => d.id);
    } else {
      providerDockIds = [];
    }
  }

  // Merge scopes: if both client and provider scopes exist, union them
  if (clientDockIds !== null && providerDockIds !== null) {
    const merged = Array.from(new Set([...clientDockIds, ...providerDockIds]));
    return allDockIds.filter((id: string) => merged.includes(id));
  }
  if (clientDockIds !== null) {
    return allDockIds.filter((id: string) => clientDockIds!.includes(id));
  }
  if (providerDockIds !== null) {
    return allDockIds.filter((id: string) => providerDockIds!.includes(id));
  }

  // No client/provider restriction: return all warehouse-scoped docks
  return allDockIds;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    const url = new URL(req.url);

    // Resolve org_id
    let orgId = url.searchParams.get('org_id') || undefined;
    if (!orgId) {
      const { data: userOrg } = await supabase
        .from('user_org_roles')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (!userOrg) {
        return new Response(JSON.stringify({ error: 'User does not belong to any organization' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      orgId = userOrg.org_id;
    }

    if (!UUID_REGEX.test(orgId!)) {
      return new Response(JSON.stringify({ error: 'Invalid org_id format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user belongs to org
    const { data: orgCheck } = await supabase
      .from('user_org_roles')
      .select('org_id')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (!orgCheck) {
      return new Response(JSON.stringify({ error: 'User does not belong to the specified organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pagination
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('page_size') || '50', 10), 1), 200);
    const offset = (page - 1) * pageSize;

    // Resolve visible dock IDs based on user scope
    const visibleDockIds = await resolveVisibleDockIds(supabase, userId, orgId!);
    if (visibleDockIds !== null && visibleDockIds.length === 0) {
      return new Response(
        JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query with enriched joins
    let query = supabase
      .from('reservations')
      .select(
        `id, org_id, dock_id, start_datetime, end_datetime, status_id,
         is_cancelled, cancel_reason, cancelled_by, cancelled_at,
         dua, invoice, driver, truck_plate, purchase_order, order_request_number,
         shipper_provider, client_id, operation_type, is_imported, bl_number,
         quantity_value, notes, transport_type, cargo_type,
         created_by, created_at, updated_by, updated_at,
         docks!inner(id, name, reference, warehouse_id, warehouses(id, name)),
         reservation_statuses(id, name, code, color),
         clients(id, name)`,
        { count: 'exact' }
      )
      .eq('org_id', orgId);

    // Apply dock scope filter
    if (visibleDockIds !== null) {
      query = query.in('dock_id', visibleDockIds);
    }

    // Apply optional filters
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const warehouseId = url.searchParams.get('warehouse_id');
    const dockId = url.searchParams.get('dock_id');
    const statusId = url.searchParams.get('status_id');
    const isCancelled = url.searchParams.get('is_cancelled');
    const clientId = url.searchParams.get('client_id');

    if (from) query = query.gte('start_datetime', from);
    if (to) query = query.lte('end_datetime', to);
    if (dockId && UUID_REGEX.test(dockId)) query = query.eq('dock_id', dockId);
    if (statusId && UUID_REGEX.test(statusId)) query = query.eq('status_id', statusId);
    if (isCancelled === 'true' || isCancelled === 'false') query = query.eq('is_cancelled', isCancelled === 'true');
    if (clientId && UUID_REGEX.test(clientId)) query = query.eq('client_id', clientId);

    // warehouse_id filter: filter by docks belonging to that warehouse
    if (warehouseId && UUID_REGEX.test(warehouseId)) {
      const { data: warehouseDocks } = await supabase
        .from('docks')
        .select('id')
        .eq('warehouse_id', warehouseId)
        .eq('org_id', orgId);
      const wDockIds = (warehouseDocks || []).map((d: any) => d.id);
      if (wDockIds.length === 0) {
        return new Response(
          JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      query = query.in('dock_id', wDockIds);
    }

    query = query.order('start_datetime', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: reservations, error: queryError, count } = await query;
    if (queryError) {
      return new Response(JSON.stringify({ error: 'Error fetching reservations', details: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Shape the enriched response
    const shaped = (reservations || []).map((r: any) => ({
      id: r.id,
      org_id: r.org_id,
      dock_id: r.dock_id,
      dock_name: r.docks?.name ?? null,
      dock_reference: r.docks?.reference ?? null,
      warehouse_id: r.docks?.warehouse_id ?? null,
      warehouse_name: r.docks?.warehouses?.name ?? null,
      start_datetime: r.start_datetime,
      end_datetime: r.end_datetime,
      status_id: r.status_id,
      status_name: r.reservation_statuses?.name ?? null,
      status_code: r.reservation_statuses?.code ?? null,
      status_color: r.reservation_statuses?.color ?? null,
      is_cancelled: r.is_cancelled,
      cancel_reason: r.cancel_reason,
      cancelled_by: r.cancelled_by,
      cancelled_at: r.cancelled_at,
      dua: r.dua,
      invoice: r.invoice,
      driver: r.driver,
      truck_plate: r.truck_plate,
      purchase_order: r.purchase_order,
      order_request_number: r.order_request_number,
      shipper_provider: r.shipper_provider,
      client_id: r.client_id,
      client_name: r.clients?.name ?? null,
      operation_type: r.operation_type,
      is_imported: r.is_imported,
      bl_number: r.bl_number,
      quantity_value: r.quantity_value,
      notes: r.notes,
      transport_type: r.transport_type,
      cargo_type: r.cargo_type,
      created_by: r.created_by,
      created_at: r.created_at,
      updated_by: r.updated_by,
      updated_at: r.updated_at,
    }));

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);

    return new Response(
      JSON.stringify({
        data: shaped,
        meta: { page, page_size: pageSize, total, total_pages: totalPages, org_id: orgId },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
