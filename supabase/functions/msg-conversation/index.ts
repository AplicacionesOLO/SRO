import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GLOBAL_ROLES = ['ADMIN', 'SUPERVISOR', 'Full Access'];

function safeJsonResponse(data: unknown, status: number): Response {
  try {
    return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function getScope(supabase: any, orgId: string, uid: string): Promise<{ isGlobal: boolean; warehouseIds: string[] }> {
  const { data: uwa } = await supabase.from('user_warehouse_access').select('warehouse_id, restricted').eq('org_id', orgId).eq('user_id', uid);
  const hasUnrestricted = (uwa ?? []).some((r: any) => r.restricted === false);
  const restricted = (uwa ?? []).filter((r: any) => r.restricted === true);
  if (hasUnrestricted) return { isGlobal: true, warehouseIds: [] };
  if (restricted.length > 0) return { isGlobal: false, warehouseIds: restricted.map((r: any) => r.warehouse_id) };
  const { data: uor } = await supabase.from('user_org_roles').select('roles(name)').eq('user_id', uid).eq('org_id', orgId).maybeSingle();
  const roleName = uor?.roles?.name ?? '';
  if (GLOBAL_ROLES.includes(roleName)) return { isGlobal: true, warehouseIds: [] };
  return { isGlobal: false, warehouseIds: [] };
}

function canMessage(a: any, b: any): boolean {
  if (a.isGlobal || b.isGlobal) return true;
  return a.warehouseIds.some((id: string) => b.warehouseIds.includes(id));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== 'POST') return safeJsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return safeJsonResponse({ error: 'Missing Authorization header' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return safeJsonResponse({ error: 'Invalid token' }, 401);
    const userId = user.id;

    const body = await req.json().catch(() => null);
    if (!body) return safeJsonResponse({ error: 'Invalid JSON body' }, 400);
    const { action, org_id, conversation_id, recipient_id, title, member_ids } = body;
    if (!action || !org_id) return safeJsonResponse({ error: 'action and org_id required' }, 400);

    const myScope = await getScope(supabase, org_id, userId);

    // ── create_direct ──
    if (action === 'create_direct') {
      if (!recipient_id) return safeJsonResponse({ error: 'recipient_id required' }, 400);
      if (recipient_id === userId) return safeJsonResponse({ error: 'No podés chatear con vos mismo' }, 400);
      const theirScope = await getScope(supabase, org_id, recipient_id);
      if (!canMessage(myScope, theirScope)) {
        return safeJsonResponse({ error: 'SCOPE_DENIED', message: 'No compartís un almacén con este usuario' }, 403);
      }
      const { data: myMems } = await supabase.from('msg_conversation_members').select('conversation_id').eq('user_id', userId).eq('org_id', org_id);
      const { data: theirMems } = await supabase.from('msg_conversation_members').select('conversation_id').eq('user_id', recipient_id).eq('org_id', org_id);
      const mySet = new Set((myMems ?? []).map((m: any) => m.conversation_id));
      const candidates = (theirMems ?? []).map((m: any) => m.conversation_id).filter((id: string) => mySet.has(id));
      let existingId: string | null = null;
      if (candidates.length > 0) {
        const { data: convs } = await supabase.from('msg_conversations').select('id, type').in('id', candidates);
        const direct = (convs ?? []).find((c: any) => c.type === 'direct');
        if (direct) existingId = direct.id;
      }
      if (existingId) {
        const { data: c } = await supabase.from('msg_conversations').select('*').eq('id', existingId).single();
        return safeJsonResponse({ conversation: c }, 200);
      }
      const { data: newConv, error: cErr } = await supabase.from('msg_conversations').insert({ org_id, type: 'direct', created_by: userId }).select('id').single();
      if (cErr) return safeJsonResponse({ error: cErr.message }, 500);
      const convId = newConv.id;
      await supabase.from('msg_conversation_members').insert([
        { conversation_id: convId, org_id, user_id: userId },
        { conversation_id: convId, org_id, user_id: recipient_id },
      ]);
      const { data: c } = await supabase.from('msg_conversations').select('*').eq('id', convId).single();
      return safeJsonResponse({ conversation: c }, 201);
    }

    // ── create_group ──
    if (action === 'create_group') {
      if (!title || !Array.isArray(member_ids) || member_ids.length === 0) {
        return safeJsonResponse({ error: 'title and member_ids required' }, 400);
      }
      const allIds = Array.from(new Set([userId, ...member_ids]));
      for (const mid of allIds) {
        if (mid === userId) continue;
        const s = await getScope(supabase, org_id, mid);
        if (!canMessage(myScope, s)) {
          return safeJsonResponse({ error: 'SCOPE_DENIED', message: 'No compartís un almacén con uno de los miembros' }, 403);
        }
      }
      const { data: newConv, error: cErr } = await supabase.from('msg_conversations').insert({ org_id, type: 'group', title, created_by: userId }).select('id').single();
      if (cErr) return safeJsonResponse({ error: cErr.message }, 500);
      const convId = newConv.id;
      const rows = allIds.map((mid: string) => ({ conversation_id: convId, org_id, user_id: mid, member_role: mid === userId ? 'admin' : 'member' }));
      await supabase.from('msg_conversation_members').insert(rows);
      const { data: c } = await supabase.from('msg_conversations').select('*').eq('id', convId).single();
      return safeJsonResponse({ conversation: c }, 201);
    }

    // ── require conversation_id for the rest ──
    if (!conversation_id) return safeJsonResponse({ error: 'conversation_id required' }, 400);

    // Verify membership
    const { data: myMember } = await supabase.from('msg_conversation_members').select('member_role').eq('conversation_id', conversation_id).eq('user_id', userId).maybeSingle();
    if (!myMember) return safeJsonResponse({ error: 'No sos miembro de esta conversación' }, 403);

    if (action === 'rename') {
      if (!title) return safeJsonResponse({ error: 'title required' }, 400);
      const { data: conv } = await supabase.from('msg_conversations').select('type').eq('id', conversation_id).single();
      if (conv?.type !== 'group') return safeJsonResponse({ error: 'Solo se renombran grupos' }, 400);
      await supabase.from('msg_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', conversation_id);
      return safeJsonResponse({ ok: true }, 200);
    }

    if (action === 'toggle_express') {
      const { data: conv } = await supabase.from('msg_conversations').select('is_express').eq('id', conversation_id).single();
      if (!conv) return safeJsonResponse({ error: 'Conversación no encontrada' }, 404);
      const next = !conv.is_express;
      await supabase.from('msg_conversations').update({ is_express: next, updated_at: new Date().toISOString() }).eq('id', conversation_id);
      return safeJsonResponse({ ok: true, is_express: next }, 200);
    }

    if (action === 'add_members') {
      if (!Array.isArray(member_ids)) return safeJsonResponse({ error: 'member_ids required' }, 400);
      for (const mid of member_ids) {
        const s = await getScope(supabase, org_id, mid);
        if (!canMessage(myScope, s)) {
          return safeJsonResponse({ error: 'SCOPE_DENIED', message: 'No compartís un almacén con uno de los miembros' }, 403);
        }
      }
      const rows = member_ids.map((mid: string) => ({ conversation_id, org_id, user_id: mid, member_role: 'member' }));
      const { error } = await supabase.from('msg_conversation_members').upsert(rows, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
      if (error) return safeJsonResponse({ error: error.message }, 500);
      return safeJsonResponse({ ok: true }, 200);
    }

    if (action === 'remove_members') {
      if (!Array.isArray(member_ids)) return safeJsonResponse({ error: 'member_ids required' }, 400);
      if (myMember.member_role !== 'admin') return safeJsonResponse({ error: 'Solo el administrador del grupo puede quitar miembros' }, 403);
      await supabase.from('msg_conversation_members').delete().eq('conversation_id', conversation_id).in('user_id', member_ids);
      return safeJsonResponse({ ok: true }, 200);
    }

    if (action === 'leave') {
      await supabase.from('msg_conversation_members').delete().eq('conversation_id', conversation_id).eq('user_id', userId);
      return safeJsonResponse({ ok: true }, 200);
    }

    return safeJsonResponse({ error: 'Unknown action' }, 400);
  } catch (error: any) {
    console.error('[msg-conversation] ERROR:', error?.message || error);
    return safeJsonResponse({ error: 'Internal server error', detail: error?.message || String(error) }, 500);
  }
});
