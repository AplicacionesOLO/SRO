// supabase/functions/admin-users/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "admin-users@v2026-11-02.1-EMAIL-SYNC";

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

// ✅ PAGINACIÓN COMPLETA: Supabase pagina auth.admin.listUsers() a 50 por defecto.
// Esta función itera todas las páginas hasta obtener TODOS los usuarios.
async function listAllAuthUsers(supabaseAdmin: any) {
  const allUsers: any[] = [];
  let page = 1;
  const perPage = 50;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = data?.users ?? [];
    allUsers.push(...users);

    hasMore = users.length === perPage;
    page++;

    // Safety brake — max 20 pages (1000 users)
    if (page > 20) {
      hasMore = false;
    }
  }

  return allUsers;
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

      // ✅ PAGINACIÓN: obtener TODOS los usuarios de auth, no solo los primeros 50
      const authUsers = await listAllAuthUsers(supabaseAdmin);
      const filteredAuthUsers = authUsers.filter((u: any) => orgUserIds.includes(u.id));

      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, name, email, phone_e164").in("id", orgUserIds);
      const profilesMap = new Map((profiles ?? []).map((p: any) => [p.id, { name: p.name, email: p.email, phone_e164: p.phone_e164 }]));
      const rolesMap = new Map((userOrgRoles ?? []).map((uor: any) => [uor.user_id, { role_id: uor.role_id, role_name: uor.roles?.name ?? null }]));

      const users = filteredAuthUsers.map((authUser: any) => {
        const profile = profilesMap.get(authUser.id) ?? { name: null, email: null, phone_e164: null };
        const roleData = rolesMap.get(authUser.id) ?? { role_id: null, role_name: null };
        return { id: authUser.id, email: authUser.email ?? profile.email ?? null, full_name: profile.name ?? authUser.email?.split('@')[0] ?? 'Usuario', phone_e164: profile.phone_e164 ?? null, role_id: roleData.role_id, role_name: roleData.role_name, created_at: authUser.created_at ?? null, last_sign_in_at: authUser.last_sign_in_at ?? null };
      });

      return json({ users, reqId: id, version: VERSION }, 200);
    }

    if (action === "create") {
      if (!orgId) return json({ error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION }, 400);
      if (!email) return json({ error: "Bad Request", details: "Missing email", reqId: id, version: VERSION }, 400);
      if (!password) return json({ error: "Bad Request", details: "Missing password for new user", reqId: id, version: VERSION }, 400);

      // ⚡ FAST PATH: crear directamente sin escanear TODOS los usuarios de auth.
      // Supabase auth.admin.createUser() ya rechaza emails duplicados con error 422.
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata || {},
      });

      if (authError) {
        const errMsg = authError.message ?? '';
        const errStatus = (authError as any)?.status ?? 0;

        if (errStatus === 422 || errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('been registered')) {
          return json({
            error: "DUPLICATE_EMAIL",
            details: "Ese email ya está registrado en Auth. Usá otro email o editá el usuario existente.",
            reqId: id,
            version: VERSION,
          }, 409);
        }

        return json({ error: "Admin createUser failed", details: authError.message, reqId: id, version: VERSION }, 500);
      }

      const createdUserId = authData.user.id;

      // Upsert del perfil
      await supabaseAdmin.from("profiles").upsert(
        { id: createdUserId, name: full_name ?? null, email, phone_e164: phone_e164 ?? null },
        { onConflict: "id" }
      );

      // Asignar rol si se especificó
      if (roleId) {
        await supabaseAdmin.from("user_org_roles").upsert(
          { user_id: createdUserId, org_id: orgId, role_id: roleId, assigned_by: createdUserId, assigned_at: new Date().toISOString() },
          { onConflict: "user_id,org_id" }
        ).select();
      }

      return json({ userId: createdUserId, user_id: createdUserId, alreadyExisted: false, reqId: id, version: VERSION }, 200);
    }

    if (action === "update_role") {
      if (!userId || !orgId) return json({ error: "Bad Request", details: "Missing userId or orgId", reqId: id, version: VERSION }, 400);

      let normalizedEmail: string | null = null;

      // ✅ SYNC DE EMAIL DE ACCESO:
      // El email de login vive en auth.users, NO en profiles.
      // Antes solo se actualizaba profiles.email, así que el usuario seguía
      // entrando con el email viejo (o no podía entrar con el nuevo).
      // Aquí actualizamos el usuario de Auth POR ID, por lo que se conserva
      // el mismo UUID y NO se pierde ningún registro relacionado.
      if (email) {
        normalizedEmail = String(email).trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          return json({ error: "INVALID_EMAIL", details: "El email no tiene un formato válido.", reqId: id, version: VERSION }, 400);
        }

        // Conflicto en profiles (otro usuario con ese email)
        const { data: conflict } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", normalizedEmail)
          .neq("id", userId)
          .maybeSingle();

        if (conflict) {
          return json({ error: "EMAIL_ALREADY_USED", details: "Ese email ya está en uso por otro usuario del sistema.", reqId: id, version: VERSION }, 409);
        }

        // ¿Cambió respecto al email real de Auth?
        const { data: authUserData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (getUserError) {
          return json({ error: "AUTH_USER_LOOKUP_FAILED", details: getUserError.message, reqId: id, version: VERSION }, 500);
        }

        const currentAuthEmail = (authUserData?.user?.email ?? "").trim().toLowerCase();

        if (currentAuthEmail !== normalizedEmail) {
          const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email: normalizedEmail,
            email_confirm: true,
          });

          if (authUpdateError) {
            const m = (authUpdateError.message ?? "").toLowerCase();
            if (m.includes("already") || m.includes("registered") || m.includes("duplicate") || m.includes("exists")) {
              return json({ error: "EMAIL_ALREADY_USED", details: "Ese email ya está registrado en el sistema de acceso.", reqId: id, version: VERSION }, 409);
            }
            return json({ error: "AUTH_EMAIL_UPDATE_FAILED", details: authUpdateError.message, reqId: id, version: VERSION }, 500);
          }
        }
      }

      if (full_name || normalizedEmail || phone_e164 !== undefined) {
        const updateData: any = {};
        if (full_name) updateData.name = full_name;
        if (normalizedEmail) updateData.email = normalizedEmail;
        if (phone_e164 !== undefined) updateData.phone_e164 = phone_e164;
        const { error: profileError } = await supabaseAdmin.from("profiles").update(updateData).eq("id", userId);
        if (profileError) {
          return json({ error: "PROFILE_UPDATE_FAILED", details: profileError.message, reqId: id, version: VERSION }, 500);
        }
      }

      if (roleId) {
        await supabaseAdmin.from("user_org_roles").upsert({ user_id: userId, org_id: orgId, role_id: roleId, assigned_by: userId, assigned_at: new Date().toISOString() }, { onConflict: "user_id,org_id" }).select();
      }

      return json({ success: true, email: normalizedEmail, reqId: id, version: VERSION }, 200);
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
