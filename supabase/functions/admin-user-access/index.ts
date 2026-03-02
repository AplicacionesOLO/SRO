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

  console.log(`[${VERSION}] [${id}] START`, {
    method: req.method,
    url: req.url,
    hasAuthHeader: !!authHeader,
    authPrefix: safePrefix(authHeader, 18),
    hasApiKey: !!apiKeyHeader,
    apikeyPrefix: safePrefix(apiKeyHeader, 16),
  });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(`[${VERSION}] [${id}] ENV_MISSING`, { hasUrl: !!supabaseUrl, hasServiceRole: !!serviceRoleKey });
      return json({ error: "Server misconfigured", details: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", reqId: id, version: VERSION }, 500);
    }

    const keyForAuth = anonKey || publishableKey;
    if (!keyForAuth) {
      console.error(`[${VERSION}] [${id}] ENV_MISSING_AUTH_KEY`, { hasAnonKey: !!anonKey, hasPublishableKey: !!publishableKey });
      return json({ error: "Server misconfigured", details: "Missing SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY", reqId: id, version: VERSION }, 500);
    }

    const supabaseAuth = createClient(supabaseUrl, keyForAuth, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    const user = userData?.user ?? null;

    console.log(`[${VERSION}] [${id}] AUTH_CHECK`, {
      ok: !!user && !userErr,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      authError: userErr ? { name: userErr.name, message: userErr.message } : null,
    });

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
      console.error(`[${VERSION}] [${id}] BAD_JSON`);
      return json({ error: "Bad Request", details: "Invalid JSON body", reqId: id, version: VERSION }, 400);
    }

    const { action, userId, targetUserId, orgId, status, rejectionReason, countryIds, warehouseIds, restricted } = payload ?? {};

    // ✅ Soportar tanto userId como targetUserId (fallback)
    const finalTargetUserId = targetUserId || userId;

    console.log(`[${VERSION}] [${id}] PAYLOAD`, {
      action,
      targetUserId: finalTargetUserId ?? null,
      orgId: orgId ?? null,
      status: status ?? null,
      hasRejectionReason: !!rejectionReason,
      hasCountryIds: Array.isArray(countryIds),
      countryIdsCount: Array.isArray(countryIds) ? countryIds.length : 0,
      hasWarehouseIds: Array.isArray(warehouseIds),
      warehouseIdsCount: Array.isArray(warehouseIds) ? warehouseIds.length : 0,
      restricted: restricted ?? null,
      requester: user.id,
    });

    // ✅ NUEVO: Acción GET - Obtener accesos del usuario
    if (action === "get") {
      if (!orgId) {
        console.error(`[${VERSION}] [${id}] GET_MISSING_ORG_ID`);
        return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);
      }

      if (!finalTargetUserId) {
        console.error(`[${VERSION}] [${id}] GET_MISSING_TARGET_USER_ID`);
        return json({ error: "Bad Request", details: "Missing targetUserId", reqId: id, version: VERSION }, 400);
      }

      console.log(`[${VERSION}] [${id}] GET_START`, { orgId, targetUserId: finalTargetUserId });

      // Obtener países asignados
      const { data: countriesData, error: countriesError } = await supabase
        .from("user_country_access")
        .select("country_id")
        .eq("user_id", finalTargetUserId)
        .eq("org_id", orgId);

      console.log(`[${VERSION}] [${id}] GET_COUNTRIES`, {
        ok: !countriesError,
        count: countriesData?.length ?? 0,
        error: countriesError ? { message: countriesError.message } : null,
      });

      if (countriesError) {
        return json({ error: "Database error", details: countriesError.message, reqId: id, version: VERSION }, 500);
      }

      const countryIdsResult = (countriesData ?? []).map((row: any) => row.country_id);

      // Obtener almacenes asignados
      const { data: warehousesData, error: warehousesError } = await supabase
        .from("user_warehouse_access")
        .select("warehouse_id, restricted")
        .eq("user_id", finalTargetUserId)
        .eq("org_id", orgId)
        .limit(1);

      console.log(`[${VERSION}] [${id}] GET_WAREHOUSES`, {
        ok: !warehousesError,
        count: warehousesData?.length ?? 0,
        error: warehousesError ? { message: warehousesError.message } : null,
      });

      if (warehousesError) {
        return json({ error: "Database error", details: warehousesError.message, reqId: id, version: VERSION }, 500);
      }

      const restrictedValue = warehousesData?.[0]?.restricted ?? false;

      // Si está restringido, obtener los IDs de almacenes
      let warehouseIdsResult: string[] = [];
      if (restrictedValue) {
        const { data: whIds, error: whIdsError } = await supabase
          .from("user_warehouse_access")
          .select("warehouse_id")
          .eq("user_id", finalTargetUserId)
          .eq("org_id", orgId);

        if (whIdsError) {
          console.error(`[${VERSION}] [${id}] GET_WAREHOUSE_IDS_ERROR`, { message: whIdsError.message });
        } else {
          warehouseIdsResult = (whIds ?? []).map((row: any) => row.warehouse_id);
        }
      }

      const result = {
        countryIds: countryIdsResult,
        warehouseIds: warehouseIdsResult,
        restricted: restrictedValue,
      };

      console.log(`[${VERSION}] [${id}] GET_SUCCESS`, result);

      return json(result, 200);
    }

    // ✅ NUEVO: Acción SET_COUNTRIES - Asignar países
    if (action === "set_countries") {
      if (!orgId) {
        console.error(`[${VERSION}] [${id}] SET_COUNTRIES_MISSING_ORG_ID`);
        return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);
      }

      if (!finalTargetUserId) {
        console.error(`[${VERSION}] [${id}] SET_COUNTRIES_MISSING_TARGET_USER_ID`);
        return json({ error: "Bad Request", details: "Missing targetUserId", reqId: id, version: VERSION }, 400);
      }

      if (!Array.isArray(countryIds)) {
        console.error(`[${VERSION}] [${id}] SET_COUNTRIES_INVALID_COUNTRY_IDS`);
        return json({ error: "Bad Request", details: "countryIds must be an array", reqId: id, version: VERSION }, 400);
      }

      console.log(`[${VERSION}] [${id}] SET_COUNTRIES_START`, {
        orgId,
        targetUserId: finalTargetUserId,
        countryIds,
      });

      // Eliminar países existentes
      const { error: deleteError } = await supabase
        .from("user_country_access")
        .delete()
        .eq("user_id", finalTargetUserId)
        .eq("org_id", orgId);

      if (deleteError) {
        console.error(`[${VERSION}] [${id}] SET_COUNTRIES_DELETE_ERROR`, { message: deleteError.message });
        return json({ error: "Database error", details: deleteError.message, reqId: id, version: VERSION }, 500);
      }

      // Insertar nuevos países
      if (countryIds.length > 0) {
        const rows = countryIds.map((countryId: string) => ({
          user_id: finalTargetUserId,
          org_id: orgId,
          country_id: countryId,
        }));

        const { error: insertError } = await supabase
          .from("user_country_access")
          .insert(rows);

        if (insertError) {
          console.error(`[${VERSION}] [${id}] SET_COUNTRIES_INSERT_ERROR`, { message: insertError.message });
          return json({ error: "Database error", details: insertError.message, reqId: id, version: VERSION }, 500);
        }
      }

      console.log(`[${VERSION}] [${id}] SET_COUNTRIES_SUCCESS`, { count: countryIds.length });

      return json({ success: true, message: "Countries assigned", reqId: id, version: VERSION }, 200);
    }

    // ✅ NUEVO: Acción SET_WAREHOUSES - Asignar almacenes
    if (action === "set_warehouses") {
      if (!orgId) {
        console.error(`[${VERSION}] [${id}] SET_WAREHOUSES_MISSING_ORG_ID`);
        return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);
      }

      if (!finalTargetUserId) {
        console.error(`[${VERSION}] [${id}] SET_WAREHOUSES_MISSING_TARGET_USER_ID`);
        return json({ error: "Bad Request", details: "Missing targetUserId", reqId: id, version: VERSION }, 400);
      }

      if (typeof restricted !== "boolean") {
        console.error(`[${VERSION}] [${id}] SET_WAREHOUSES_INVALID_RESTRICTED`);
        return json({ error: "Bad Request", details: "restricted must be a boolean", reqId: id, version: VERSION }, 400);
      }

      if (!Array.isArray(warehouseIds)) {
        console.error(`[${VERSION}] [${id}] SET_WAREHOUSES_INVALID_WAREHOUSE_IDS`);
        return json({ error: "Bad Request", details: "warehouseIds must be an array", reqId: id, version: VERSION }, 400);
      }

      console.log(`[${VERSION}] [${id}] SET_WAREHOUSES_START`, {
        orgId,
        targetUserId: finalTargetUserId,
        restricted,
        warehouseIds,
      });

      // Eliminar almacenes existentes
      const { error: deleteError } = await supabase
        .from("user_warehouse_access")
        .delete()
        .eq("user_id", finalTargetUserId)
        .eq("org_id", orgId);

      if (deleteError) {
        console.error(`[${VERSION}] [${id}] SET_WAREHOUSES_DELETE_ERROR`, { message: deleteError.message });
        return json({ error: "Database error", details: deleteError.message, reqId: id, version: VERSION }, 500);
      }

      // Insertar nuevos almacenes
      if (restricted && warehouseIds.length > 0) {
        const rows = warehouseIds.map((warehouseId: string) => ({
          user_id: finalTargetUserId,
          org_id: orgId,
          warehouse_id: warehouseId,
          restricted: true,
        }));

        const { error: insertError } = await supabase
          .from("user_warehouse_access")
          .insert(rows);

        if (insertError) {
          console.error(`[${VERSION}] [${id}] SET_WAREHOUSES_INSERT_ERROR`, { message: insertError.message });
          return json({ error: "Database error", details: insertError.message, reqId: id, version: VERSION }, 500);
        }
      } else if (!restricted) {
        // Insertar un registro con restricted=false (sin warehouse_id específico)
        const { error: insertError } = await supabase
          .from("user_warehouse_access")
          .insert({
            user_id: finalTargetUserId,
            org_id: orgId,
            warehouse_id: null,
            restricted: false,
          });

        if (insertError) {
          console.error(`[${VERSION}] [${id}] SET_WAREHOUSES_INSERT_UNRESTRICTED_ERROR`, { message: insertError.message });
          return json({ error: "Database error", details: insertError.message, reqId: id, version: VERSION }, 500);
        }
      }

      console.log(`[${VERSION}] [${id}] SET_WAREHOUSES_SUCCESS`, { restricted, count: warehouseIds.length });

      return json({ success: true, message: "Warehouses assigned", reqId: id, version: VERSION }, 200);
    }

    // ✅ Acciones legacy (approve, reject, update_status)
    if (!finalTargetUserId) {
      return json({ error: "Bad Request", details: "Missing userId or targetUserId", reqId: id, version: VERSION }, 400);
    }

    if (action === "approve") {
      const { error } = await supabase
        .from("profiles")
        .update({ access_status: "approved", access_approved_at: new Date().toISOString() })
        .eq("id", finalTargetUserId);

      console.log(`[${VERSION}] [${id}] APPROVE`, {
        ok: !error,
        targetUserId: finalTargetUserId,
        error: error ? { message: error.message, name: error.name } : null,
      });

      if (error) return json({ error: "Update failed", details: error.message, reqId: id, version: VERSION }, 500);

      return json({ success: true, message: "User approved", reqId: id, version: VERSION }, 200);
    }

    if (action === "reject") {
      const { error } = await supabase
        .from("profiles")
        .update({
          access_status: "rejected",
          rejection_reason: rejectionReason || "No reason provided",
        })
        .eq("id", finalTargetUserId);

      console.log(`[${VERSION}] [${id}] REJECT`, {
        ok: !error,
        targetUserId: finalTargetUserId,
        error: error ? { message: error.message, name: error.name } : null,
      });

      if (error) return json({ error: "Update failed", details: error.message, reqId: id, version: VERSION }, 500);

      return json({ success: true, message: "User rejected", reqId: id, version: VERSION }, 200);
    }

    if (action === "update_status") {
      if (!status) return json({ error: "Bad Request", details: "Missing status", reqId: id, version: VERSION }, 400);

      const { error } = await supabase
        .from("profiles")
        .update({ access_status: status })
        .eq("id", finalTargetUserId);

      console.log(`[${VERSION}] [${id}] UPDATE_STATUS`, {
        ok: !error,
        targetUserId: finalTargetUserId,
        status,
        error: error ? { message: error.message, name: error.name } : null,
      });

      if (error) return json({ error: "Update failed", details: error.message, reqId: id, version: VERSION }, 500);

      return json({ success: true, message: "Status updated", reqId: id, version: VERSION }, 200);
    }

    return json({ error: "Invalid action", reqId: id, version: VERSION }, 400);
  } catch (e: any) {
    console.error(`[${VERSION}] [${id}] UNHANDLED`, { message: e?.message ?? String(e) });
    return json({ error: "Server error", details: e?.message ?? String(e), reqId: id, version: VERSION }, 500);
  } finally {
    console.log(`[${VERSION}] [${id}] END`, { ms: Date.now() - startedAt });
  }
});