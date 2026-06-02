import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import QRCode from 'https://esm.sh/qrcode@1.5.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESERVATION_QRS_BUCKET = 'reservation-qrs';

interface SROQRPayload {
  type: 'sro_reservation';
  reservation_id: string;
}

function buildQRPayload(reservationId: string): string {
  const payload: SROQRPayload = {
    type: 'sro_reservation',
    reservation_id: reservationId,
  };
  return JSON.stringify(payload);
}

async function generateQRPNG(reservationId: string): Promise<Uint8Array> {
  const payload = buildQRPayload(reservationId);
  
  // Generar QR como PNG buffer
  const buffer = await QRCode.toBuffer(payload, {
    width: 400,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'H',
    type: 'png',
  });
  
  return new Uint8Array(buffer);
}

async function processReservation(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  reservationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Generar QR PNG
    const pngData = await generateQRPNG(reservationId);
    
    const path = `${orgId}/reservations/${reservationId}/qr.png`;
    
    // Subir a Storage
    const { error: uploadError } = await supabase.storage
      .from(RESERVATION_QRS_BUCKET)
      .upload(path, pngData, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/png',
      });
    
    if (uploadError) {
      return { success: false, error: `Upload error: ${uploadError.message}` };
    }
    
    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from(RESERVATION_QRS_BUCKET)
      .getPublicUrl(path);
    
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      return { success: false, error: 'Could not get public URL' };
    }
    
    // Actualizar la reserva con la URL del QR
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ qr_image_url: publicUrl })
      .eq('id', reservationId)
      .eq('org_id', orgId);
    
    if (updateError) {
      return { success: false, error: `Update error: ${updateError.message}` };
    }
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }
  
  if (req.method !== 'POST') {
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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
    
    // Verificar usuario
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Obtener org_id del usuario
    const { data: userOrg } = await supabase
      .from('user_org_roles')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    
    if (!userOrg?.org_id) {
      return new Response(JSON.stringify({ error: 'User does not belong to any organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const orgId = userOrg.org_id;
    
    // Obtener parámetros opcionales del body
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body?.batch_size || 50, 100); // máximo 100 por llamada
    const daysBack = body?.days_back || 60; // reservas de los últimos N días sin QR
    
    // Buscar reservas sin QR (no canceladas, dentro del rango de fechas)
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    
    const { data: reservations, error: fetchError } = await supabase
      .from('reservations')
      .select('id, org_id')
      .eq('org_id', orgId)
      .is('qr_image_url', null)
      .eq('is_cancelled', false)
      .gte('start_datetime', fromDate.toISOString())
      .order('start_datetime', { ascending: true })
      .limit(batchSize);
    
    if (fetchError) {
      return new Response(JSON.stringify({ error: 'Error fetching reservations', details: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!reservations || reservations.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No hay reservas pendientes de QR',
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Procesar reservas en paralelo (grupos de 5 para no sobrecargar Storage)
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    const chunkSize = 5;
    
    for (let i = 0; i < reservations.length; i += chunkSize) {
      const chunk = reservations.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (r: any) => {
          const result = await processReservation(supabase, orgId, r.id);
          return { id: r.id, ...result };
        })
      );
      results.push(...chunkResults);
    }
    
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const errors = results.filter(r => !r.success).map(r => ({ id: r.id, error: r.error }));
    
    // Contar cuántas quedan pendientes
    const { count: remaining } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('qr_image_url', null)
      .eq('is_cancelled', false)
      .gte('start_datetime', fromDate.toISOString());
    
    return new Response(JSON.stringify({
      success: true,
      message: `Procesadas ${reservations.length} reservas`,
      processed: reservations.length,
      succeeded,
      failed,
      remaining: remaining || 0,
      errors: errors.slice(0, 10), // máximo 10 errores en la respuesta
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
