import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves visible warehouse IDs for a user.
 * Logic:
 *  1. Get user_warehouse_access entries with restricted=true → those are the allowed warehouses.
 *  2. If no restricted entries exist → user sees all org warehouses (returns null = no restriction).
 */
async function resolveVisibleWarehouseIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string
): Promise<string[] | null> {
  const { data: warehouseAccess } = await supabase
    .from('user_warehouse_access')
    .select('warehouse_id, restricted')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  if (!warehouseAccess || warehouseAccess.length === 0) return null;

  const restricted = warehouseAccess.filter((w: any) => w.restricted === true);
  if (restricted.length === 0) return null;

  return restricted.map((w: any) => w.warehouse_id);
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

    // Resolve visible warehouse IDs
    const allowedWarehouseIds = await resolveVisibleWarehouseIds(supabase, userId, orgId!);

    // Build query
    let query = supabase
      .from('warehouses')
      .select(
        'id, org_id, name, location, country_id, business_start_time, business_end_time, slot_interval_minutes, timezone',
        { count: 'exact' }
      )
      .eq('org_id', orgId);

    if (allowedWarehouseIds !== null) {
      if (allowedWarehouseIds.length === 0) {
        return new Response(
          JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      query = query.in('id', allowedWarehouseIds);
    }

    // Optional filters
    const countryId = url.searchParams.get('country_id');
    if (countryId && UUID_REGEX.test(countryId)) query = query.eq('country_id', countryId);

    query = query.order('name', { ascending: true }).range(offset, offset + pageSize - 1);

    const { data: warehouses, error: queryError, count } = await query;
    if (queryError) {
      return new Response(JSON.stringify({ error: 'Error fetching warehouses', details: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const total = count || 0;
    return new Response(
      JSON.stringify({
        data: warehouses || [],
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
