import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-appolo-id-token',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Autoría desde AppOLO ─────────────────────────────────────────────────────
// AppOLO llama con un usuario de integración compartido. Si además manda el
// token de sesión (Firebase) del usuario en `x-appolo-id-token`, se verifica la
// firma contra Google y el cambio se registra a nombre del usuario de SRO con
// ese correo; el historial queda marcado con metadata { source: 'appolo', via_email }.
// Sin token, o con token inválido, todo funciona igual que antes.
const APPOLO_FIREBASE_PROJECT = 'oloos-bd';
const APPOLO_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
// Correo en AppOLO → correo en SRO, cuando no coinciden.
const APPOLO_EMAIL_ALIASES: Record<string, string> = {
  'gcortes@ologistics.com': 'jcortes@ologistics.com',
};

async function appoloEmailFromToken(idToken: string | null): Promise<string | null> {
  if (!idToken) return null;
  try {
    const { payload } = await jwtVerify(idToken, APPOLO_JWKS, {
      issuer: `https://securetoken.google.com/${APPOLO_FIREBASE_PROJECT}`,
      audience: APPOLO_FIREBASE_PROJECT,
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    return email || null;
  } catch {
    return null;
  }
}

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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    // Cliente anónimo EXCLUSIVO para validar el JWT del llamador (nunca service role)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
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
      .select('id, org_id, status_id, is_cancelled, dock_id, is_internal_transfer')
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

    // Validate that the new status_id belongs to this org and is active
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

    // Validar secuencia de estados (con bypass por rol del usuario autenticado).
    // p_enforce_no_reversion=true bloquea retrocesos en la secuencia para la API,
    // incluso si el usuario tiene rol de bypass.
    //
    // Excepción: Traslado Interno → la secuencia de estados (incluye los estados
    // ligados al IN/OUT) no aplica; se permite cualquier cambio de estado.
    if ((reservation as any).is_internal_transfer !== true) {
      const { data: validation } = await supabase.rpc('validate_status_sequence', {
        p_org_id: orgId,
        p_reservation_id: reservationId,
        p_new_status_id: body.status_id,
        p_user_id: userId,
        p_enforce_no_reversion: true,
      });

      if (validation && validation.allowed === false) {
        return new Response(
          JSON.stringify({
            error: validation.message || 'Secuencia de estados inválida',
            code: 'STATUS_SEQUENCE_BLOCKED',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const now = new Date().toISOString();

    // Autor: usuario de SRO homologado por correo si viene un token válido de AppOLO.
    const appoloEmail = await appoloEmailFromToken(req.headers.get('x-appolo-id-token'));
    let actorId = userId;
    if (appoloEmail) {
      const sroEmail = APPOLO_EMAIL_ALIASES[appoloEmail] ?? appoloEmail;
      const { data: sroProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', sroEmail)
        .limit(1)
        .maybeSingle();
      if (sroProfile?.id) actorId = sroProfile.id;
    }

    // Update reservation status — ONLY status_id, never dates
    // The trigger trigger_log_reservation_updated will auto-log the status change into activity_log
    const { data: updated, error: updateError } = await supabase
      .from('reservations')
      .update({ status_id: body.status_id, updated_by: actorId, updated_at: now })
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

    // Marca en el historial que el cambio vino de AppOLO y de qué usuario.
    if (appoloEmail && oldStatusId !== body.status_id) {
      const { data: logRow } = await supabase
        .from('activity_log')
        .select('id, metadata')
        .eq('org_id', orgId)
        .eq('entity_type', 'reservation')
        .eq('entity_id', reservationId)
        .eq('field', 'status_id')
        .eq('new_value', body.status_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (logRow?.id) {
        await supabase
          .from('activity_log')
          .update({ metadata: { ...(logRow.metadata ?? {}), source: 'appolo', via_email: appoloEmail } })
          .eq('id', logRow.id);
      }
    }

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
