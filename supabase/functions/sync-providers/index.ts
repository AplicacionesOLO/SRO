import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { org_id, source, client_id, providers: apiProviders } = body;

    if (!org_id || !UUID_REGEX.test(org_id)) {
      return new Response(JSON.stringify({ error: 'org_id required and must be a valid UUID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!source || typeof source !== 'string') {
      return new Response(JSON.stringify({ error: 'source is required (e.g., "EPA", "Cofersa")' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!client_id || !UUID_REGEX.test(client_id)) {
      return new Response(JSON.stringify({ error: 'client_id required and must be a valid UUID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!Array.isArray(apiProviders) || apiProviders.length === 0) {
      return new Response(JSON.stringify({ error: 'providers array is required and must not be empty' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user belongs to org
    const { data: userOrg } = await supabase
      .from('user_org_roles')
      .select('org_id')
      .eq('user_id', userId)
      .eq('org_id', org_id)
      .maybeSingle();

    if (!userOrg) {
      return new Response(JSON.stringify({ error: 'User does not belong to the specified organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin/Full Access permission
    const { data: roleData } = await supabase
      .from('user_org_roles')
      .select('roles!inner(name)')
      .eq('user_id', userId)
      .eq('org_id', org_id);

    const roleNames = (roleData || []).map((r: any) => r.roles?.name).filter(Boolean);
    const hasAdminOrFull = roleNames.includes('ADMIN') || roleNames.includes('Full Access');

    if (!hasAdminOrFull) {
      return new Response(JSON.stringify({ error: 'Permission denied. Only ADMIN or Full Access can sync providers.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // -- FETCH ALL EXISTING PROVIDERS --
    const allProviders: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error } = await supabase
        .from('providers')
        .select('id, name, provider_code, provider_type, active, source, client_id')
        .eq('org_id', org_id)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!page || page.length === 0) break;
      allProviders.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    // Maps for matching
    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const p of allProviders) {
      if (p.provider_code) byCode.set(p.provider_code.trim(), p);
      byName.set(normalizeName(p.name), p);
    }

    // Track which SRO providers were matched
    const processedSroIds = new Set<string>();

    const result = {
      matched: [] as any[],
      created: [] as any[],
      updated: [] as any[],
      deactivated: [] as any[],
      preserved: [] as any[],
      errors: [] as any[],
    };

    // -- PROCESS EACH API PROVIDER --
    for (const apiProvider of apiProviders) {
      const code = (apiProvider.code || '').trim();
      const name = (apiProvider.name || '').trim();
      const shortName = (apiProvider.short_name || '').trim();

      if (!name && !shortName) {
        result.errors.push({ code, name: name || shortName, reason: 'Missing name and short_name' });
        continue;
      }

      const normalizedName = normalizeName(name);
      const normalizedShortName = normalizeName(shortName);
      const providerName = name || shortName;

      // Try match by code first, then by name, then by short_name
      let existing: any = null;
      let matchType = 'none';

      if (code && byCode.has(code)) {
        existing = byCode.get(code);
        matchType = 'code';
      } else if (byName.has(normalizedName)) {
        existing = byName.get(normalizedName);
        matchType = 'name';
      } else if (normalizedShortName && byName.has(normalizedShortName)) {
        existing = byName.get(normalizedShortName);
        matchType = 'short_name';
      }

      if (existing) {
        processedSroIds.add(existing.id);
        const updates: any = {
          provider_code: code || existing.provider_code || null,
          source: source,
          client_id: client_id,
        };

        if (normalizeName(existing.name) !== normalizeName(providerName)) {
          updates.name = providerName;
        }

        if (apiProvider.provider_type && ['almacenaje', 'pesado'].includes(apiProvider.provider_type)) {
          updates.provider_type = apiProvider.provider_type;
        }

        if (!existing.active) {
          updates.active = true;
        }

        const { error: updErr } = await supabase
          .from('providers')
          .update(updates)
          .eq('id', existing.id)
          .eq('org_id', org_id);

        if (updErr) {
          result.errors.push({ code, name: providerName, reason: 'Update error: ' + updErr.message });
          continue;
        }

        const logEntry = {
          id: existing.id,
          code: code,
          name: providerName,
          old_name: existing.name,
          match_type: matchType,
          changes: Object.keys(updates),
        };

        if (matchType === 'code') {
          result.updated.push(logEntry);
        } else {
          result.matched.push(logEntry);
        }
      } else {
        // CREATE new provider
        const { data: newProvider, error: insErr } = await supabase
          .from('providers')
          .insert({
            org_id: org_id,
            name: providerName,
            active: true,
            provider_type: apiProvider.provider_type || 'almacenaje',
            provider_code: code || null,
            source: source,
            client_id: client_id,
          })
          .select('id')
          .single();

        if (insErr) {
          if (insErr.code === '23505') {
            const { data: dup } = await supabase
              .from('providers')
              .select('id')
              .eq('org_id', org_id)
              .ilike('name', providerName)
              .maybeSingle();

            if (dup) {
              processedSroIds.add(dup.id);
              const { error: updErr2 } = await supabase
                .from('providers')
                .update({
                  provider_code: code || null,
                  source: source,
                  client_id: client_id,
                })
                .eq('id', dup.id)
                .eq('org_id', org_id);

              if (updErr2) {
                result.errors.push({ code, name: providerName, reason: 'Duplicate name update error: ' + updErr2.message });
              } else {
                result.matched.push({ id: dup.id, code, name: providerName, match_type: 'duplicate_name', changes: ['provider_code', 'source', 'client_id'] });
              }
              continue;
            }
          }
          result.errors.push({ code, name: providerName, reason: 'Insert error: ' + insErr.message });
          continue;
        }

        result.created.push({ id: newProvider!.id, code, name: providerName });
      }
    }

    // -- FIND PROVIDERS NOT IN API --
    const notInApi = allProviders.filter((p: any) => !processedSroIds.has(p.id));

    for (const provider of notInApi) {
      const { count: resCount } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id)
        .eq('shipper_provider', provider.id);

      const { count: consCount } = await supabase
        .from('reservation_consolidated_providers')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', provider.id);

      const totalReservations = (resCount || 0) + (consCount || 0);

      if (totalReservations > 0) {
        result.preserved.push({
          id: provider.id,
          name: provider.name,
          code: provider.provider_code,
          reservation_count: totalReservations,
        });
      } else {
        const { error: deactErr } = await supabase
          .from('providers')
          .update({ active: false })
          .eq('id', provider.id)
          .eq('org_id', org_id);

        if (deactErr) {
          result.errors.push({
            id: provider.id,
            name: provider.name,
            reason: 'Deactivation error: ' + deactErr.message,
          });
          continue;
        }

        const relatedTables = [
          'provider_warehouses',
          'client_providers',
          'user_providers',
          'provider_cluster_items',
          'provider_cargo_time_profiles',
        ];

        for (const table of relatedTables) {
          const { error: delErr } = await supabase
            .from(table)
            .delete()
            .eq('provider_id', provider.id);
          if (delErr) {
            result.errors.push({
              id: provider.id,
              name: provider.name,
              reason: 'Cleanup error (' + table + '): ' + delErr.message,
            });
          }
        }

        result.deactivated.push({
          id: provider.id,
          name: provider.name,
          code: provider.provider_code,
        });
      }
    }

    const summary = {
      total_api: apiProviders.length,
      matched: result.matched.length,
      updated: result.updated.length,
      created: result.created.length,
      deactivated: result.deactivated.length,
      preserved: result.preserved.length,
      errors: result.errors.length,
    };

    return new Response(
      JSON.stringify({ success: true, summary, details: result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
