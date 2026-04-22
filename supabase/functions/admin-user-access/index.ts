// supabase/functions/admin-user-access/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "admin-user-access@v2026-02-09.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reqId() {
  return crypto.randomUUID();
}

function safePrefix(v: string | null, n = 14) {
  if (!v) return null;
  return v.slice(0, n);
}

function json(resBody: any, status = 200) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const id = reqId();
  const startedAt = Date.now();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("authorization");
  const apiKeyHeader = req.headers.get("apikey");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Server misconfigured", details: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", reqId: id, version: VERSION }, 500);
    }

    const keyForAuth = anonKey || publishableKey;
    if (!keyForAuth) {
      return json({ error: "Server misconfigured", details: "Missing SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY", reqId: id, version: VERSION }, 500);
    }

    const supabaseAuth = createClient(supabaseUrl, keyForAuth, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    const user = userData?.user ?? null;

    if (!user) {
      return json({ error: "Unauthorized", details: "Auth session missing!", reqId: id, version: VERSION }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let payload: any = null;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Bad Request", details: "Invalid JSON body", reqId: id, version: VERSION }, 400);
    }

    const { action, userId, targetUserId, orgId, status, rejectionReason, countryIds, warehouseIds, restricted } = payload ?? {};
    const finalTargetUserId = targetUserId || userId;

    if (action === "get") {
      if (!orgId) return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);
      if (!finalTargetUserId) return json({ error: "Bad Request", details: "Missing targetUserId", reqId: id, version: VERSION }, 400);

      const { data: countriesData, error: countriesError } = await supabase
        .from("user_country_access")
        .select("country_id")
        .eq("user_id", finalTargetUserId)
        .eq("org_id", orgId);

      if (countriesError) return json({ error: "Database error", details: countriesError.message, reqId: id, version: VERSION }, 500);

      const countryIdsResult = (countriesData ?? []).map((row: any) => row.country_id);

      const { data: warehousesData, error: warehousesError } = await supabase
        .from("user_warehouse_access")
        .select("warehouse_id, restricted")
        .eq("user_id", finalTargetUserId)
        .eq("org_id", orgId)
        .limit(1);

      if (warehousesError) return json({ error: "Database error", details: warehousesError.message, reqId: id, version: VERSION }, 500);

      const restrictedValue = warehousesData?.[0]?.restricted ?? false;
      let warehouseIdsResult: string[] = [];

      if (restrictedValue) {
        const { data: whIds, error: whIdsError } = await supabase
          .from("user_warehouse_access")
          .select("warehouse_id")
          .eq("user_id", finalTargetUserId)
          .eq("org_id", orgId);

        if (!whIdsError) warehouseIdsResult = (whIds ?? []).map((row: any) => row.warehouse_id);
      }

      return json({ countryIds: countryIdsResult, warehouseIds: warehouseIdsResult, restricted: restrictedValue }, 200);
    }

    if (action === "set_countries") {
      if (!orgId) return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);
      if (!finalTargetUserId) return json({ error: "Bad Request", details: "Missing targetUserId", reqId: id, version: VERSION }, 400);
      if (!Array.isArray(countryIds)) return json({ error: "Bad Request", details: "countryIds must be an array", reqId: id, version: VERSION }, 400);

      const { error: deleteError } = await supabase.from("user_country_access").delete().eq("user_id", finalTargetUserId).eq("org_id", orgId);
      if (deleteError) return json({ error: "Database error", details: deleteError.message, reqId: id, version: VERSION }, 500);

      if (countryIds.length > 0) {
        const rows = countryIds.map((countryId: string) => ({ user_id: finalTargetUserId, org_id: orgId, country_id: countryId }));
        const { error: insertError } = await supabase.from("user_country_access").insert(rows);
        if (insertError) return json({ error: "Database error", details: insertError.message, reqId: id, version: VERSION }, 500);
      }

      return json({ success: true, message: "Countries assigned", reqId: id, version: VERSION }, 200);
    }

    if (action === "set_warehouses") {
      if (!orgId) return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);
      if (!finalTargetUserId) return json({ error: "Bad Request", details: "Missing targetUserId", reqId: id, version: VERSION }, 400);
      if (typeof restricted !== "boolean") return json({ error: "Bad Request", details: "restricted must be a boolean", reqId: id, version: VERSION }, 400);
      if (!Array.isArray(warehouseIds)) return json({ error: "Bad Request", details: "warehouseIds must be an array", reqId: id, version: VERSION }, 400);

      const { error: deleteError } = await supabase.from("user_warehouse_access").delete().eq("user_id", finalTargetUserId).eq("org_id", orgId);
      if (deleteError) return json({ error: "Database error", details: deleteError.message, reqId: id, version: VERSION }, 500);

      if (restricted && warehouseIds.length > 0) {
        const rows = warehouseIds.map((warehouseId: string) => ({ user_id: finalTargetUserId, org_id: orgId, warehouse_id: warehouseId, restricted: true }));
        const { error: insertError } = await supabase.from("user_warehouse_access").insert(rows);
        if (insertError) return json({ error: "Database error", details: insertError.message, reqId: id, version: VERSION }, 500);
      } else if (!restricted) {
        const { error: insertError } = await supabase.from("user_warehouse_access").insert({ user_id: finalTargetUserId, org_id: orgId, warehouse_id: null, restricted: false });
        if (insertError) return json({ error: "Database error", details: insertError.message, reqId: id, version: VERSION }, 500);
      }

      return json({ success: true, message: "Warehouses assigned", reqId: id, version: VERSION }, 200);
    }

    if (!finalTargetUserId) return json({ error: "Bad Request", details: "Missing userId or targetUserId", reqId: id, version: VERSION }, 400);

    if (action === "approve") {
      const { error } = await supabase.from("profiles").update({ access_status: "approved", access_approved_at: new Date().toISOString() }).eq("id", finalTargetUserId);
      if (error) return json({ error: "Update failed", details: error.message, reqId: id, version: VERSION }, 500);
      return json({ success: true, message: "User approved", reqId: id, version: VERSION }, 200);
    }

    if (action === "reject") {
      const { error } = await supabase.from("profiles").update({ access_status: "rejected", rejection_reason: rejectionReason || "No reason provided" }).eq("id", finalTargetUserId);
      if (error) return json({ error: "Update failed", details: error.message, reqId: id, version: VERSION }, 500);
      return json({ success: true, message: "User rejected", reqId: id, version: VERSION }, 200);
    }

    if (action === "update_status") {
      if (!status) return json({ error: "Bad Request", details: "Missing status", reqId: id, version: VERSION }, 400);
      const { error } = await supabase.from("profiles").update({ access_status: status }).eq("id", finalTargetUserId);
      if (error) return json({ error: "Update failed", details: error.message, reqId: id, version: VERSION }, 500);
      return json({ success: true, message: "Status updated", reqId: id, version: VERSION }, 200);
    }

    return json({ error: "Invalid action", reqId: id, version: VERSION }, 400);
  } catch (e: any) {
    console.error(`[${VERSION}] [${id}] UNHANDLED`, { message: e?.message ?? String(e) });
    return json({ error: "Server error", details: e?.message ?? String(e), reqId: id, version: VERSION }, 500);
  }
});