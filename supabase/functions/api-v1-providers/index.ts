import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves provider IDs visible to a user.
 * If user has entries in user_providers → only those providers.
 * If user has no entries in user_providers → null (no restriction = all org providers).
 */
async function resolveVisibleProviderIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string
): Promise<string[] | null> {
  const { data: userProviders, error } = await supabase
    .from('user_providers')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  if (error || !userProviders || userProviders.length === 0) return null;
  return userProviders.map((up: any) => up.provider_id);
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
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('page_size') || '100', 10), 1), 500);
    const offset = (page - 1) * pageSize;

    // Resolve visible provider IDs (scope)
    let visibleProviderIds = await resolveVisibleProviderIds(supabase, userId, orgId!);

    // warehouse_id filter: intersect with providers linked to that warehouse via provider_warehouses
    const warehouseId = url.searchParams.get('warehouse_id');
    if (warehouseId && UUID_REGEX.test(warehouseId)) {
      const { data: pw } = await supabase
        .from('provider_warehouses')
        .select('provider_id')
        .eq('warehouse_id', warehouseId)
        .eq('org_id', orgId);
      const warehouseProviderIds = (pw || []).map((p: any) => p.provider_id);

      if (visibleProviderIds !== null) {
        visibleProviderIds = visibleProviderIds.filter((id) => warehouseProviderIds.includes(id));
      } else {
        visibleProviderIds = warehouseProviderIds;
      }
    }

    if (visibleProviderIds !== null && visibleProviderIds.length === 0) {
      return new Response(
        JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optional active filter
    const active = url.searchParams.get('active');

    // --- COUNT query (separate, avoids count+in conflict in some ESM builds) ---
    let countQuery = supabase
      .from('providers')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId!);

    if (visibleProviderIds !== null) countQuery = countQuery.in('id', visibleProviderIds);
    if (active === 'true' || active === 'false') countQuery = countQuery.eq('active', active === 'true');

    const { count, error: countError } = await countQuery;
    if (countError) {
      return new Response(
        JSON.stringify({ error: 'Error counting providers', details: countError.message, hint: countError.hint || null }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- DATA query ---
    let dataQuery = supabase
      .from('providers')
      .select('id, org_id, name, active')
      .eq('org_id', orgId!)
      .order('name', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (visibleProviderIds !== null) dataQuery = dataQuery.in('id', visibleProviderIds);
    if (active === 'true' || active === 'false') dataQuery = dataQuery.eq('active', active === 'true');

    const { data: providers, error: queryError } = await dataQuery;
    if (queryError) {
      return new Response(
        JSON.stringify({ error: 'Error fetching providers', details: queryError.message, hint: queryError.hint || null }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const total = count || 0;
    return new Response(
      JSON.stringify({
        data: providers || [],
        meta: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize), org_id: orgId },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
