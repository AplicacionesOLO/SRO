import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!dbUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL not set' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  const results: Record<string, string> = {};

  try {
    // 1. Ensure bucket exists
    const { error: bucketErr } = await supabase.storage.createBucket('knowledge-documents', {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
      ],
    });
    results['bucket'] = bucketErr ? `skipped (${bucketErr.message})` : 'created';

    // 2. Drop existing policies (idempotent)
    await sql`DROP POLICY IF EXISTS "kd_storage_select" ON storage.objects`;
    await sql`DROP POLICY IF EXISTS "kd_storage_insert" ON storage.objects`;
    await sql`DROP POLICY IF EXISTS "kd_storage_delete" ON storage.objects`;
    results['drop_old_policies'] = 'ok';

    // 3. SELECT: cualquier usuario de la org puede leer
    await sql`
      CREATE POLICY "kd_storage_select"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'knowledge-documents'
        AND (storage.foldername(name))[1] IN (
          SELECT org_id::text FROM user_org_roles WHERE user_id = auth.uid()
        )
      )
    `;
    results['policy_select'] = 'ok';

    // 4. INSERT: solo usuarios con chat.documents.manage
    await sql`
      CREATE POLICY "kd_storage_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'knowledge-documents'
        AND (storage.foldername(name))[1] IN (
          SELECT uor.org_id::text
          FROM user_org_roles uor
          JOIN role_permissions rp ON rp.role_id = uor.role_id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE uor.user_id = auth.uid()
          AND p.name = 'chat.documents.manage'
        )
      )
    `;
    results['policy_insert'] = 'ok';

    // 5. DELETE: solo usuarios con chat.documents.manage
    await sql`
      CREATE POLICY "kd_storage_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'knowledge-documents'
        AND (storage.foldername(name))[1] IN (
          SELECT uor.org_id::text
          FROM user_org_roles uor
          JOIN role_permissions rp ON rp.role_id = uor.role_id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE uor.user_id = auth.uid()
          AND p.name = 'chat.documents.manage'
        )
      )
    `;
    results['policy_delete'] = 'ok';

    // 6. Verify
    const policies = await sql`
      SELECT policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname ILIKE '%kd_storage%'
      ORDER BY policyname
    `;

    await sql.end();

    return new Response(
      JSON.stringify({ ok: true, results, policies }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    await sql.end().catch(() => {});
    console.error('setup-knowledge-storage error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message, results }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
