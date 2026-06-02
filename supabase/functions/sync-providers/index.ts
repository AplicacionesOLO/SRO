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

const SOURCE_TO_CLIENT_MAP: Record<string, { id: string }> = {
  '029': { id: 'ae488aaf-706a-46fa-9251-d00a35e78384' },
  '0029': { id: 'ae488aaf-706a-46fa-9251-d00a35e78384' },
  'COFERSA': { id: 'ae488aaf-706a-46fa-9251-d00a35e78384' },
  '0109': { id: 'f897b0e2-721f-498d-a5d2-800dd3755139' },
  'EPA': { id: 'f897b0e2-721f-498d-a5d2-800dd3755139' },
};

function resolveClientBySource(source: string | null | undefined): string | null {
  if (!source) return null;
  const normalized = source.trim().toUpperCase();
  return SOURCE_TO_CLIENT_MAP[normalized]?.id ?? null;
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
    const autoClientId = client_id || resolveClientBySource(normalizedSource);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    // 1. Traer todos los proveedores de la org
    const { data: existingProviders, error: fetchErr } = await supabase
      .from('providers')
      .select('id, name, provider_code, active, provider_type, source, client_id')
      .eq('org_id', org_id);

    if (fetchErr) throw fetchErr;

    const existingMap = new Map((existingProviders || []).map(p => [p.provider_code?.toUpperCase(), p]));
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
        const apiShortName = apiProvider.short_name?.trim().toUpperCase() || null;
        const apiType = apiProvider.provider_type || 'almacenaje';
        const existing = existingMap.get(apiCode);

        if (existing) {
          // Match encontrado
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
                client_id: autoClientId || existing.client_id,
              })
              .eq('id', existing.id);
            if (updErr) throw updErr;
            updated.push({ id: existing.id, name: apiName, code: apiCode });
          } else {
            preserved.push({ id: existing.id, name: apiName, code: apiCode });
          }
        } else {
          // Crear nuevo
          const { data: newProv, error: insErr } = await supabase
            .from('providers')
            .insert({
              org_id,
              name: apiName,
              provider_code: apiCode,
              provider_type: apiType,
              active: true,
              source: normalizedSource,
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
    const apiCodes = new Set(providers.map(p => p.code?.trim().toUpperCase()));
    const toDeactivate = (existingProviders || []).filter(p => p.active && p.provider_code && !apiCodes.has(p.provider_code.toUpperCase()));
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
