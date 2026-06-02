import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ProviderData {
  id_compania: number;
  origen: string;
  id_proveedor: number;
  nombre: string;
}

interface RequestBody {
  providers: ProviderData[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { providers } = body;

    if (!providers || !Array.isArray(providers) || providers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un array de proveedores' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const CLIENT_COFERSA = 'ae488aaf-706a-46fa-9251-d00a35e78384';
    const CLIENT_EPA = 'f897b0e2-721f-498d-a5d2-800dd3755139';
    const ORG_ID = '946ddabf-3874-4c57-85c2-ea7d4b5937f8';
    const CREATED_BY = '00d16810-2a84-417b-ad19-20241ed64b3e';

    const getClientId = (idCompania: number): string | null => {
      if (idCompania === 29) return CLIENT_COFERSA;
      if (idCompania === 109) return CLIENT_EPA;
      return null;
    };

    const { data: existingProviders, error: fetchError } = await supabase
      .from('providers')
      .select('id, name');

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: 'Error fetching existing providers', details: fetchError }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const existingMap = new Map<string, string>();
    for (const p of existingProviders || []) {
      if (p.name) {
        existingMap.set(p.name.trim().toLowerCase(), p.id);
      }
    }

    const matched: { id: string; code: string; source: string; client_id: string | null }[] = [];
    const toInsert: { name: string; provider_code: string; source: string; client_id: string | null }[] = [];

    const processedNames = new Set<string>();
    const duplicateNames: string[] = [];
    const unmatchedNames: string[] = [];

    for (const p of providers) {
      const name = p.nombre?.trim() || '';
      if (!name) continue;
      if (processedNames.has(name.toLowerCase())) {
        duplicateNames.push(name);
        continue;
      }
      processedNames.add(name.toLowerCase());

      const nameLower = name.toLowerCase();
      const existingId = existingMap.get(nameLower);
      const clientId = getClientId(p.id_compania);
      const source = p.origen?.trim() || '';
      const code = p.id_proveedor?.toString() || '';

      if (existingId) {
        matched.push({ id: existingId, code, source, client_id: clientId });
      } else {
        toInsert.push({ name, provider_code: code, source, client_id: clientId });
        unmatchedNames.push(name);
      }
    }

    // Batch update existing providers — individualmente para no bloquear todo el batch
    let updated = 0;
    const updateErrors: string[] = [];
    for (const m of matched) {
      const { error: updateError } = await supabase
        .from('providers')
        .update({
          provider_code: m.code,
          source: m.source,
          client_id: m.client_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', m.id);
      if (updateError) {
        console.error('Update error:', updateError);
        updateErrors.push(String(updateError.message || updateError));
      } else {
        updated += 1;
      }
    }

    // Batch insert new providers
    let inserted = 0;
    const insertErrors: string[] = [];
    const BATCH_SIZE = 50;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from('providers')
        .insert(
          batch.map(p => ({
            name: p.name,
            provider_code: p.provider_code,
            source: p.source,
            client_id: p.client_id,
            org_id: ORG_ID,
            active: true,
            created_by: CREATED_BY,
            provider_type: 'almacenaje',
          }))
        );
      if (insertError) {
        console.error('Insert error:', insertError);
        insertErrors.push(String(insertError.message || insertError));
      } else {
        inserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: providers.length,
        uniqueNames: processedNames.size,
        duplicatesInFile: duplicateNames.length,
        matched: updated,
        inserted: inserted,
        skipped: providers.length - updated - inserted,
        updateErrors: updateErrors.length > 0 ? updateErrors : undefined,
        insertErrors: insertErrors.length > 0 ? insertErrors : undefined,
        sampleUnmatched: unmatchedNames.slice(0, 10),
        sampleExisting: (existingProviders || []).slice(0, 5).map(p => p.name),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
