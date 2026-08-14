import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DELETE_WINDOW_MS = 60 * 1000; // 1 minuto

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
    const { org_id, conversation_id, message_id } = body;
    if (!org_id || !conversation_id || !message_id) {
      return safeJsonResponse({ error: 'org_id, conversation_id and message_id required' }, 400);
    }

    // Verificar membresía
    const { data: myMember } = await supabase
      .from('msg_conversation_members')
      .select('id')
      .eq('conversation_id', conversation_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!myMember) return safeJsonResponse({ error: 'No sos miembro de esta conversación' }, 403);

    // Buscar el mensaje
    const { data: message } = await supabase
      .from('msg_messages')
      .select('*')
      .eq('id', message_id)
      .eq('conversation_id', conversation_id)
      .maybeSingle();
    if (!message) return safeJsonResponse({ error: 'Mensaje no encontrado' }, 404);
    if (message.deleted_at) return safeJsonResponse({ error: 'El mensaje ya fue eliminado' }, 400);

    // Buscar el creador de la conversación
    const { data: conversation } = await supabase
      .from('msg_conversations')
      .select('created_by')
      .eq('id', conversation_id)
      .single();

    const isSender = message.sender_id === userId;
    const isCreator = conversation?.created_by === userId;
    if (!isSender && !isCreator) {
      return safeJsonResponse({ error: 'Solo el autor del mensaje o el creador de la conversación pueden eliminarlo' }, 403);
    }

    // Ventana de 1 minuto
    const elapsed = Date.now() - new Date(message.created_at).getTime();
    if (elapsed > DELETE_WINDOW_MS) {
      return safeJsonResponse({ error: 'Ya pasó el plazo de 1 minuto para eliminar este mensaje' }, 400);
    }

    // Borrar adjuntos (storage + filas)
    const { data: attachments } = await supabase
      .from('msg_attachments')
      .select('file_path')
      .eq('message_id', message_id);
    const paths = (attachments ?? []).map((a: any) => a.file_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from('msg-files').remove(paths);
      await supabase.from('msg_attachments').delete().eq('message_id', message_id);
    }

    // Soft-delete del mensaje
    const now = new Date().toISOString();
    const { error: dErr } = await supabase
      .from('msg_messages')
      .update({ deleted_at: now })
      .eq('id', message_id);
    if (dErr) return safeJsonResponse({ error: dErr.message }, 500);

    // Recalcular último mensaje de la conversación (por si eliminamos el más reciente)
    const { data: latest } = await supabase
      .from('msg_messages')
      .select('content, sender_id, created_at')
      .eq('conversation_id', conversation_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const convUpdate: any = { updated_at: now };
    if (latest) {
      convUpdate.last_message_at = latest.created_at;
      convUpdate.last_message_preview = (latest.content || '📎 Archivo').slice(0, 160);
      convUpdate.last_message_sender_id = latest.sender_id;
    } else {
      convUpdate.last_message_at = null;
      convUpdate.last_message_preview = null;
      convUpdate.last_message_sender_id = null;
    }
    await supabase.from('msg_conversations').update(convUpdate).eq('id', conversation_id);

    return safeJsonResponse({ ok: true }, 200);
  } catch (error: any) {
    console.error('[msg-delete-message] ERROR:', error?.message || error);
    return safeJsonResponse({ error: 'Internal server error', detail: error?.message || String(error) }, 500);
  }
});
