import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves visible dock IDs for a user (same logic as first layer).
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
  if (allowedWarehouseIds) docksQuery = docksQuery.in('warehouse_id', allowedWarehouseIds);
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
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('page_size') || '50', 10), 1), 200);
    const offset = (page - 1) * pageSize;

    // Optional params
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const warehouseId = url.searchParams.get('warehouse_id');
    const reservationIdFilter = url.searchParams.get('reservation_id');
    const matriculaFilter = url.searchParams.get('matricula');
    const duaFilter = url.searchParams.get('dua');

    // Step 1: Resolve visible dock IDs
    const visibleDockIds = await resolveVisibleDockIds(supabase, userId, orgId!);
    if (visibleDockIds.length === 0) {
      return new Response(
        JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Resolve visible reservation IDs (filter by dock scope + optional warehouse filter)
    let reservationsQuery = supabase
      .from('reservations')
      .select('id, dock_id, client_id, status_id, docks(id, name, reference, warehouse_id, warehouses(id, name)), reservation_statuses(id, name, code, color), clients(id, name)')
      .eq('org_id', orgId)
      .in('dock_id', visibleDockIds);

    // If specific reservation_id requested, validate scope and return that one
    if (reservationIdFilter && UUID_REGEX.test(reservationIdFilter)) {
      reservationsQuery = reservationsQuery.eq('id', reservationIdFilter);
    }

    // warehouse_id filter: restrict to docks in that warehouse
    if (warehouseId && UUID_REGEX.test(warehouseId)) {
      const { data: wDocks } = await supabase
        .from('docks')
        .select('id')
        .eq('warehouse_id', warehouseId)
        .eq('org_id', orgId);
      const wDockIds = (wDocks || []).map((d: any) => d.id);
      const intersection = visibleDockIds.filter((id) => wDockIds.includes(id));
      if (intersection.length === 0) {
        return new Response(
          JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      reservationsQuery = reservationsQuery.in('dock_id', intersection);
    }

    const { data: visibleReservations } = await reservationsQuery;
    if (!visibleReservations || visibleReservations.length === 0) {
      return new Response(
        JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build reservation lookup map for enrichment
    const reservationMap = new Map<string, any>();
    for (const r of visibleReservations) {
      reservationMap.set(r.id, r);
    }
    const visibleReservationIds = Array.from(reservationMap.keys());

    // Step 3: Query casetilla_ingresos with scope + filters
    let query = supabase
      .from('casetilla_ingresos')
      .select('id, org_id, reservation_id, chofer, matricula, dua, factura, orden_compra, numero_pedido, created_by, created_at, fotos, cedula, observaciones', { count: 'exact' })
      .eq('org_id', orgId)
      .in('reservation_id', visibleReservationIds);

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (matriculaFilter) query = query.ilike('matricula', `%${matriculaFilter}%`);
    if (duaFilter) query = query.ilike('dua', `%${duaFilter}%`);

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: ingresos, error: queryError, count } = await query;
    if (queryError) {
      return new Response(JSON.stringify({ error: 'Error fetching casetilla_ingresos', details: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 4: Enrich with reservation data
    const shaped = (ingresos || []).map((ing: any) => {
      const res = ing.reservation_id ? reservationMap.get(ing.reservation_id) : null;
      const dock = res?.docks ?? null;
      const warehouse = dock?.warehouses ?? null;
      const status = res?.reservation_statuses ?? null;
      const client = res?.clients ?? null;

      return {
        id: ing.id,
        org_id: ing.org_id,
        reservation_id: ing.reservation_id,
        chofer: ing.chofer,
        matricula: ing.matricula,
        dua: ing.dua,
        factura: ing.factura,
        orden_compra: ing.orden_compra,
        numero_pedido: ing.numero_pedido,
        created_by: ing.created_by,
        created_at: ing.created_at,
        fotos: ing.fotos,
        cedula: ing.cedula,
        observaciones: ing.observaciones,
        reservation_status_id: status?.id ?? null,
        reservation_status_name: status?.name ?? null,
        reservation_status_code: status?.code ?? null,
        dock_id: dock?.id ?? null,
        dock_name: dock?.name ?? null,
        dock_reference: dock?.reference ?? null,
        warehouse_id: dock?.warehouse_id ?? null,
        warehouse_name: warehouse?.name ?? null,
        client_id: client?.id ?? null,
        client_name: client?.name ?? null,
      };
    });

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
