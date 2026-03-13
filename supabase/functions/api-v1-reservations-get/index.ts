import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryParams {
  org_id?: string;
  from?: string;
  to?: string;
  dock_id?: string;
  status_id?: string;
  is_cancelled?: string;
  limit?: string;
  offset?: string;
  include?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Parse query parameters
    const url = new URL(req.url);
    const params: QueryParams = {
      org_id: url.searchParams.get('org_id') || undefined,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      dock_id: url.searchParams.get('dock_id') || undefined,
      status_id: url.searchParams.get('status_id') || undefined,
      is_cancelled: url.searchParams.get('is_cancelled') || undefined,
      limit: url.searchParams.get('limit') || '50',
      offset: url.searchParams.get('offset') || '0',
      include: url.searchParams.get('include') || undefined,
    };

    // Validate and parse limit (1-500)
    const limit = parseInt(params.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 500) {
      return new Response(
        JSON.stringify({ error: 'Invalid limit parameter. Must be between 1 and 500' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and parse offset
    const offset = parseInt(params.offset, 10);
    if (isNaN(offset) || offset < 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid offset parameter. Must be >= 0' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine org_id
    let orgId = params.org_id;
    if (!orgId) {
      // Try to infer org_id from user's organizations
      const { data: userOrgs, error: userOrgsError } = await supabase
        .from('user_org_roles')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (userOrgsError || !userOrgs) {
        return new Response(
          JSON.stringify({ error: 'org_id is required or cannot be inferred' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      orgId = userOrgs.org_id;
    }

    // Validate UUID format for org_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orgId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid org_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate user belongs to org
    const { data: userOrgCheck, error: userOrgError } = await supabase
      .from('user_org_roles')
      .select('org_id')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (userOrgError || !userOrgCheck) {
      return new Response(
        JSON.stringify({ error: 'User does not belong to the specified organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for casetilla.view permission
    // First, try to use can() function if it exists
    const { data: canResult, error: canError } = await supabase.rpc('can', {
      p_org_id: orgId,
      p_permission: 'casetilla.view',
    }).maybeSingle();

    let hasPermission = false;

    if (!canError && canResult !== null) {
      // can() function exists and returned a result
      hasPermission = canResult === true;
    } else {
      // Fallback: manual permission check
      const { data: permissionCheck, error: permError } = await supabase
        .from('user_org_roles')
        .select(`
          role_id,
          roles!inner(
            id,
            role_permissions!inner(
              permission_id,
              permissions!inner(
                name
              )
            )
          )
        `)
        .eq('user_id', userId)
        .eq('org_id', orgId);

      if (permError) {
        return new Response(
          JSON.stringify({ error: 'Error checking permissions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if any role has casetilla.view permission
      hasPermission = permissionCheck?.some((userRole: any) => {
        return userRole.roles?.role_permissions?.some((rp: any) => {
          return rp.permissions?.name === 'casetilla.view';
        });
      }) || false;
    }

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions. casetilla.view permission required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate optional UUID parameters
    if (params.dock_id && !uuidRegex.test(params.dock_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid dock_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (params.status_id && !uuidRegex.test(params.status_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid status_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate date parameters
    if (params.from && isNaN(Date.parse(params.from))) {
      return new Response(
        JSON.stringify({ error: 'Invalid from date format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (params.to && isNaN(Date.parse(params.to))) {
      return new Response(
        JSON.stringify({ error: 'Invalid to date format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate is_cancelled parameter
    if (params.is_cancelled && !['true', 'false'].includes(params.is_cancelled.toLowerCase())) {
      return new Response(
        JSON.stringify({ error: 'Invalid is_cancelled parameter. Must be true or false' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query
    let query = supabase
      .from('reservations')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId);

    // Apply filters
    if (params.from) {
      query = query.gte('start_datetime', params.from);
    }

    if (params.to) {
      query = query.lte('end_datetime', params.to);
    }

    if (params.dock_id) {
      query = query.eq('dock_id', params.dock_id);
    }

    if (params.status_id) {
      query = query.eq('status_id', params.status_id);
    }

    if (params.is_cancelled) {
      query = query.eq('is_cancelled', params.is_cancelled.toLowerCase() === 'true');
    }

    // Apply ordering, limit, and offset
    query = query
      .order('start_datetime', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: reservations, error: queryError, count } = await query;

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Error fetching reservations', details: queryError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle include parameter for related data
    const includes = params.include?.split(',').map(i => i.trim()) || [];
    let enrichedData = reservations || [];

    if (includes.length > 0 && enrichedData.length > 0) {
      // Fetch related data if requested
      const dockIds = [...new Set(enrichedData.map(r => r.dock_id).filter(Boolean))];
      
      let docksMap: Record<string, any> = {};
      let warehousesMap: Record<string, any> = {};

      if (includes.includes('dock') && dockIds.length > 0) {
        const { data: docks } = await supabase
          .from('docks')
          .select('*')
          .in('id', dockIds);

        if (docks) {
          docksMap = Object.fromEntries(docks.map(d => [d.id, d]));
        }

        // If warehouse is also requested, fetch warehouses
        if (includes.includes('warehouse')) {
          const warehouseIds = [...new Set(docks?.map(d => d.warehouse_id).filter(Boolean) || [])];
          if (warehouseIds.length > 0) {
            const { data: warehouses } = await supabase
              .from('warehouses')
              .select('*')
              .in('id', warehouseIds);

            if (warehouses) {
              warehousesMap = Object.fromEntries(warehouses.map(w => [w.id, w]));
            }
          }
        }
      }

      // Enrich data
      enrichedData = enrichedData.map(reservation => {
        const enriched: any = { ...reservation };

        if (includes.includes('dock') && reservation.dock_id && docksMap[reservation.dock_id]) {
          enriched.dock = docksMap[reservation.dock_id];

          if (includes.includes('warehouse') && enriched.dock.warehouse_id && warehousesMap[enriched.dock.warehouse_id]) {
            enriched.warehouse = warehousesMap[enriched.dock.warehouse_id];
          }
        }

        return enriched;
      });
    }

    // Return response
    return new Response(
      JSON.stringify({
        data: enrichedData,
        meta: {
          limit,
          offset,
          count: count || null,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});