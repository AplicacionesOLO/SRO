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

  const { data } = await supabase
    .from('origen_proveedores')
    .select('client_id')
    .eq('org_id', orgId)
    .eq('source_code', normalized)
    .eq('is_active', true)
    .maybeSingle();

  if (data?.client_id) return data.client_id;

  const legacyMap: Record<string, string> = {
    'FEBECA':   'f64dd648-5b6d-48fd-9f93-64e5a07c34d9',
    '0001':     'f64dd648-5b6d-48fd-9f93-64e5a07c34d9',
    '001':      'f64dd648-5b6d-48fd-9f93-64e5a07c34d9',
    'SILLACA':  '9703c174-6789-4487-acaa-36a37d94a6ca',
    '0002':     '9703c174-6789-4487-acaa-36a37d94a6ca',
    '002':      '9703c174-6789-4487-acaa-36a37d94a6ca',
    'COFERSA':  'f897b0e2-721f-498d-a5d2-800dd3755139',
    '029':      'f897b0e2-721f-498d-a5d2-800dd3755139',
    '0029':     'f897b0e2-721f-498d-a5d2-800dd3755139',
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

function normalizeName(s: string): string {
  return (s ?? '').trim().toUpperCase();
}

async function fetchAllProviders(supabase: any, orgId: string): Promise<any[]> {
  const all: any[] = [];
  const PAGE_SIZE = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('providers')
      .select('id, name, name_normalized, provider_code, code_normalized, active, provider_type, source, source_code, client_id, source_normalized')
      .eq('org_id', orgId)
      .range(from, to)
      .order('name');

    if (error) throw error;
    if (data && data.length > 0) {
      all.push(...data);
      page++;
      if (data.length < PAGE_SIZE) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return all;
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

    const existingProviders = await fetchAllProviders(supabase, org_id);

    // === MAPA PRINCIPAL: name_normalized + source_normalized → provider ===
    // El código NO es identificador único. Dos proveedores con mismo código
    // pero diferente origen SON PROVEEDORES DIFERENTES.
    const existingByNameSource = new Map<string, any>();
    const existingByCode = new Map<string, any[]>();

    for (const p of existingProviders) {
      const nn = normalizeName(p.name);
      const src = p.source || '';
      const key = `${nn}|||${src}`;

      if (!existingByNameSource.has(key)) {
        existingByNameSource.set(key, p);
      }

      if (p.provider_code) {
        const code = p.provider_code.toUpperCase();
        if (!existingByCode.has(code)) {
          existingByCode.set(code, []);
        }
        existingByCode.get(code)!.push(p);
      }
    }

    // === REGLA 1: Rechazar filas sin código ===
    const rejectedMissingCode: any[] = [];
    const withCode: ProviderPayload[] = [];
    for (const ep of providers) {
      const code = ep.provider_code?.trim().toUpperCase();
      if (!code || code === '') {
        rejectedMissingCode.push({
          name: ep.name,
          provider_code: ep.provider_code,
          source: ep.source,
          reason: 'Falta el código del proveedor',
        });
      } else {
        withCode.push(ep);
      }
    }

    // === REGLA 2: Rechazar duplicados en Excel por nombre + origen ===
    const seenNameSource = new Map<string, ProviderPayload>();
    const dedupedProviders: ProviderPayload[] = [];
    const rejectedDuplicateInExcel: any[] = [];
    for (const ep of withCode) {
      const excelName = normalizeName(ep.name);
      const excelSource = ep.source?.trim().toUpperCase() || '';
      const key = `${excelName}|||${excelSource}`;
      if (seenNameSource.has(key)) {
        const first = seenNameSource.get(key)!;
        rejectedDuplicateInExcel.push({
          name: ep.name,
          provider_code: ep.provider_code,
          source: ep.source,
          firstCode: first.provider_code,
          reason: `Duplicado en Excel: el proveedor "${ep.name}" con origen "${ep.source}" ya aparece con código "${first.provider_code}"`,
        });
      } else {
        seenNameSource.set(key, ep);
        dedupedProviders.push(ep);
      }
    }

    // === MATCHING: name + source es el identificador único ===
    const toCreate: any[] = [];
    const toUpdate: any[] = [];
    const preserved: any[] = [];
    const errors: any[] = [];
    const warehouseLinks: { providerId: string; existing: boolean }[] = [];

    for (const excelProvider of dedupedProviders) {
      try {
        const excelCode = excelProvider.provider_code?.trim().toUpperCase();
        const excelName = normalizeName(excelProvider.name);
        const excelType = excelProvider.provider_type || 'almacenaje';
        const excelSource = excelProvider.source?.trim().toUpperCase() || null;
        const autoClientId = await resolveClientBySource(supabase, org_id, excelSource);

        const nameSourceKey = `${excelName}|||${excelSource || ''}`;
        const existing = existingByNameSource.get(nameSourceKey);

        if (existing) {
          const needsUpdate =
            existing.name !== excelProvider.name ||
            existing.provider_code !== excelCode ||
            existing.provider_type !== excelType ||
            existing.source !== excelSource;

          if (needsUpdate) {
            const updates: any = {
              name: excelProvider.name,
              provider_code: excelCode,
              provider_type: excelType,
              source: excelSource,
              source_code: excelSource,
              client_id: autoClientId || existing.client_id,
            };
            toUpdate.push({ id: existing.id, code: excelCode, updates });
          } else {
            preserved.push({ id: existing.id, name: excelProvider.name, code: excelCode, source: excelSource });
          }
          if (warehouse_id) {
            warehouseLinks.push({ providerId: existing.id, existing: true });
          }
        } else {
          toCreate.push({
            org_id,
            name: excelProvider.name,
            provider_code: excelCode,
            provider_type: excelType,
            active: true,
            source: excelSource,
            source_code: excelSource,
            client_id: autoClientId,
          });
        }
      } catch (err: any) {
        errors.push({ code: excelProvider.provider_code, name: excelProvider.name, error: err.message });
      }
    }

    // === UPSERT: usar columnas reales que existen en el UNIQUE CONSTRAINT ===
    // CONSTRAINT: providers_name_source_uniq ON (org_id, name_normalized, source_normalized)
    // name_normalized y source_normalized son columnas generadas — se calculan automáticamente.
    const created: any[] = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from('providers')
        .upsert(batch, { onConflict: 'org_id, name_normalized, source_normalized' })
        .select('id, name, provider_code, source');

      if (error) {
        errors.push({ code: 'BATCH', name: 'BATCH', error: `Batch ${i}-${i + batch.length}: ${error.message}` });
        console.error(`[sync-providers-excel] Batch upsert error:`, error.message);
      } else if (data) {
        for (const row of data) {
          created.push({ id: row.id, name: row.name, code: row.provider_code, source: row.source });
          if (warehouse_id) {
            warehouseLinks.push({ providerId: row.id, existing: false });
          }
        }
      }
    }

    // === UPDATE individual ===
    const updated: any[] = [];
    for (const item of toUpdate) {
      const { error: updErr } = await supabase
        .from('providers')
        .update(item.updates)
        .eq('id', item.id);

      if (updErr) {
        errors.push({ code: 'UPDATE', name: `Update ${item.code}`, error: updErr.message });
      } else {
        updated.push({ id: item.id, name: item.updates.name, code: item.code, source: item.updates.source });
      }
    }

    // === Vincular a bodega ===
    if (warehouse_id && warehouseLinks.length > 0) {
      const LINK_BATCH = 100;
      const uniqueLinks = new Map<string, boolean>();
      for (const wl of warehouseLinks) {
        if (!uniqueLinks.has(wl.providerId)) {
          uniqueLinks.set(wl.providerId, wl.existing);
        }
      }
      const linksArr = Array.from(uniqueLinks.entries()).map(([providerId, existing]) => ({ providerId, existing }));

      for (let i = 0; i < linksArr.length; i += LINK_BATCH) {
        const batch = linksArr.slice(i, i + LINK_BATCH);
        const promises = batch.map((wl) => linkProviderToWarehouse(supabase, org_id, wl.providerId, warehouse_id));
        await Promise.all(promises);
      }
    }

    return new Response(
      JSON.stringify({
        total: providers.length,
        processed: dedupedProviders.length,
        rejectedMissingCode: rejectedMissingCode.length,
        rejectedDuplicateInExcel: rejectedDuplicateInExcel.length,
        inserted: created.length,
        updated: updated.length,
        preserved: preserved.length,
        errors: errors.length,
        details: {
          created,
          updated,
          preserved,
          rejectedMissingCode,
          rejectedDuplicateInExcel,
          errors,
        },
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
