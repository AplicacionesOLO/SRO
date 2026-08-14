import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const GLOBAL_ROLES = ['ADMIN', 'SUPERVISOR', 'Full Access'];

function safeJsonResponse(data: unknown, status: number): Response {
  try {
    return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

function computeScope(uwaRows: any[], roleName: string): { isGlobal: boolean; warehouseIds: string[] } {
  const hasUnrestricted = uwaRows.some((r) => r.restricted === false);
  const restricted = uwaRows.filter((r) => r.restricted === true);
  if (hasUnrestricted) return { isGlobal: true, warehouseIds: [] };
  if (restricted.length > 0) return { isGlobal: false, warehouseIds: restricted.map((r) => r.warehouse_id) };
  if (GLOBAL_ROLES.includes(roleName)) return { isGlobal: true, warehouseIds: [] };
  return { isGlobal: false, warehouseIds: [] };
}

function canMessage(a: any, b: any): boolean {
  if (a.isGlobal || b.isGlobal) return true;
  return a.warehouseIds.some((id: string) => b.warehouseIds.includes(id));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });

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

    let orgId = new URL(req.url).searchParams.get('org_id');
    if (!orgId && req.method === 'POST') {
      const body = await req.json().catch(() => null);
      orgId = body?.org_id;
    }
    if (!orgId) return safeJsonResponse({ error: 'org_id required' }, 400);

    const { data: myRoleRow } = await supabase.from('user_org_roles').select('role_id').eq('user_id', userId).eq('org_id', orgId).maybeSingle();
    if (!myRoleRow) return safeJsonResponse({ error: 'No pertenecés a esta organización' }, 403);

    const { data: orgUserRoles } = await supabase.from('user_org_roles').select('user_id, roles(name)').eq('org_id', orgId);

    const roleByUser = new Map<string, string>();
    (orgUserRoles ?? []).forEach((r: any) => roleByUser.set(r.user_id, r.roles?.name ?? ''));
    const allUserIds = Array.from(roleByUser.keys());

    const { data: profiles } = await supabase.from('profiles').select('id, name, email, avatar_url').in('id', allUserIds);
    const { data: allUwa } = await supabase.from('user_warehouse_access').select('user_id, warehouse_id, restricted').eq('org_id', orgId).in('user_id', allUserIds);
    const { data: warehouses } = await supabase.from('warehouses').select('id, name').eq('org_id', orgId);

    const whName = new Map<string, string>();
    (warehouses ?? []).forEach((w: any) => whName.set(w.id, w.name));

    const scopeByUser = new Map<string, any>();
    for (const uid of allUserIds) {
      const uwa = (allUwa ?? []).filter((r: any) => r.user_id === uid);
      scopeByUser.set(uid, computeScope(uwa, roleByUser.get(uid) ?? ''));
    }
    const myScope = scopeByUser.get(userId) ?? { isGlobal: false, warehouseIds: [] };

    const profileMap = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => profileMap.set(p.id, p));

    const contacts: any[] = [];
    for (const uid of allUserIds) {
      if (uid === userId) continue;
      const theirScope = scopeByUser.get(uid)!;
      if (!canMessage(myScope, theirScope)) continue;
      const p = profileMap.get(uid) ?? {};
      const sharedIds = myScope.isGlobal || theirScope.isGlobal
        ? theirScope.warehouseIds.length > 0 ? theirScope.warehouseIds : myScope.warehouseIds
        : myScope.warehouseIds.filter((id: string) => theirScope.warehouseIds.includes(id));
      contacts.push({
        id: uid,
        name: p.name || 'Usuario',
        email: p.email || null,
        avatar_url: p.avatar_url || null,
        role: roleByUser.get(uid) ?? '',
        shared_warehouse_names: sharedIds.map((id: string) => whName.get(id) || ''),
        is_global: theirScope.isGlobal,
      });
    }
    contacts.sort((a, b) => a.name.localeCompare(b.name));

    const { data: myMems } = await supabase.from('msg_conversation_members').select('conversation_id, last_read_at').eq('user_id', userId).eq('org_id', orgId);
    const convIds = (myMems ?? []).map((m: any) => m.conversation_id);
    const myLastRead = new Map<string, string | null>();
    (myMems ?? []).forEach((m: any) => myLastRead.set(m.conversation_id, m.last_read_at));

    let conversations: any[] = [];
    if (convIds.length > 0) {
      const { data: convs } = await supabase.from('msg_conversations').select('*').in('id', convIds).order('last_message_at', { ascending: false, nullsFirst: false });
      const { data: members } = await supabase.from('msg_conversation_members').select('conversation_id, user_id, member_role').in('conversation_id', convIds);
      const memberUserIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id)));
      const { data: memberProfiles } = await supabase.from('profiles').select('id, name, email, avatar_url').in('id', memberUserIds);
      const mpMap = new Map<string, any>();
      (memberProfiles ?? []).forEach((p: any) => mpMap.set(p.id, p));

      const { data: unreadRows } = await supabase.from('msg_messages').select('conversation_id, sender_id, created_at').in('conversation_id', convIds).is('deleted_at', null).neq('sender_id', userId);
      const unreadByConv = new Map<string, number>();
      for (const m of (unreadRows ?? [])) {
        const lastRead = myLastRead.get(m.conversation_id);
        if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
          unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
        }
      }

      conversations = (convs ?? []).map((c: any) => {
        const convMembers = (members ?? []).filter((m: any) => m.conversation_id === c.id);
        const memberList = convMembers.map((m: any) => ({
          user_id: m.user_id,
          name: mpMap.get(m.user_id)?.name || 'Usuario',
          email: mpMap.get(m.user_id)?.email || null,
          avatar_url: mpMap.get(m.user_id)?.avatar_url || null,
          member_role: m.member_role,
        }));
        let title = c.title;
        let peer = null;
        if (c.type === 'direct') {
          const other = memberList.find((m: any) => m.user_id !== userId);
          peer = other ? { id: other.user_id, name: other.name, email: other.email, avatar_url: other.avatar_url } : null;
          title = other?.name || 'Conversación';
        }
        return {
          id: c.id,
          type: c.type,
          title,
          peer,
          is_express: c.is_express === true,
          last_message_at: c.last_message_at,
          last_message_preview: c.last_message_preview,
          last_message_sender_id: c.last_message_sender_id,
          unread_count: unreadByConv.get(c.id) ?? 0,
          members: memberList,
        };
      });

      conversations.sort((a, b) => {
        const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bt - at;
      });
    }

    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

    return safeJsonResponse({ me: { id: userId, name: profileMap.get(userId)?.name || 'Yo' }, contacts, conversations, total_unread: totalUnread }, 200);
  } catch (error: any) {
    console.error('[msg-bootstrap] ERROR:', error?.message || error);
    return safeJsonResponse({ error: 'Internal server error', detail: error?.message || String(error) }, 500);
  }
});
