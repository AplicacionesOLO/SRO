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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return safeJsonResponse({ error: 'Missing Authorization header' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return safeJsonResponse({ error: 'Invalid token' }, 401);

    // Solo usuarios con rol global pueden disparar el barrido
    const { data: roleRows } = await supabase.from('user_org_roles').select('roles(name)').eq('user_id', user.id);
    const roles = (roleRows ?? []).map((r: any) => r.roles?.name ?? '');
    const isPrivileged = roles.some((n: string) => ['ADMIN', 'SUPERVISOR', 'Full Access'].includes(n));
    if (!isPrivileged) return safeJsonResponse({ error: 'No autorizado' }, 403);

    const now = new Date();
    const expressCutoff = new Date(now.getTime() - EXPRESS_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const multimediaCutoff = new Date(now.getTime() - MULTIMEDIA_TTL_MONTHS * 30 * 24 * 60 * 60 * 1000).toISOString();

    let deletedFiles = 0;
    let deletedAttachments = 0;
    let deletedMessages = 0;

    // 1) Archivos multimedia con más de 2 meses
    const { data: oldAttachments } = await supabase
      .from('msg_attachments')
      .select('id, file_path')
      .lt('created_at', multimediaCutoff);

    if ((oldAttachments ?? []).length > 0) {
      const paths = (oldAttachments ?? []).map((a: any) => a.file_path).filter(Boolean);
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from('msg-files').remove(paths);
        if (!rmErr) deletedFiles += paths.length;
      }
      const ids = (oldAttachments ?? []).map((a: any) => a.id);
      const { data: delAtt } = await supabase.from('msg_attachments').delete().in('id', ids).select('id');
      deletedAttachments += (delAtt ?? []).length;
    }

    // 2) Mensajes en conversaciones express con más de 24h
    const { data: expressConvs } = await supabase
      .from('msg_conversations')
      .select('id')
      .eq('is_express', true);

    const expressIds = (expressConvs ?? []).map((c: any) => c.id);
    if (expressIds.length > 0) {
      // attachments de esos mensajes
      const { data: expAttachments } = await supabase
        .from('msg_attachments')
        .select('id, file_path, message_id')
        .in('message_id', (await supabase.from('msg_messages').select('id').in('conversation_id', expressIds).lt('created_at', expressCutoff)).data?.map((m: any) => m.id) ?? []);

      if ((expAttachments ?? []).length > 0) {
        const paths = (expAttachments ?? []).map((a: any) => a.file_path).filter(Boolean);
        if (paths.length > 0) {
          const { error: rmErr } = await supabase.storage.from('msg-files').remove(paths);
          if (!rmErr) deletedFiles += paths.length;
        }
        const ids = (expAttachments ?? []).map((a: any) => a.id);
        const { data: delAtt } = await supabase.from('msg_attachments').delete().in('id', ids).select('id');
        deletedAttachments += (delAtt ?? []).length;
      }

      const { data: delMsg } = await supabase
        .from('msg_messages')
        .delete()
        .in('conversation_id', expressIds)
        .lt('created_at', expressCutoff)
        .select('id');
      deletedMessages += (delMsg ?? []).length;
    }

    return safeJsonResponse({
      ok: true,
      deleted_files: deletedFiles,
      deleted_attachments: deletedAttachments,
      deleted_messages: deletedMessages,
    }, 200);
  } catch (error: any) {
    console.error('[msg-cleanup] ERROR:', error?.message || error);
    return safeJsonResponse({ error: 'Internal server error', detail: error?.message || String(error) }, 500);
  }
});
