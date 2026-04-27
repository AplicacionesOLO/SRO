import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the IDs of docks visible to the user.
 * Logic:
 *  1. Get warehouses the user has restricted access to (user_warehouse_access, restricted=true).
 *     If none → user sees all org warehouses.
 *  2. Get all docks in those warehouses.
 *  3. If user has user_clients → filter docks via client_docks.
 *  4. If user has user_providers → filter docks via provider_warehouses → docks.
 *  5. If both client and provider scopes → UNION them (not intersection).
 *  6. Final set = warehouse-scoped docks ∩ (client ∪ provider docks).
 *     If no client/provider scope → all warehouse-scoped docks.
 */
async function resolveVisibleDockIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string
): Promise<string[]> {
  const { data: warehouseAccess } = await supabase
    .from('user_warehouse_access')
    .select('warehouse_id, restricted')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  let allowedWarehouseIds: string[] | null = null;
  if (warehouseAccess && warehouseAccess.length > 0) {
    const restricted = warehouseAccess.filter((w: any) => w.restricted === true);
    if (restricted.length > 0) {
      allowedWarehouseIds = restricted.map((w: any) => w.warehouse_id);
    }
  }

  let docksQuery = supabase.from('docks').select('id').eq('org_id', orgId);
  if (allowedWarehouseIds) {
    docksQuery = docksQuery.in('warehouse_id', allowedWarehouseIds);
  }
  const { data: allDocks } = await docksQuery;
  const allDockIds: string[] = (allDocks || []).map((d: any) => d.id);
  if (allDockIds.length === 0) return [];

  const { data: userClients } = await supabase
    .from('user_clients')
    .select('client_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  let clientDockIds: string[] | null = null;
  if (userClients && userClients.length > 0) {
    const clientIds = userClients.map((uc: any) => uc.client_id);
    const { data: cd } = await supabase
      .from('client_docks')
      .select('dock_id')
      .eq('org_id', orgId)
      .in('client_id', clientIds);
    clientDockIds = (cd || []).map((r: any) => r.dock_id);
  }

  const { data: userProviders } = await supabase
    .from('user_providers')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  let providerDockIds: string[] | null = null;
  if (userProviders && userProviders.length > 0) {
    const providerIds = userProviders.map((up: any) => up.provider_id);
    const { data: pw } = await supabase
      .from('provider_warehouses')
      .select('warehouse_id')
      .eq('org_id', orgId)
      .in('provider_id', providerIds);
    const pwIds = (pw || []).map((r: any) => r.warehouse_id);
    if (pwIds.length > 0) {
      const { data: pd } = await supabase
        .from('docks')
        .select('id')
        .eq('org_id', orgId)
        .in('warehouse_id', pwIds);
      providerDockIds = (pd || []).map((d: any) => d.id);
    } else {
      providerDockIds = [];
    }
  }

  if (clientDockIds !== null && providerDockIds !== null) {
    const merged = Array.from(new Set([...clientDockIds, ...providerDockIds]));
    return allDockIds.filter((id) => merged.includes(id));
  }
  if (clientDockIds !== null) return allDockIds.filter((id) => clientDockIds!.includes(id));
  if (providerDockIds !== null) return allDockIds.filter((id) => providerDockIds!.includes(id));
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

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
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('page_size') || '100', 10), 1), 500);
    const offset = (page - 1) * pageSize;

    // Resolve visible dock IDs
    const visibleDockIds = await resolveVisibleDockIds(supabase, userId, orgId!);
    if (visibleDockIds.length === 0) {
      return new Response(
        JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query with warehouse join
    let query = supabase
      .from('docks')
      .select('id, org_id, name, reference, warehouse_id, category_id, status_id, is_active, warehouses(id, name)', { count: 'exact' })
      .eq('org_id', orgId)
      .in('id', visibleDockIds);

    // Optional filters
    const warehouseId = url.searchParams.get('warehouse_id');
    const isActive = url.searchParams.get('is_active');
    if (warehouseId && UUID_REGEX.test(warehouseId)) query = query.eq('warehouse_id', warehouseId);
    if (isActive === 'true' || isActive === 'false') query = query.eq('is_active', isActive === 'true');

    query = query.order('name', { ascending: true }).range(offset, offset + pageSize - 1);

    const { data: docks, error: queryError, count } = await query;
    if (queryError) {
      return new Response(JSON.stringify({ error: 'Error fetching docks', details: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shaped = (docks || []).map((d: any) => ({
      id: d.id,
      org_id: d.org_id,
      name: d.name,
      reference: d.reference,
      warehouse_id: d.warehouse_id,
      warehouse_name: d.warehouses?.name ?? null,
      category_id: d.category_id,
      status_id: d.status_id,
      is_active: d.is_active,
    }));

    const total = count || 0;
    return new Response(
      JSON.stringify({
        data: shaped,
        meta: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize), org_id: orgId },
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
