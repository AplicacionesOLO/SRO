import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
};

interface PatchStatusBody {
  status_id: string;
  org_id?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // Only allow PATCH method
    if (req.method !== 'PATCH') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Extract reservation ID from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const reservationId = pathParts[pathParts.length - 2]; // .../reservations/{id}/status

    // Validate UUID format for reservation ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!reservationId || !uuidRegex.test(reservationId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid reservation ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: PatchStatusBody;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    if (!body.status_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: status_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate status_id UUID format
    if (!uuidRegex.test(body.status_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid status_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve org_id
    let orgId = body.org_id;

    if (!orgId) {
      // Try to infer org_id from user's organizations
      const { data: userOrgs, error: userOrgsError } = await supabase
        .from('user_org_roles')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (userOrgsError || !userOrgs) {
        return new Response(
          JSON.stringify({ error: 'Could not determine organization. Please provide org_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      orgId = userOrgs.org_id;
    } else {
      // Validate org_id UUID format
      if (!uuidRegex.test(orgId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid org_id format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate user belongs to this organization
      const { data: orgAccess, error: orgAccessError } = await supabase
        .from('user_org_roles')
        .select('org_id')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (orgAccessError || !orgAccess) {
        return new Response(
          JSON.stringify({ error: 'Access denied: user does not belong to this organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check permission: casetilla.view
    // Try using can() function first
    const { data: canResult, error: canError } = await supabase
      .rpc('can', { org_id: orgId, permission_name: 'casetilla.view' })
      .maybeSingle();

    let hasPermission = false;

    if (!canError && canResult !== null) {
      hasPermission = canResult;
    } else {
      // Fallback: manual permission check
      const { data: permCheck, error: permError } = await supabase
        .from('user_org_roles')
        .select(`
          role_id,
          roles!inner(
            id,
            role_permissions!inner(
              permission_id,
              permissions!inner(name)
            )
          )
        `)
        .eq('user_id', userId)
        .eq('org_id', orgId);

      if (!permError && permCheck && permCheck.length > 0) {
        hasPermission = permCheck.some((uor: any) => 
          uor.roles?.role_permissions?.some((rp: any) => 
            rp.permissions?.name === 'casetilla.view'
          )
        );
      }
    }

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Access denied: missing required permission (casetilla.view)' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch current reservation
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('id, org_id, status_id, is_cancelled')
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (fetchError || !reservation) {
      return new Response(
        JSON.stringify({ error: 'Reservation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if reservation is cancelled
    if (reservation.is_cancelled) {
      return new Response(
        JSON.stringify({ error: 'Cannot update status of a cancelled reservation' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate new status_id exists and is active
    const { data: newStatus, error: statusError } = await supabase
      .from('reservation_statuses')
      .select('id, is_active')
      .eq('id', body.status_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (statusError || !newStatus) {
      return new Response(
        JSON.stringify({ error: 'Invalid status_id: status not found for this organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!newStatus.is_active) {
      return new Response(
        JSON.stringify({ error: 'Invalid status_id: status is not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store old value for logging
    const oldStatusId = reservation.status_id;

    // Perform update and log in a transaction-like manner
    // Update reservation status
    const { data: updatedReservation, error: updateError } = await supabase
      .from('reservations')
      .update({
        status_id: body.status_id,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .select('id, org_id, status_id, updated_by, updated_at')
      .single();

    if (updateError || !updatedReservation) {
      return new Response(
        JSON.stringify({ error: 'Failed to update reservation status', details: updateError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert activity log (MANDATORY - must succeed for consistency)
    const { error: logError } = await supabase
      .from('reservation_activity_log')
      .insert({
        org_id: orgId,
        reservation_id: reservationId,
        event_type: 'reservation_status_changed',
        field_name: 'status_id',
        old_value: oldStatusId,
        new_value: body.status_id,
        changed_by: userId,
        changed_at: new Date().toISOString()
      });

    if (logError) {
      // Rollback: revert the status update
      await supabase
        .from('reservations')
        .update({
          status_id: oldStatusId,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', reservationId)
        .eq('org_id', orgId);

      return new Response(
        JSON.stringify({ 
          error: 'Failed to log status change. Update rolled back for consistency.', 
          details: logError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success response
    return new Response(
      JSON.stringify({ data: updatedReservation }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
