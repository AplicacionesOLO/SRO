import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL not set' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
  const results: Record<string, string> = {};

  try {
    // Step 1: Drop broken policies
    await sql`DROP POLICY IF EXISTS "insert_fotos_storage" ON storage.objects`;
    results['drop_insert_fotos_storage'] = 'ok';

    await sql`DROP POLICY IF EXISTS "upload_foto_policy" ON storage.objects`;
    results['drop_upload_foto_policy'] = 'ok';

    // Step 2: Drop any previous attempts at correct policies (idempotent)
    await sql`DROP POLICY IF EXISTS "casetilla-fotos upload (authenticated)" ON storage.objects`;
    await sql`DROP POLICY IF EXISTS "casetilla-fotos read (authenticated)" ON storage.objects`;
    await sql`DROP POLICY IF EXISTS "casetilla-fotos delete (authenticated)" ON storage.objects`;
    results['drop_previous_attempts'] = 'ok';

    // Step 3: Create correct INSERT policy
    await sql`
      CREATE POLICY "casetilla-fotos upload (authenticated)"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'casetilla-fotos')
    `;
    results['create_insert_policy'] = 'ok';

    // Step 4: Create correct SELECT policy
    await sql`
      CREATE POLICY "casetilla-fotos read (authenticated)"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'casetilla-fotos')
    `;
    results['create_select_policy'] = 'ok';

    // Step 5: Create correct DELETE policy
    await sql`
      CREATE POLICY "casetilla-fotos delete (authenticated)"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'casetilla-fotos')
    `;
    results['create_delete_policy'] = 'ok';

    // Step 6: Ensure bucket exists and is public
    await sql`
      UPDATE storage.buckets
      SET public = true,
          file_size_limit = 10485760,
          allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
      WHERE id = 'casetilla-fotos'
    `;
    results['update_bucket'] = 'ok';

    // Step 7: Verify current policies
    const policies = await sql`
      SELECT policyname, cmd, roles
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname ILIKE '%casetilla%'
      ORDER BY policyname
    `;

    await sql.end();

    return new Response(
      JSON.stringify({ ok: true, results, policies }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    await sql.end().catch(() => {});
    console.error('fix-casetilla-storage-rls error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message, results }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
