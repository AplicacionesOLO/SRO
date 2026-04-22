import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== 'PATCH') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const userId = user.id;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const reservationId = pathParts[pathParts.length - 2];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!reservationId || !uuidRegex.test(reservationId)) return new Response(JSON.stringify({ error: 'Invalid reservation ID format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let body: any;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    if (!body.status_id || !uuidRegex.test(body.status_id)) return new Response(JSON.stringify({ error: 'Missing or invalid status_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let orgId = body.org_id;
    if (!orgId) {
      const { data: userOrgs } = await supabase.from('user_org_roles').select('org_id').eq('user_id', userId).limit(1).maybeSingle();
      if (!userOrgs) return new Response(JSON.stringify({ error: 'Could not determine organization' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      orgId = userOrgs.org_id;
    }

    const { data: reservation } = await supabase.from('reservations').select('id, org_id, status_id, is_cancelled').eq('id', reservationId).eq('org_id', orgId).maybeSingle();
    if (!reservation) return new Response(JSON.stringify({ error: 'Reservation not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (reservation.is_cancelled) return new Response(JSON.stringify({ error: 'Cannot update status of a cancelled reservation' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const oldStatusId = reservation.status_id;
    const { data: updatedReservation, error: updateError } = await supabase.from('reservations').update({ status_id: body.status_id, updated_by: userId, updated_at: new Date().toISOString() }).eq('id', reservationId).eq('org_id', orgId).select('id, org_id, status_id, updated_by, updated_at').single();
    if (updateError || !updatedReservation) return new Response(JSON.stringify({ error: 'Failed to update reservation status', details: updateError?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    await supabase.from('reservation_activity_log').insert({ org_id: orgId, reservation_id: reservationId, event_type: 'reservation_status_changed', field_name: 'status_id', old_value: oldStatusId, new_value: body.status_id, changed_by: userId, changed_at: new Date().toISOString() });

    return new Response(JSON.stringify({ data: updatedReservation }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});