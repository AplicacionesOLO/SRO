import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface SyncPayload {
  org_id: string;
  source: string;
  client_id?: string;
  providers: Array<{
    code: string;
    name: string;
    short_name?: string;
    provider_type?: 'almacenaje' | 'pesado';
  }>;
}

async function resolveClientBySource(supabase: any, orgId: string, source: string | null | undefined): Promise<string | null> {
  if (!source) return null;
  const normalized = source.trim().toUpperCase();
  
  // 1. Primero buscar en origen_proveedores (fuente de verdad)
  const { data } = await supabase
    .from('origen_proveedores')
    .select('client_id')
    .eq('org_id', orgId)
    .eq('source_code', normalized)
    .eq('is_active', true)
    .maybeSingle();
  
  if (data?.client_id) return data.client_id;
  
  // 2. Fallback legacy para nombres de compañía
  // El campo 'source' indica el sistema de origen de los datos:
  //   - 'EPA'      = datos provenientes del sistema EPA (IDCOMPANIA=109, código 0109)
  //   - 'COFERSA'  = datos provenientes del sistema COFERSA (IDCOMPANIA=29, código 029)
  // El cliente al que pertenecen los proveedores es el opuesto al origen:
  //   - origen EPA     → cliente Cofersa
  //   - origen COFERSA → cliente EPA
  const legacyMap: Record<string, string> = {
    'COFERSA': 'f897b0e2-721f-498d-a5d2-800dd3755139',
    'EPA':     'ae488aaf-706a-46fa-9251-d00a35e78384',
    '0109':    'ae488aaf-706a-46fa-9251-d00a35e78384',
    '029':     'f897b0e2-721f-498d-a5d2-800dd3755139',
    '0029':    'f897b0e2-721f-498d-a5d2-800dd3755139',
  };
  return legacyMap[normalized] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = (await req.json()) as SyncPayload;
    const { org_id, source, client_id, providers } = body;
    const normalizedSource = source?.trim().toUpperCase() || null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const autoClientId = client_id || await resolveClientBySource(supabase, org_id, normalizedSource);

    // 1. Traer todos los proveedores de la org
    const { data: existingProviders, error: fetchErr } = await supabase
      .from('providers')
      .select('id, name, provider_code, active, provider_type, source, source_code, client_id')
      .eq('org_id', org_id);

    if (fetchErr) throw fetchErr;

    const existingMap = new Map((existingProviders || []).map((p: any) => [p.provider_code?.toUpperCase(), p]));
    const matched: any[] = [];
    const created: any[] = [];
    const updated: any[] = [];
    const deactivated: any[] = [];
    const preserved: any[] = [];
    const errors: any[] = [];

    // 2. Procesar cada proveedor de la API
    for (const apiProvider of providers) {
      try {
        const apiCode = apiProvider.code?.trim().toUpperCase();
        const apiName = apiProvider.name?.trim().toUpperCase();
        const apiType = apiProvider.provider_type || 'almacenaje';
        const existing = existingMap.get(apiCode);

        if (existing) {
          matched.push({ id: existing.id, name: apiName, code: apiCode });
          const needsUpdate =
            existing.name !== apiName ||
            existing.provider_type !== apiType;

          if (needsUpdate) {
            const { error: updErr } = await supabase
              .from('providers')
              .update({
                name: apiName,
                provider_type: apiType,
                source: normalizedSource,
                source_code: normalizedSource,
                client_id: autoClientId || existing.client_id,
              })
              .eq('id', existing.id);
            if (updErr) throw updErr;
            updated.push({ id: existing.id, name: apiName, code: apiCode });
          } else {
            preserved.push({ id: existing.id, name: apiName, code: apiCode });
          }
        } else {
          const { data: newProv, error: insErr } = await supabase
            .from('providers')
            .insert({
              org_id,
              name: apiName,
              provider_code: apiCode,
              provider_type: apiType,
              active: true,
              source: normalizedSource,
              source_code: normalizedSource,
              client_id: autoClientId,
            })
            .select('id')
            .single();
          if (insErr) throw insErr;
          created.push({ id: newProv.id, name: apiName, code: apiCode });
        }
      } catch (err: any) {
        errors.push({ code: apiProvider.code, name: apiProvider.name, error: err.message });
      }
    }

    // 3. Desactivar proveedores que no aparecen en la API
    const apiCodes = new Set(providers.map((p: any) => p.code?.trim().toUpperCase()));
    const toDeactivate = (existingProviders || []).filter((p: any) => p.active && p.provider_code && !apiCodes.has(p.provider_code.toUpperCase()));
    for (const prov of toDeactivate) {
      const { error: delErr } = await supabase
        .from('providers')
        .update({ active: false })
        .eq('id', prov.id);
      if (delErr) {
        errors.push({ code: prov.provider_code, name: prov.name, error: delErr.message });
      } else {
        deactivated.push({ id: prov.id, name: prov.name, code: prov.provider_code });
      }
    }

    return new Response(
      JSON.stringify({
        summary: {
          total_api: providers.length,
          matched: matched.length,
          updated: updated.length,
          created: created.length,
          deactivated: deactivated.length,
          preserved: preserved.length,
          errors: errors.length,
        },
        details: { matched, created, updated, deactivated, preserved, errors },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});