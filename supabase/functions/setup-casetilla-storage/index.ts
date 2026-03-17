import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const BUCKET_ID = 'casetilla-fotos';

    // Check if bucket already exists
    const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets();
    if (listErr) throw listErr;

    const exists = (buckets ?? []).some((b: any) => b.id === BUCKET_ID);

    if (!exists) {
      const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET_ID, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10 MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      });
      if (createErr) throw createErr;

      // Create upload policy for authenticated users
      const { error: policyErr } = await supabaseAdmin.rpc('create_storage_policy', {
        bucket_name: BUCKET_ID,
        policy_name: 'Authenticated upload casetilla-fotos',
        definition: `bucket_id = '${BUCKET_ID}'`,
        operation: 'INSERT',
        role_name: 'authenticated',
      }).maybeSingle();

      // Policy creation may fail if already exists - that's ok
      if (policyErr) {
        console.warn('Policy creation warning (may already exist):', policyErr.message);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, bucketExists: exists, bucketCreated: !exists }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('setup-casetilla-storage error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
