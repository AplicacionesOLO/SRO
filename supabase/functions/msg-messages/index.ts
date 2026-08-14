import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EXPRESS_TTL_HOURS = 24;
const MULTIMEDIA_TTL_MONTHS = 2;

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
    if (!body) return safeJsonResponse({ error: 'Invalid JSON body' }, 400);
    const { conversation_id } = body;
    if (!conversation_id) return safeJsonResponse({ error: 'conversation_id required' }, 400);

    const { data: myMember } = await supabase
      .from('msg_conversation_members')
      .select('id, org_id')
      .eq('conversation_id', conversation_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!myMember) return safeJsonResponse({ error: 'No sos miembro de esta conversación' }, 403);

    const orgId = myMember.org_id;

    const { data: conversation } = await supabase
      .from('msg_conversations')
      .select('*')
      .eq('id', conversation_id)
      .single();

    const isExpress = conversation?.is_express === true;
    const now = new Date();
    const expressCutoff = new Date(now.getTime() - EXPRESS_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const multimediaCutoff = new Date(now.getTime() - MULTIMEDIA_TTL_MONTHS * 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch members + profiles
    const { data: members } = await supabase
      .from('msg_conversation_members')
      .select('user_id, member_role, last_read_at')
      .eq('conversation_id', conversation_id);

    const memberIds = (members ?? []).map((m: any) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url')
      .in('id', memberIds);
    const pMap = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => pMap.set(p.id, p));

    // Fetch messages + attachments
    let msgQuery = supabase
      .from('msg_messages')
      .select('*')
      .eq('conversation_id', conversation_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(200);

    // En modo express, los mensajes viejos se autodestruyen a las 24h
    if (isExpress) {
      msgQuery = msgQuery.gte('created_at', expressCutoff);
    }

    const { data: messages } = await msgQuery;

    const msgIds = (messages ?? []).map((m: any) => m.id);
    let attachmentsByMsg = new Map<string, any[]>();
    if (msgIds.length > 0) {
      const { data: attachments } = await supabase
        .from('msg_attachments')
        .select('*')
        .in('message_id', msgIds)
        .gte('created_at', multimediaCutoff);
      for (const a of (attachments ?? [])) {
        const arr = attachmentsByMsg.get(a.message_id) ?? [];
        arr.push(a);
        attachmentsByMsg.set(a.message_id, arr);
      }
    }

    const resultMessages = (messages ?? []).map((m: any) => {
      const sender = pMap.get(m.sender_id);
      return {
        ...m,
        sender_name: sender?.name || 'Usuario',
        sender_avatar_url: sender?.avatar_url || null,
        attachments: attachmentsByMsg.get(m.id) ?? [],
      };
    });

    // Mark as read
    await supabase
      .from('msg_conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversation_id)
      .eq('user_id', userId);

    const memberList = (members ?? []).map((m: any) => ({
      user_id: m.user_id,
      name: pMap.get(m.user_id)?.name || 'Usuario',
      email: pMap.get(m.user_id)?.email || null,
      avatar_url: pMap.get(m.user_id)?.avatar_url || null,
      member_role: m.member_role,
      last_read_at: m.last_read_at,
    }));

    return safeJsonResponse({
      conversation,
      members: memberList,
      messages: resultMessages,
      is_express: isExpress,
    }, 200);
  } catch (error: any) {
    console.error('[msg-messages] ERROR:', error?.message || error);
    return safeJsonResponse({ error: 'Internal server error', detail: error?.message || String(error) }, 500);
  }
});
