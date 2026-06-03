import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ExcelPayload {
  org_id: string;
  source: string;
  providers: Array<{
    name: string;
    provider_code?: string;
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
    const body = (await req.json()) as ExcelPayload;
    const { org_id, source, providers } = body;
    const normalizedSource = source?.trim().toUpperCase() || null;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const autoClientId = await resolveClientBySource(supabase, org_id, normalizedSource);

    // 1. Traer todos los proveedores de la org
    const { data: existingProviders, error: fetchErr } = await supabase
      .from('providers')
      .select('id, name, provider_code, active, provider_type, source, source_code, client_id')
      .eq('org_id', org_id);

    if (fetchErr) throw fetchErr;

    const existingMap = new Map((existingProviders || []).map((p: any) => [p.provider_code?.toUpperCase(), p]));
    const created: any[] = [];
    const updated: any[] = [];
    const preserved: any[] = [];
    const errors: any[] = [];

    // 2. Procesar cada proveedor del Excel
    for (const excelProvider of providers) {
      try {
        const excelCode = excelProvider.provider_code?.trim().toUpperCase();
        const excelName = excelProvider.name?.trim().toUpperCase();
        const excelType = excelProvider.provider_type || 'almacenaje';
        const existing = excelCode ? existingMap.get(excelCode) : null;

        if (existing) {
          const needsUpdate = existing.name !== excelName || existing.provider_type !== excelType;
          if (needsUpdate) {
            const { error: updErr } = await supabase
              .from('providers')
              .update({
                name: excelName,
                provider_type: excelType,
                source: normalizedSource,
                source_code: normalizedSource,
                client_id: autoClientId || existing.client_id,
              })
              .eq('id', existing.id);
            if (updErr) throw updErr;
            updated.push({ id: existing.id, name: excelName, code: excelCode });
          } else {
            preserved.push({ id: existing.id, name: excelName, code: excelCode });
          }
        } else {
          const { data: newProv, error: insErr } = await supabase
            .from('providers')
            .insert({
              org_id,
              name: excelName,
              provider_code: excelCode,
              provider_type: excelType,
              active: true,
              source: normalizedSource,
              source_code: normalizedSource,
              client_id: autoClientId,
            })
            .select('id')
            .single();
          if (insErr) throw insErr;
          created.push({ id: newProv.id, name: excelName, code: excelCode });
        }
      } catch (err: any) {
        errors.push({ code: excelProvider.provider_code, name: excelProvider.name, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        summary: {
          total: providers.length,
          created: created.length,
          updated: updated.length,
          preserved: preserved.length,
          errors: errors.length,
        },
        details: { created, updated, preserved, errors },
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