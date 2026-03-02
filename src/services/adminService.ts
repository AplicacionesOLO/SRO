import { supabase } from "../lib/supabase";

export interface Role {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role_id: string;
  role_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

// Mantengo tu interfaz original por compatibilidad
export interface UserOrgRole {
  id: string;
  user_id: string;
  org_id: string;
  role_id: string;
  assigned_by: string | null;
  assigned_at: string;
  user?: { id: string; name: string | null; email: string | null };
  role?: { name: string; description: string | null };
  organization?: { name: string };
}

function extractFnError(err: any) {
  // supabase-js a veces mete JSON string en message
  const msg = err?.message || "Error desconocido";
  try {
    const parsed = JSON.parse(msg);
    return parsed?.details || parsed?.error || msg;
  } catch {
    return msg;
  }
}

export const adminService = {
  // =========================
  // Roles
  // =========================
  async getRoles(): Promise<Role[]> {
    const { data, error } = await supabase.from("roles").select("*").order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createRole(role: { name: string; description?: string }): Promise<Role> {
    const { data, error } = await supabase.from("roles").insert(role).select().single();
    if (error) throw error;
    return data;
  },

  async updateRole(id: string, updates: { name?: string; description?: string }): Promise<Role> {
    const { data, error } = await supabase.from("roles").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteRole(id: string): Promise<void> {
    const { error } = await supabase.from("roles").delete().eq("id", id);
    if (error) throw error;
  },

  // =========================
  // Permisos
  // =========================
  async getPermissions(): Promise<Permission[]> {
    const { data, error } = await supabase
      .from("permissions")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createPermission(permission: { name: string; description?: string; category?: string }): Promise<Permission> {
    const { data, error } = await supabase.from("permissions").insert(permission).select().single();
    if (error) throw error;
    return data;
  },

  async updatePermission(id: string, updates: { name?: string; description?: string; category?: string }): Promise<Permission> {
    const { data, error } = await supabase.from("permissions").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async deletePermission(id: string): Promise<void> {
    const { error } = await supabase.from("permissions").delete().eq("id", id);
    if (error) throw error;
  },

  // =========================
  // Matriz de permisos
  // =========================
  async getRolePermissions(): Promise<RolePermission[]> {
    const { data, error } = await supabase.from("role_permissions").select("*");
    if (error) throw error;
    return data || [];
  },

  async addPermissionToRole(roleId: string, permissionId: string, orgId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    const { error } = await supabase.from("role_permissions").insert({ role_id: roleId, permission_id: permissionId });
    if (error) throw error;

    await supabase.from("admin_audit_log").insert({
      org_id: orgId,
      event_type: "permission_added",
      entity_type: "role_permission",
      entity_id: `${roleId}:${permissionId}`,
      details: { role_id: roleId, permission_id: permissionId },
      changed_by: user.id,
    });
  },

  async removePermissionFromRole(roleId: string, permissionId: string, orgId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    const { error } = await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_id", permissionId);
    if (error) throw error;

    await supabase.from("admin_audit_log").insert({
      org_id: orgId,
      event_type: "permission_removed",
      entity_type: "role_permission",
      entity_id: `${roleId}:${permissionId}`,
      details: { role_id: roleId, permission_id: permissionId },
      changed_by: user.id,
    });
  },

  async bulkUpdateRolePermissions(roleId: string, permissionIds: string[], orgId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    await supabase.from("role_permissions").delete().eq("role_id", roleId);

    if (permissionIds.length > 0) {
      const { error } = await supabase.from("role_permissions").insert(
        permissionIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId }))
      );
      if (error) throw error;
    }

    await supabase.from("admin_audit_log").insert({
      org_id: orgId,
      event_type: "bulk_permissions_update",
      entity_type: "role_permission",
      entity_id: roleId,
      details: { role_id: roleId, permission_ids: permissionIds },
      changed_by: user.id,
    });
  },

  // =========================
  // Usuarios (✅ Edge Function)
  // =========================
  async getOrgUsers(orgId: string): Promise<AdminUserRow[]> {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "list", orgId },
    });
    if (error) throw new Error(extractFnError(error));
    return (data?.users as AdminUserRow[]) || [];
  },

  async createOrgUser(params: { orgId: string; email: string; password: string; roleId: string; full_name?: string }): Promise<{ user_id: string }> {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "create",
        orgId: params.orgId,
        email: params.email,
        password: params.password,
        roleId: params.roleId,
        full_name: params.full_name,
      },
    });
    if (error) throw new Error(extractFnError(error));
    return { user_id: data?.user_id as string };
  },

  async updateOrgUser(params: { orgId: string; userId: string; roleId: string; full_name?: string; email?: string }): Promise<void> {
    const { error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "update_role",
        orgId: params.orgId,
        userId: params.userId,
        roleId: params.roleId,
        full_name: params.full_name,
        email: params.email,
      },
    });
    if (error) throw new Error(extractFnError(error));
  },

  async removeOrgUser(params: { orgId: string; userId: string }): Promise<void> {
    const { error } = await supabase.functions.invoke("admin-users", {
      body: { action: "remove_from_org", orgId: params.orgId, userId: params.userId },
    });
    if (error) throw new Error(extractFnError(error));
  },
};

