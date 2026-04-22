import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // Extract reservation_id from path: /functions/v1/api-v1-reservations-get-by-id/{reservation_id}
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const reservationId = pathParts[pathParts.length - 1];

    if (!reservationId || !UUID_REGEX.test(reservationId)) {
      return new Response(JSON.stringify({ error: 'Invalid or missing reservation_id in path' }), {
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

    // Fetch reservation with enriched joins
    const { data: r, error: queryError } = await supabase
      .from('reservations')
      .select(
        `id, org_id, dock_id, start_datetime, end_datetime, status_id,
         is_cancelled, cancel_reason, cancelled_by, cancelled_at,
         dua, invoice, driver, truck_plate, purchase_order, order_request_number,
         shipper_provider, client_id, operation_type, is_imported, bl_number,
         quantity_value, notes, transport_type, cargo_type, recurrence,
         created_by, created_at, updated_by, updated_at,
         docks(id, name, reference, warehouse_id, warehouses(id, name, location, timezone)),
         reservation_statuses(id, name, code, color, order_index),
         clients(id, name, email, phone)`
      )
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (queryError) {
      return new Response(JSON.stringify({ error: 'Error fetching reservation', details: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!r) {
      return new Response(JSON.stringify({ error: 'Reservation not found or not accessible' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user has access to this reservation's dock
    // Check warehouse access
    const dockWarehouseId = r.docks?.warehouse_id;
    if (dockWarehouseId) {
      const { data: warehouseAccess } = await supabase
        .from('user_warehouse_access')
        .select('warehouse_id, restricted')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('restricted', true);

      if (warehouseAccess && warehouseAccess.length > 0) {
        const allowedWarehouseIds = warehouseAccess.map((w: any) => w.warehouse_id);
        if (!allowedWarehouseIds.includes(dockWarehouseId)) {
          return new Response(JSON.stringify({ error: 'Reservation not found or not accessible' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Fetch activity log for this reservation
    const { data: activityLog } = await supabase
      .from('reservation_activity_log')
      .select('id, event_type, field_name, old_value, new_value, changed_by, changed_at')
      .eq('reservation_id', reservationId)
      .eq('org_id', orgId)
      .order('changed_at', { ascending: false })
      .limit(20);

    // Shape enriched response
    const shaped = {
      id: r.id,
      org_id: r.org_id,
      dock_id: r.dock_id,
      dock_name: r.docks?.name ?? null,
      dock_reference: r.docks?.reference ?? null,
      warehouse_id: r.docks?.warehouse_id ?? null,
      warehouse_name: r.docks?.warehouses?.name ?? null,
      warehouse_location: r.docks?.warehouses?.location ?? null,
      warehouse_timezone: r.docks?.warehouses?.timezone ?? null,
      start_datetime: r.start_datetime,
      end_datetime: r.end_datetime,
      status_id: r.status_id,
      status_name: r.reservation_statuses?.name ?? null,
      status_code: r.reservation_statuses?.code ?? null,
      status_color: r.reservation_statuses?.color ?? null,
      status_order_index: r.reservation_statuses?.order_index ?? null,
      is_cancelled: r.is_cancelled,
      cancel_reason: r.cancel_reason,
      cancelled_by: r.cancelled_by,
      cancelled_at: r.cancelled_at,
      dua: r.dua,
      invoice: r.invoice,
      driver: r.driver,
      truck_plate: r.truck_plate,
      purchase_order: r.purchase_order,
      order_request_number: r.order_request_number,
      shipper_provider: r.shipper_provider,
      client_id: r.client_id,
      client_name: r.clients?.name ?? null,
      client_email: r.clients?.email ?? null,
      client_phone: r.clients?.phone ?? null,
      operation_type: r.operation_type,
      is_imported: r.is_imported,
      bl_number: r.bl_number,
      quantity_value: r.quantity_value,
      notes: r.notes,
      transport_type: r.transport_type,
      cargo_type: r.cargo_type,
      recurrence: r.recurrence,
      created_by: r.created_by,
      created_at: r.created_at,
      updated_by: r.updated_by,
      updated_at: r.updated_at,
      activity_log: activityLog || [],
    };

    return new Response(
      JSON.stringify({ data: shaped }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
