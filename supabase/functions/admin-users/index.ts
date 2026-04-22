// supabase/functions/admin-users/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "admin-users@v2026-02-12.5-ORG-SCOPED-FIX";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reqId() { return crypto.randomUUID(); }
function safePrefix(v: string | null, n = 14) { if (!v) return null; return v.slice(0, n); }
function json(resBody: any, status = 200) {
  return new Response(JSON.stringify(resBody), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  const id = reqId();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server misconfigured", reqId: id, version: VERSION }, 500);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    let payload: any = null;
    try { payload = await req.json(); } catch { return json({ error: "Bad Request", details: "Invalid JSON body", reqId: id, version: VERSION }, 400); }

    const { action, userId, email, password, metadata, orgId, roleId, full_name, phone_e164 } = payload ?? {};

    if (action === "list") {
      if (!orgId) return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);

      const { data: userOrgRoles, error: rolesError } = await supabaseAdmin
        .from("user_org_roles").select("user_id, role_id, roles(id, name)").eq("org_id", orgId);
      if (rolesError) return json({ error: "Failed to fetch org users", details: rolesError.message, reqId: id, version: VERSION }, 500);

      const orgUserIds = (userOrgRoles ?? []).map((uor: any) => uor.user_id);
      if (orgUserIds.length === 0) return json({ users: [], reqId: id, version: VERSION }, 200);

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
      if (authError) return json({ error: "Admin listUsers failed", details: authError.message, reqId: id, version: VERSION }, 500);

      const authUsers = (authData?.users ?? []).filter((u: any) => orgUserIds.includes(u.id));
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, name, email, phone_e164").in("id", orgUserIds);
      const profilesMap = new Map((profiles ?? []).map((p: any) => [p.id, { name: p.name, email: p.email, phone_e164: p.phone_e164 }]));
      const rolesMap = new Map((userOrgRoles ?? []).map((uor: any) => [uor.user_id, { role_id: uor.role_id, role_name: uor.roles?.name ?? null }]));

      const users = authUsers.map((authUser: any) => {
        const profile = profilesMap.get(authUser.id) ?? { name: null, email: null, phone_e164: null };
        const roleData = rolesMap.get(authUser.id) ?? { role_id: null, role_name: null };
        return { id: authUser.id, email: authUser.email ?? profile.email ?? null, full_name: profile.name ?? authUser.email?.split('@')[0] ?? 'Usuario', phone_e164: profile.phone_e164 ?? null, role_id: roleData.role_id, role_name: roleData.role_name, created_at: authUser.created_at ?? null, last_sign_in_at: authUser.last_sign_in_at ?? null };
      });

      return json({ users, reqId: id, version: VERSION }, 200);
    }

    if (action === "create") {
      if (!orgId) return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);
      if (!email) return json({ error: "Bad Request", details: "Missing email", reqId: id, version: VERSION }, 400);

      const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = (existingAuthUsers?.users ?? []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

      let createdUserId: string;
      let alreadyExisted = false;

      if (existingUser) {
        createdUserId = existingUser.id;
        alreadyExisted = true;
        if (full_name || phone_e164) {
          const updateData: any = {};
          if (full_name) updateData.name = full_name;
          if (phone_e164 !== undefined) updateData.phone_e164 = phone_e164;
          await supabaseAdmin.from("profiles").update(updateData).eq("id", createdUserId);
        }
      } else {
        if (!password) return json({ error: "Bad Request", details: "Missing password for new user", reqId: id, version: VERSION }, 400);
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata || {} });
        if (authError) return json({ error: "Admin createUser failed", details: authError.message, reqId: id, version: VERSION }, 500);
        createdUserId = authData.user.id;
        await supabaseAdmin.from("profiles").upsert({ id: createdUserId, name: full_name ?? null, email, phone_e164: phone_e164 ?? null }, { onConflict: "id" });
      }

      if (roleId) {
        await supabaseAdmin.from("user_org_roles").upsert({ user_id: createdUserId, org_id: orgId, role_id: roleId, assigned_by: createdUserId, assigned_at: new Date().toISOString() }, { onConflict: "user_id,org_id" }).select();
      }

      return json({ userId: createdUserId, user_id: createdUserId, alreadyExisted, reqId: id, version: VERSION }, 200);
    }

    if (action === "update_role") {
      if (!userId || !orgId) return json({ error: "Bad Request", details: "Missing userId or orgId", reqId: id, version: VERSION }, 400);

      if (full_name || email || phone_e164 !== undefined) {
        const updateData: any = {};
        if (full_name) updateData.name = full_name;
        if (email) updateData.email = email;
        if (phone_e164 !== undefined) updateData.phone_e164 = phone_e164;
        await supabaseAdmin.from("profiles").update(updateData).eq("id", userId);
      }

      if (roleId) {
        await supabaseAdmin.from("user_org_roles").upsert({ user_id: userId, org_id: orgId, role_id: roleId, assigned_by: userId, assigned_at: new Date().toISOString() }, { onConflict: "user_id,org_id" }).select();
      }

      return json({ success: true, reqId: id, version: VERSION }, 200);
    }

    if (action === "remove_from_org") {
      if (!userId || !orgId) return json({ error: "Bad Request", details: "Missing userId or orgId", reqId: id, version: VERSION }, 400);

      const { error: removeError } = await supabaseAdmin.from("user_org_roles").delete().eq("user_id", userId).eq("org_id", orgId);
      if (removeError) return json({ error: "Remove from org failed", details: removeError.message, reqId: id, version: VERSION }, 500);

      await supabaseAdmin.from("user_warehouse_access").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_providers").delete().eq("user_id", userId);

      return json({ success: true, reqId: id, version: VERSION }, 200);
    }

    return json({ error: "Invalid action", reqId: id, version: VERSION }, 400);
  } catch (e: any) {
    return json({ error: "Server error", details: e?.message ?? String(e), reqId: id, version: VERSION }, 500);
  }
});