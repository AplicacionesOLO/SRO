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
    if (!body?.attachment_id) return safeJsonResponse({ error: 'attachment_id required' }, 400);

    // Resolve attachment → message → conversation
    const { data: att } = await supabase.from('msg_attachments').select('id, file_path, message_id').eq('id', body.attachment_id).maybeSingle();
    if (!att) return safeJsonResponse({ error: 'Archivo no encontrado' }, 404);

    const { data: msg } = await supabase.from('msg_messages').select('conversation_id').eq('id', att.message_id).maybeSingle();
    if (!msg) return safeJsonResponse({ error: 'Mensaje no encontrado' }, 404);

    const { data: member } = await supabase.from('msg_conversation_members').select('id').eq('conversation_id', msg.conversation_id).eq('user_id', userId).maybeSingle();
    if (!member) return safeJsonResponse({ error: 'No tenés acceso a este archivo' }, 403);

    const { data, error } = await supabase.storage.from('msg-files').createSignedUrl(att.file_path, 300);
    if (error) return safeJsonResponse({ error: error.message }, 500);

    return safeJsonResponse({ url: data.signedUrl, file_path: att.file_path }, 200);
  } catch (error: any) {
    console.error('[msg-file-url] ERROR:', error?.message || error);
    return safeJsonResponse({ error: 'Internal server error', detail: error?.message || String(error) }, 500);
  }
});
