import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const userId = user.id;
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    let orgId = url.searchParams.get('org_id') || undefined;
    if (!orgId) {
      const { data: userOrgs } = await supabase.from('user_org_roles').select('org_id').eq('user_id', userId).limit(1).single();
      if (!userOrgs) return new Response(JSON.stringify({ error: 'org_id is required or cannot be inferred' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      orgId = userOrgs.org_id;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orgId)) return new Response(JSON.stringify({ error: 'Invalid org_id format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: userOrgCheck } = await supabase.from('user_org_roles').select('org_id').eq('user_id', userId).eq('org_id', orgId).maybeSingle();
    if (!userOrgCheck) return new Response(JSON.stringify({ error: 'User does not belong to the specified organization' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let query = supabase.from('reservations').select('*', { count: 'exact' }).eq('org_id', orgId);

    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const dock_id = url.searchParams.get('dock_id');
    const status_id = url.searchParams.get('status_id');
    const is_cancelled = url.searchParams.get('is_cancelled');

    if (from) query = query.gte('start_datetime', from);
    if (to) query = query.lte('end_datetime', to);
    if (dock_id && uuidRegex.test(dock_id)) query = query.eq('dock_id', dock_id);
    if (status_id && uuidRegex.test(status_id)) query = query.eq('status_id', status_id);
    if (is_cancelled === 'true' || is_cancelled === 'false') query = query.eq('is_cancelled', is_cancelled === 'true');

    query = query.order('start_datetime', { ascending: false }).range(offset, offset + limit - 1);

    const { data: reservations, error: queryError, count } = await query;
    if (queryError) return new Response(JSON.stringify({ error: 'Error fetching reservations', details: queryError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ data: reservations || [], meta: { limit, offset, count: count || null } }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});