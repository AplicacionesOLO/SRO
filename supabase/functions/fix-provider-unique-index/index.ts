import postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const DB_URL = `postgresql://postgres:${encodeURIComponent(SERVICE_ROLE_KEY)}@db.${projectRef}.supabase.co:5432/postgres`;

Deno.serve(async (req) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sql = postgres(DB_URL, { 
      ssl: { rejectUnauthorized: false },
      max: 1,
      idle_timeout: 10,
    });

    let results: string[] = [];

    try {
      // 1. Eliminar índice viejo
      await sql`DROP INDEX IF EXISTS public.providers_org_name_uniq`;
      results.push("OK: índice providers_org_name_uniq eliminado");
      
      // 2. Crear nuevo índice compuesto: (org_id, nombre normalizado, código)
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS providers_org_name_code_uniq ON public.providers (org_id, lower(TRIM(BOTH FROM name)), COALESCE(provider_code, ''))`;
      results.push("OK: índice providers_org_name_code_uniq creado (compuesto por org_id + nombre + código)");

      // 3. Verificar índices actuales
      const currentIndexes = await sql`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'providers' 
          AND indexname ILIKE '%name%'
        ORDER BY indexname
      `;
      
      await sql.end();

      return new Response(JSON.stringify({
        success: true,
        message: "Migración completada. Ahora la llave única es (org_id, nombre, código).",
        steps: results,
        current_indexes: currentIndexes,
      }), {
        status: 200,
        headers: corsHeaders,
      });

    } catch (dbErr) {
      await sql.end();
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      return new Response(JSON.stringify({
        success: false,
        error: msg,
        steps: results,
      }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({
      success: false,
      error: msg,
    }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});