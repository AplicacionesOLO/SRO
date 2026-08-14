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
  if (GLOBAL_ROLES.includes(uor?.roles?.name ?? '')) return { isGlobal: true, warehouseIds: [] };
  return { isGlobal: false, warehouseIds: [] };
}

function canMessage(a: any, b: any): boolean {
  if (a.isGlobal || b.isGlobal) return true;
  return a.warehouseIds.some((id: string) => b.warehouseIds.includes(id));
}

async function findOrCreateDirect(supabase: any, orgId: string, userId: string, recipientId: string): Promise<{ id: string; error?: string }> {
  const myScope = await getScope(supabase, orgId, userId);
  const theirScope = await getScope(supabase, orgId, recipientId);
  if (!canMessage(myScope, theirScope)) {
    return { id: '', error: 'SCOPE_DENIED: No compartís un almacén con este usuario' };
  }
  const { data: myMems } = await supabase.from('msg_conversation_members').select('conversation_id').eq('user_id', userId).eq('org_id', orgId);
  const { data: theirMems } = await supabase.from('msg_conversation_members').select('conversation_id').eq('user_id', recipientId).eq('org_id', orgId);
  const mySet = new Set((myMems ?? []).map((m: any) => m.conversation_id));
  const candidates = (theirMems ?? []).map((m: any) => m.conversation_id).filter((id: string) => mySet.has(id));
  if (candidates.length > 0) {
    const { data: convs } = await supabase.from('msg_conversations').select('id, type').in('id', candidates);
    const direct = (convs ?? []).find((c: any) => c.type === 'direct');
    if (direct) return { id: direct.id };
  }
  const { data: newConv, error: cErr } = await supabase.from('msg_conversations').insert({ org_id: orgId, type: 'direct', created_by: userId }).select('id').single();
  if (cErr) return { id: '', error: cErr.message };
  await supabase.from('msg_conversation_members').insert([
    { conversation_id: newConv.id, org_id: orgId, user_id: userId },
    { conversation_id: newConv.id, org_id: orgId, user_id: recipientId },
  ]);
  return { id: newConv.id };
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

    const contentType = req.headers.get('content-type') ?? '';

    let orgId: string;
    let conversationId: string | null = null;
    let recipientId: string | null = null;
    let textContent: string | null = null;
    let files: File[] = [];

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      orgId = (form.get('org_id') as string) || '';
      conversationId = (form.get('conversation_id') as string) || null;
      recipientId = (form.get('recipient_id') as string) || null;
      textContent = (form.get('content') as string) || null;
      const single = form.get('file') as File | null;
      if (single) files.push(single);
      const multi = form.getAll('files') as File[];
      if (multi.length > 0) files = files.concat(multi);
    } else {
      const body = await req.json().catch(() => null);
      if (!body) return safeJsonResponse({ error: 'Invalid body' }, 400);
      orgId = body.org_id;
      conversationId = body.conversation_id || null;
      recipientId = body.recipient_id || null;
      textContent = body.content ?? null;
    }

    if (!orgId) return safeJsonResponse({ error: 'org_id required' }, 400);

    // Verify user belongs to org
    const { data: userOrg } = await supabase.from('user_org_roles').select('org_id').eq('user_id', userId).eq('org_id', orgId).maybeSingle();
    if (!userOrg) return safeJsonResponse({ error: 'No pertenecés a esta organización' }, 403);

    // Resolve conversation
    if (!conversationId && recipientId) {
      const res = await findOrCreateDirect(supabase, orgId, userId, recipientId);
      if (res.error) return safeJsonResponse({ error: res.error }, 403);
      conversationId = res.id;
    }

    if (!conversationId) return safeJsonResponse({ error: 'conversation_id or recipient_id required' }, 400);

    // Verify membership
    const { data: myMember } = await supabase.from('msg_conversation_members').select('id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle();
    if (!myMember) return safeJsonResponse({ error: 'No sos miembro de esta conversación' }, 403);

    // Validate content
    const hasText = !!textContent && textContent.trim().length > 0;
    if (!hasText && files.length === 0) return safeJsonResponse({ error: 'No hay contenido ni archivo para enviar' }, 400);

    let msgType = 'text';
    let msgContent = textContent?.trim() ?? '';
    let preview = msgContent;
    const attachments: any[] = [];

    if (files.length > 0) {
      msgType = 'file';
      msgContent = textContent?.trim() || '';
      preview = msgContent || (files.length === 1 ? `📎 ${files[0].name}` : `📎 ${files[0].name} + ${files.length - 1} más`);
      for (const file of files) {
        // sanitize filename
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const unique = crypto.randomUUID();
        const filePath = `${orgId}/${conversationId}/${unique}_${safeName}`;
        const bytes = await file.arrayBuffer();
        const { error: upErr } = await supabase.storage.from('msg-files').upload(filePath, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (upErr) return safeJsonResponse({ error: 'UPLOAD_ERROR', message: upErr.message }, 500);
        attachments.push({
          file_name: file.name,
          file_path: filePath,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
        });
      }
    }

    const now = new Date().toISOString();
    const { data: msg, error: mErr } = await supabase.from('msg_messages').insert({
      conversation_id: conversationId,
      org_id: orgId,
      sender_id: userId,
      type: msgType,
      content: msgContent,
    }).select('*').single();
    if (mErr) return safeJsonResponse({ error: mErr.message }, 500);

    if (attachments.length > 0) {
      const rows = attachments.map((a) => ({
        message_id: msg.id,
        org_id: orgId,
        file_name: a.file_name,
        file_path: a.file_path,
        file_type: a.file_type,
        file_size: a.file_size,
      }));
      const { error: aErr } = await supabase.from('msg_attachments').insert(rows);
      if (aErr) console.error('[msg-send] attachment insert error:', aErr.message);
    }

    // Update conversation last message
    await supabase.from('msg_conversations').update({
      last_message_at: now,
      last_message_preview: preview.slice(0, 160),
      last_message_sender_id: userId,
      updated_at: now,
    }).eq('id', conversationId);

    return safeJsonResponse({ message: msg, conversation_id: conversationId }, 201);
  } catch (error: any) {
    console.error('[msg-send] ERROR:', error?.message || error);
    return safeJsonResponse({ error: 'Internal server error', detail: error?.message || String(error) }, 500);
  }
});
