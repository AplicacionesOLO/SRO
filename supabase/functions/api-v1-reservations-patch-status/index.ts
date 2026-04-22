import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== 'PATCH') {
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

    // Extract reservation_id from path: /functions/v1/api-v1-reservations-patch-status/{reservation_id}/status
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Path ends in /{reservation_id}/status
    const lastSegment = pathParts[pathParts.length - 1];
    const reservationId = lastSegment === 'status'
      ? pathParts[pathParts.length - 2]
      : lastSegment;

    if (!reservationId || !UUID_REGEX.test(reservationId)) {
      return new Response(JSON.stringify({ error: 'Invalid or missing reservation_id in path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!body.status_id || !UUID_REGEX.test(body.status_id)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid status_id in body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve org_id
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
    const orgId = userOrg.org_id;

    // Fetch reservation to validate access and current state
    const { data: reservation } = await supabase
      .from('reservations')
      .select('id, org_id, status_id, is_cancelled, dock_id')
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!reservation) {
      return new Response(JSON.stringify({ error: 'Reservation not found or not accessible' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (reservation.is_cancelled) {
      return new Response(JSON.stringify({ error: 'Cannot update status of a cancelled reservation' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate that the new status_id belongs to this org
    const { data: statusCheck } = await supabase
      .from('reservation_statuses')
      .select('id, is_active')
      .eq('id', body.status_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!statusCheck) {
      return new Response(JSON.stringify({ error: 'status_id not found in this organization' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!statusCheck.is_active) {
      return new Response(JSON.stringify({ error: 'Cannot assign an inactive status' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const oldStatusId = reservation.status_id;
    const now = new Date().toISOString();

    // Update reservation status
    const { data: updated, error: updateError } = await supabase
      .from('reservations')
      .update({ status_id: body.status_id, updated_by: userId, updated_at: now })
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .select('id, status_id, updated_by, updated_at')
      .maybeSingle();

    if (updateError || !updated) {
      return new Response(JSON.stringify({ error: 'Failed to update reservation status', details: updateError?.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log activity
    await supabase.from('reservation_activity_log').insert({
      org_id: orgId,
      reservation_id: reservationId,
      event_type: 'reservation_status_changed',
      field_name: 'status_id',
      old_value: oldStatusId,
      new_value: body.status_id,
      changed_by: userId,
      changed_at: now,
    });

    return new Response(
      JSON.stringify({ data: { id: updated.id, status_id: updated.status_id, updated_by: updated.updated_by, updated_at: updated.updated_at } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
