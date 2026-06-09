import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ProviderPayload {
  name: string;
  provider_code?: string;
  source?: string;
  provider_type?: 'almacenaje' | 'pesado';
}

interface ExcelPayload {
  org_id: string;
  warehouse_id?: string;
  source?: string;
  providers: ProviderPayload[];
}

async function resolveClientBySource(supabase: any, orgId: string, source: string | null | undefined): Promise<string | null> {
  if (!source) return null;
  const normalized = source.trim().toUpperCase();

  // 1. Buscar en origen_proveedores (fuente de verdad)
  const { data } = await supabase
    .from('origen_proveedores')
    .select('client_id')
    .eq('org_id', orgId)
    .eq('source_code', normalized)
    .eq('is_active', true)
    .maybeSingle();

  if (data?.client_id) return data.client_id;

  // 2. Fallback legacy: mapeo de origen/nombre de compañía → client_id
  const legacyMap: Record<string, string> = {
    // FEBECA
    'FEBECA':   'f64dd648-5b6d-48fd-9f93-64e5a07c34d9',
    '0001':     'f64dd648-5b6d-48fd-9f93-64e5a07c34d9',
    '001':      'f64dd648-5b6d-48fd-9f93-64e5a07c34d9',
    // SILLACA
    'SILLACA':  '9703c174-6789-4487-acaa-36a37d94a6ca',
    '0002':     '9703c174-6789-4487-acaa-36a37d94a6ca',
    '002':      '9703c174-6789-4487-acaa-36a37d94a6ca',
    // Cofersa
    'COFERSA':  'f897b0e2-721f-498d-a5d2-800dd3755139',
    '029':      'f897b0e2-721f-498d-a5d2-800dd3755139',
    '0029':     'f897b0e2-721f-498d-a5d2-800dd3755139',
    // EPA
    'EPA':      'ae488aaf-706a-46fa-9251-d00a35e78384',
    '0109':     'ae488aaf-706a-46fa-9251-d00a35e78384',
  };
  return legacyMap[normalized] ?? null;
}

async function linkProviderToWarehouse(supabase: any, orgId: string, providerId: string, warehouseId: string): Promise<void> {
  const { error } = await supabase
    .from('provider_warehouses')
    .upsert(
      { org_id: orgId, provider_id: providerId, warehouse_id: warehouseId },
      { onConflict: 'org_id,provider_id,warehouse_id' }
    );
  if (error) console.error(`[sync-providers-excel] Error linking provider ${providerId} to warehouse ${warehouseId}:`, error.message);
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
    const { org_id, warehouse_id, providers } = body;
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id es requerido' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

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
        const excelSource = excelProvider.source?.trim().toUpperCase() || null;
        const autoClientId = await resolveClientBySource(supabase, org_id, excelSource);
        const existing = excelCode ? existingMap.get(excelCode) : null;

        if (existing) {
          const needsUpdate =
            existing.name !== excelName ||
            existing.provider_type !== excelType ||
            existing.source !== excelSource;
          if (needsUpdate) {
            const { error: updErr } = await supabase
              .from('providers')
              .update({
                name: excelName,
                provider_type: excelType,
                source: excelSource,
                source_code: excelSource,
                client_id: autoClientId || existing.client_id,
              })
              .eq('id', existing.id);
            if (updErr) throw updErr;
            updated.push({ id: existing.id, name: excelName, code: excelCode, source: excelSource });
          } else {
            preserved.push({ id: existing.id, name: excelName, code: excelCode, source: excelSource });
          }
          // Vincular al warehouse si se especificó
          if (warehouse_id && existing.id) {
            await linkProviderToWarehouse(supabase, org_id, existing.id, warehouse_id);
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
              source: excelSource,
              source_code: excelSource,
              client_id: autoClientId,
            })
            .select('id')
            .single();
          if (insErr) throw insErr;
          created.push({ id: newProv.id, name: excelName, code: excelCode, source: excelSource });
          // Vincular al warehouse si se especificó
          if (warehouse_id && newProv?.id) {
            await linkProviderToWarehouse(supabase, org_id, newProv.id, warehouse_id);
          }
        }
      } catch (err: any) {
        errors.push({ code: excelProvider.provider_code, name: excelProvider.name, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        total: providers.length,
        matched: updated.length + preserved.length,
        inserted: created.length,
        skipped: preserved.length,
        created: created.length,
        updated: updated.length,
        preserved: preserved.length,
        errors: errors.length,
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
