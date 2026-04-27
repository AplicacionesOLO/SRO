import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves client IDs visible to a user.
 * If user has entries in user_clients → only those clients.
 * If user has no entries in user_clients → all org clients (returns null = no restriction).
 */
async function resolveVisibleClientIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string
): Promise<string[] | null> {
  const { data: userClients } = await supabase
    .from('user_clients')
    .select('client_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  if (!userClients || userClients.length === 0) return null;
  return userClients.map((uc: any) => uc.client_id);
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

    // Resolve visible client IDs
    let visibleClientIds = await resolveVisibleClientIds(supabase, userId, orgId!);

    // warehouse_id filter: intersect with clients linked to that warehouse
    const warehouseId = url.searchParams.get('warehouse_id');
    if (warehouseId && UUID_REGEX.test(warehouseId)) {
      const { data: wClients } = await supabase
        .from('warehouse_clients')
        .select('client_id')
        .eq('warehouse_id', warehouseId)
        .eq('org_id', orgId);
      const wClientIds = (wClients || []).map((wc: any) => wc.client_id);

      if (visibleClientIds !== null) {
        // Intersect user scope with warehouse scope
        visibleClientIds = visibleClientIds.filter((id) => wClientIds.includes(id));
      } else {
        // User sees all clients → restrict to warehouse's clients
        visibleClientIds = wClientIds;
      }
    }

    if (visibleClientIds !== null && visibleClientIds.length === 0) {
      return new Response(
        JSON.stringify({ data: [], meta: { page, page_size: pageSize, total: 0, total_pages: 0, org_id: orgId } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query
    let query = supabase
      .from('clients')
      .select('id, org_id, name, legal_id, email, phone, is_active', { count: 'exact' })
      .eq('org_id', orgId);

    if (visibleClientIds !== null) {
      query = query.in('id', visibleClientIds);
    }

    // Optional is_active filter
    const isActive = url.searchParams.get('is_active');
    if (isActive === 'true' || isActive === 'false') query = query.eq('is_active', isActive === 'true');

    query = query.order('name', { ascending: true }).range(offset, offset + pageSize - 1);

    const { data: clients, error: queryError, count } = await query;
    if (queryError) {
      return new Response(JSON.stringify({ error: 'Error fetching clients', details: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const total = count || 0;
    return new Response(
      JSON.stringify({
        data: clients || [],
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
