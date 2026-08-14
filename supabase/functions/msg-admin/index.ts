import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function safeJsonResponse(data: unknown, status: number): Response {
  try {
    return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
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
    const orgId = body?.org_id;
    if (!orgId) return safeJsonResponse({ error: 'org_id required' }, 400);

    // Verify admin permission (chat.messages.admin)
    const { data: uor } = await supabase
      .from('user_org_roles')
      .select('role_id')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (!uor) return safeJsonResponse({ error: 'No pertenecés a esta organización' }, 403);

    const { data: rp } = await supabase
      .from('role_permissions')
      .select('permissions(name)')
      .eq('role_id', uor.role_id);
    const hasAdmin = (rp ?? []).some((r: any) => r.permissions?.name === 'chat.messages.admin');
    if (!hasAdmin) return safeJsonResponse({ error: 'No tenés permisos de administración de mensajería' }, 403);

    // ── Stats ──
    const { count: totalConversations } = await supabase.from('msg_conversations').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    const { count: totalMessages } = await supabase.from('msg_messages').select('id', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null);
    const { count: totalAttachments } = await supabase.from('msg_attachments').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    const { data: activeUsers } = await supabase.from('msg_conversation_members').select('user_id').eq('org_id', orgId);
    const activeUserCount = new Set((activeUsers ?? []).map((r: any) => r.user_id)).size;

    // ── Conversations (with member names) ──
    const { data: convs } = await supabase
      .from('msg_conversations')
      .select('*')
      .eq('org_id', orgId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);

    const convIds = (convs ?? []).map((c: any) => c.id);
    let membersByConv = new Map<string, any[]>();
    if (convIds.length > 0) {
      const { data: members } = await supabase.from('msg_conversation_members').select('conversation_id, user_id, member_role').in('conversation_id', convIds);
      const uids = Array.from(new Set((members ?? []).map((m: any) => m.user_id)));
      const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', uids);
      const pMap = new Map<string, any>();
      (profiles ?? []).forEach((p: any) => pMap.set(p.id, p));
      for (const m of (members ?? [])) {
        const arr = membersByConv.get(m.conversation_id) ?? [];
        arr.push({ user_id: m.user_id, name: pMap.get(m.user_id)?.name || 'Usuario', email: pMap.get(m.user_id)?.email || null, member_role: m.member_role });
        membersByConv.set(m.conversation_id, arr);
      }
    }

    const conversations = (convs ?? []).map((c: any) => ({
      ...c,
      members: membersByConv.get(c.id) ?? [],
    }));

    return safeJsonResponse({
      stats: {
        total_conversations: totalConversations ?? 0,
        total_messages: totalMessages ?? 0,
        total_attachments: totalAttachments ?? 0,
        active_users: activeUserCount,
      },
      conversations,
    }, 200);
  } catch (error: any) {
    console.error('[msg-admin] ERROR:', error?.message || error);
    return safeJsonResponse({ error: 'Internal server error', detail: error?.message || String(error) }, 500);
  }
});
