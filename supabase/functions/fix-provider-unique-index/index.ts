import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const steps: string[] = [];

    // 1. Verificar si existe el índice viejo
    const { data: oldIndex } = await supabase.rpc('check_old_provider_index');
    
    if (oldIndex) {
      // 2. Intentar dropear el índice viejo vía RPC
      const { error: dropErr } = await supabase.rpc('drop_old_provider_index');
      if (dropErr) {
        steps.push(`WARN: No se pudo eliminar índice viejo: ${dropErr.message}`);
      } else {
        steps.push('OK: providers_org_name_uniq eliminado');
      }
    } else {
      steps.push('INFO: providers_org_name_uniq ya no existe');
    }

    // 3. Verificar si existe el nuevo índice
    const { data: newIndex } = await supabase.rpc('check_new_provider_index');
    
    if (!newIndex) {
      steps.push('INFO: providers_org_name_code_uniq no existe aún. Creándolo vía RPC...');
      const { error: createErr } = await supabase.rpc('create_new_provider_index');
      if (createErr) {
        steps.push(`ERROR: No se pudo crear índice nuevo: ${createErr.message}`);
      } else {
        steps.push('OK: providers_org_name_code_uniq creado');
      }
    } else {
      steps.push('OK: providers_org_name_code_uniq ya existe');
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Migración de índice completada. La llave única ahora es (org_id, nombre, código).',
      steps,
    }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || String(err),
    }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});