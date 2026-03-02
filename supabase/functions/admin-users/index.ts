// supabase/functions/admin-users/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "admin-users@v2026-02-12.5-ORG-SCOPED-FIX";

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

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(`[${VERSION}] [${id}] ENV_MISSING`, {
        hasUrl: !!supabaseUrl,
        hasServiceRole: !!serviceRoleKey,
      });
      return json(
        {
          error: "Server misconfigured",
          details: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
          reqId: id,
          version: VERSION,
        },
        500
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let payload: any = null;
    try {
      payload = await req.json();
    } catch {
      console.error(`[${VERSION}] [${id}] BAD_JSON`);
      return json(
        { error: "Bad Request", details: "Invalid JSON body", reqId: id, version: VERSION },
        400
      );
    }

    const {
      action,
      userId,
      email,
      password,
      metadata,
      orgId,
      roleId,
      roleIds,
      full_name,
      phone_e164,
      debug,
    } = payload ?? {};

    console.log(`[${VERSION}] [${id}] PAYLOAD`, {
      action,
      userId: userId ?? null,
      emailPrefix: email ? safePrefix(email, 6) : null,
      hasPassword: !!password,
      hasMetadata: !!metadata,
      orgId: orgId ?? null,
      roleId: roleId ?? null,
      roleIds: roleIds ?? null,
      full_name: full_name ?? null,
      phone_e164: phone_e164 ?? null,
      debug: debug ?? false,
    });

    // =========================
    // LIST
    // =========================
    if (action === "list") {
      if (!orgId) {
        console.error(`[${VERSION}] [${id}] LIST_MISSING_ORG_ID`);
        return json(
          { error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION },
          400
        );
      }

      console.log(`[${VERSION}] [${id}] LIST_START`, { orgId });

      const { data: userOrgRoles, error: rolesError } = await supabaseAdmin
        .from("user_org_roles")
        .select(
          `
          user_id,
          role_id,
          roles (
            id,
            name
          )
        `
        )
        .eq("org_id", orgId);

      if (rolesError) {
        console.error(`[${VERSION}] [${id}] LIST_ROLES_ERROR`, { message: rolesError.message });
        return json(
          { error: "Failed to fetch org users", details: rolesError.message, reqId: id, version: VERSION },
          500
        );
      }

      const orgUserIds = (userOrgRoles ?? []).map((uor: any) => uor.user_id);
      console.log(`[${VERSION}] [${id}] LIST_ORG_USERS`, { count: orgUserIds.length });

      if (orgUserIds.length === 0) {
        console.log(`[${VERSION}] [${id}] LIST_SUCCESS_EMPTY`);
        return json({ users: [], reqId: id, version: VERSION }, 200);
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
      if (authError) {
        console.error(`[${VERSION}] [${id}] LIST_AUTH_ERROR`, { message: authError.message });
        return json(
          { error: "Admin listUsers failed", details: authError.message, reqId: id, version: VERSION },
          500
        );
      }

      const authUsers = (authData?.users ?? []).filter((u: any) => orgUserIds.includes(u.id));
      console.log(`[${VERSION}] [${id}] LIST_AUTH_USERS_FILTERED`, { count: authUsers.length });

      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email, phone_e164")
        .in("id", orgUserIds);

      if (profilesError) {
        console.warn(`[${VERSION}] [${id}] LIST_PROFILES_ERROR`, { message: profilesError.message });
      }

      const profilesMap = new Map((profiles ?? []).map((p: any) => [p.id, { name: p.name, email: p.email, phone_e164: p.phone_e164 }]));
      console.log(`[${VERSION}] [${id}] LIST_PROFILES`, { count: profilesMap.size });

      const rolesMap = new Map(
        (userOrgRoles ?? []).map((uor: any) => [
          uor.user_id,
          {
            role_id: uor.role_id,
            role_name: uor.roles?.name ?? null,
          },
        ])
      );

      const users = authUsers.map((authUser: any) => {
        const profile = profilesMap.get(authUser.id) ?? { name: null, email: null, phone_e164: null };
        const roleData = rolesMap.get(authUser.id) ?? { role_id: null, role_name: null };

        return {
          id: authUser.id,
          email: authUser.email ?? profile.email ?? null,
          full_name: profile.name ?? authUser.email?.split('@')[0] ?? 'Usuario',
          phone_e164: profile.phone_e164 ?? null,
          role_id: roleData.role_id,
          role_name: roleData.role_name,
          created_at: authUser.created_at ?? null,
          last_sign_in_at: authUser.last_sign_in_at ?? null,
        };
      });

      console.log(`[${VERSION}] [${id}] LIST_SUCCESS`, {
        totalUsers: users.length,
        sample: users.slice(0, 3).map((u: any) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          phone_e164: u.phone_e164,
          role_name: u.role_name,
        })),
      });

      return json({ users, reqId: id, version: VERSION }, 200);
    }

    // =========================
    // CREATE
    // =========================
    if (action === "create") {
      if (!orgId) {
        console.error(`[${VERSION}] [${id}] CREATE_MISSING_ORG_ID`);
        return json(
          { error: "Bad Request", details: "Missing orgId", reqId: id, version: VERSION },
          400
        );
      }

      if (!email) {
        console.error(`[${VERSION}] [${id}] CREATE_MISSING_EMAIL`);
        return json(
          { error: "Bad Request", details: "Missing email", reqId: id, version: VERSION },
          400
        );
      }

      console.log(`[${VERSION}] [${id}] CREATE_START`, { email: safePrefix(email, 6), orgId, roleId, phone_e164 });

      const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = (existingAuthUsers?.users ?? []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

      let createdUserId: string;
      let alreadyExisted = false;

      if (existingUser) {
        createdUserId = existingUser.id;
        alreadyExisted = true;
        console.log(`[${VERSION}] [${id}] CREATE_USER_EXISTS`, { userId: createdUserId, email: safePrefix(email, 6) });

        if (full_name || phone_e164) {
          const updateData: any = {};
          if (full_name) updateData.name = full_name;
          if (phone_e164 !== undefined) updateData.phone_e164 = phone_e164;

          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .update(updateData)
            .eq("id", createdUserId);

          if (profileError) {
            console.warn(`[${VERSION}] [${id}] CREATE_UPDATE_PROFILE_ERROR`, { message: profileError.message });
          } else {
            console.log(`[${VERSION}] [${id}] CREATE_UPDATE_PROFILE_SUCCESS`);
          }
        }
      } else {
        if (!password) {
          console.error(`[${VERSION}] [${id}] CREATE_MISSING_PASSWORD`);
          return json(
            { error: "Bad Request", details: "Missing password for new user", reqId: id, version: VERSION },
            400
          );
        }

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: metadata || {},
        });

        if (authError) {
          console.error(`[${VERSION}] [${id}] CREATE_AUTH_ERROR`, { message: authError.message });
          return json(
            { error: "Admin createUser failed", details: authError.message, reqId: id, version: VERSION },
            500
          );
        }

        createdUserId = authData.user.id;
        console.log(`[${VERSION}] [${id}] CREATE_AUTH_SUCCESS`, { userId: createdUserId });

        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              id: createdUserId,
              name: full_name ?? null,
              email,
              phone_e164: phone_e164 ?? null,
            },
            { onConflict: "id" }
          );

        if (profileError) {
          console.warn(`[${VERSION}] [${id}] CREATE_PROFILE_ERROR`, { message: profileError.message });
        } else {
          console.log(`[${VERSION}] [${id}] CREATE_PROFILE_SUCCESS`);
        }
      }

      if (roleId) {
        console.log(`[${VERSION}] [${id}] INSERTING_USER_ORG_ROLE`, {
          user_id: createdUserId,
          org_id: orgId,
          role_id: roleId,
          alreadyExisted,
        });

        const { data: insertedRole, error: roleError } = await supabaseAdmin
          .from("user_org_roles")
          .upsert(
            {
              user_id: createdUserId,
              org_id: orgId,
              role_id: roleId,
              assigned_by: createdUserId,
              assigned_at: new Date().toISOString(),
            },
            { onConflict: "user_id,org_id" }
          )
          .select();

        if (roleError) {
          console.error(`[${VERSION}] [${id}] CREATE_ROLE_ERROR`, { 
            message: roleError.message,
            code: roleError.code,
          });
          console.warn(`[${VERSION}] [${id}] Usuario ${alreadyExisted ? 're-agregado' : 'creado'} pero sin rol asignado`);
        } else {
          console.log(`[${VERSION}] [${id}] CREATE_ROLE_SUCCESS`, { 
            insertedData: insertedRole,
            rowCount: insertedRole?.length || 0
          });
        }
      } else {
        console.warn(`[${VERSION}] [${id}] NO_ROLE_ID_PROVIDED`);
      }

      console.log(`[${VERSION}] [${id}] CREATE_SUCCESS`, { userId: createdUserId, alreadyExisted });

      return json({ 
        userId: createdUserId, 
        user_id: createdUserId, 
        alreadyExisted,
        reqId: id, 
        version: VERSION 
      }, 200);
    }

    // =========================
    // UPDATE_ROLE
    // =========================
    if (action === "update_role") {
      if (!userId || !orgId) {
        console.error(`[${VERSION}] [${id}] UPDATE_MISSING_FIELDS`);
        return json(
          { error: "Bad Request", details: "Missing userId or orgId", reqId: id, version: VERSION },
          400
        );
      }

      console.log(`[${VERSION}] [${id}] UPDATE_START`, { userId, orgId, roleId, full_name, phone_e164 });

      if (full_name || email || phone_e164 !== undefined) {
        const updateData: any = {};
        if (full_name) updateData.name = full_name;
        if (email) updateData.email = email;
        if (phone_e164 !== undefined) updateData.phone_e164 = phone_e164;

        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .update(updateData)
          .eq("id", userId);

        if (profileError) {
          console.warn(`[${VERSION}] [${id}] UPDATE_PROFILE_ERROR`, { message: profileError.message });
        } else {
          console.log(`[${VERSION}] [${id}] UPDATE_PROFILE_SUCCESS`);
        }
      }

      if (roleId) {
        console.log(`[${VERSION}] [${id}] UPDATING_USER_ORG_ROLE`, {
          user_id: userId,
          org_id: orgId,
          role_id: roleId,
        });

        const { data: updatedRole, error: roleError } = await supabaseAdmin
          .from("user_org_roles")
          .upsert(
            {
              user_id: userId,
              org_id: orgId,
              role_id: roleId,
              assigned_by: userId,
              assigned_at: new Date().toISOString(),
            },
            { onConflict: "user_id,org_id" }
          )
          .select();

        if (roleError) {
          console.error(`[${VERSION}] [${id}] UPDATE_ROLE_ERROR`, { 
            message: roleError.message,
            code: roleError.code,
          });
        } else {
          console.log(`[${VERSION}] [${id}] UPDATE_ROLE_SUCCESS`, { 
            updatedData: updatedRole,
            rowCount: updatedRole?.length || 0
          });
        }
      }

      console.log(`[${VERSION}] [${id}] UPDATE_SUCCESS`);
      return json({ success: true, reqId: id, version: VERSION }, 200);
    }

    // =========================
    // REMOVE_FROM_ORG
    // =========================
    if (action === "remove_from_org") {
      if (!userId || !orgId) {
        console.error(`[${VERSION}] [${id}] REMOVE_MISSING_FIELDS`);
        return json(
          { error: "Bad Request", details: "Missing userId or orgId", reqId: id, version: VERSION },
          400
        );
      }

      console.log(`[${VERSION}] [${id}] REMOVE_START`, { userId, orgId });

      const { error: removeError } = await supabaseAdmin
        .from("user_org_roles")
        .delete()
        .eq("user_id", userId)
        .eq("org_id", orgId);

      if (removeError) {
        console.error(`[${VERSION}] [${id}] REMOVE_ERROR`, { message: removeError.message });
        return json(
          { error: "Remove from org failed", details: removeError.message, reqId: id, version: VERSION },
          500
        );
      }

      const { error: warehouseError } = await supabaseAdmin
        .from("user_warehouse_access")
        .delete()
        .eq("user_id", userId);

      if (warehouseError) {
        console.warn(`[${VERSION}] [${id}] REMOVE_WAREHOUSE_ACCESS_ERROR`, { message: warehouseError.message });
      }

      const { error: providersError } = await supabaseAdmin
        .from("user_providers")
        .delete()
        .eq("user_id", userId);

      if (providersError) {
        console.warn(`[${VERSION}] [${id}] REMOVE_USER_PROVIDERS_ERROR`, { message: providersError.message });
      }

      console.log(`[${VERSION}] [${id}] REMOVE_SUCCESS - Usuario desasociado de la org`);
      return json({ success: true, reqId: id, version: VERSION }, 200);
    }

    return json({ error: "Invalid action", reqId: id, version: VERSION }, 400);
  } catch (e: any) {
    console.error(`[${VERSION}] [${id}] UNHANDLED`, { message: e?.message ?? String(e) });
    return json(
      { error: "Server error", details: e?.message ?? String(e), reqId: id, version: VERSION },
      500
    );
  } finally {
    console.log(`[${VERSION}] [${id}] END`, { ms: Date.now() - startedAt });
  }
});