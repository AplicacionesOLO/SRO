import { supabase } from '@/lib/supabase';

export type DockVisibilityMode = 'all' | 'users' | 'roles';

export interface DockVisibility {
  mode: DockVisibilityMode;
  userIds: string[];
  roleIds: string[];
}

export interface DockVisibilityLinks {
  users: Record<string, string[]>;
  roles: Record<string, string[]>;
}

export const EMPTY_VISIBILITY: DockVisibility = {
  mode: 'all',
  userIds: [],
  roleIds: [],
};

/**
 * Trae las asignaciones (usuario / rol) de una lista de andenes.
 * Devuelve dos mapas indexados por dock_id.
 */
export async function getDockVisibilityLinks(dockIds: string[]): Promise<DockVisibilityLinks> {
  const empty: DockVisibilityLinks = { users: {}, roles: {} };
  if (!dockIds || dockIds.length === 0) return empty;

  const [usersRes, rolesRes] = await Promise.all([
    supabase.from('dock_visible_users').select('dock_id, user_id').in('dock_id', dockIds),
    supabase.from('dock_visible_roles').select('dock_id, role_id').in('dock_id', dockIds),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (rolesRes.error) throw rolesRes.error;

  const users: Record<string, string[]> = {};
  (usersRes.data ?? []).forEach((row: any) => {
    if (!row?.dock_id || !row?.user_id) return;
    users[row.dock_id] = [...(users[row.dock_id] ?? []), row.user_id];
  });

  const roles: Record<string, string[]> = {};
  (rolesRes.data ?? []).forEach((row: any) => {
    if (!row?.dock_id || !row?.role_id) return;
    roles[row.dock_id] = [...(roles[row.dock_id] ?? []), row.role_id];
  });

  return { users, roles };
}

/** Lee la visibilidad configurada de un andén. */
export async function getDockVisibility(dockId: string): Promise<DockVisibility> {
  if (!dockId) return EMPTY_VISIBILITY;

  const [dockRes, links] = await Promise.all([
    supabase.from('docks').select('visibility_mode, visible_user_id').eq('id', dockId).maybeSingle(),
    getDockVisibilityLinks([dockId]),
  ]);

  if (dockRes.error) throw dockRes.error;

  const legacyUserId = dockRes.data?.visible_user_id ?? null;
  const mode = (dockRes.data?.visibility_mode as DockVisibilityMode) ?? 'all';
  const userIds = [...(links.users[dockId] ?? [])];

  if (legacyUserId && !userIds.includes(legacyUserId)) {
    userIds.push(legacyUserId);
  }

  return {
    mode: legacyUserId ? 'users' : mode,
    userIds,
    roleIds: links.roles[dockId] ?? [],
  };
}

/**
 * Guarda la visibilidad de un andén.
 * mode = 'all' limpia todas las asignaciones.
 */
export async function saveDockVisibility(
  dockId: string,
  visibility: DockVisibility
): Promise<void> {
  if (!dockId) return;

  const mode: DockVisibilityMode = visibility.mode;
  const userIds = mode === 'users' ? Array.from(new Set(visibility.userIds)) : [];
  const roleIds = mode === 'roles' ? Array.from(new Set(visibility.roleIds)) : [];

  const { error: dockError } = await supabase
    .from('docks')
    .update({ visibility_mode: mode, visible_user_id: null })
    .eq('id', dockId);

  if (dockError) throw dockError;

  const { error: delUsersError } = await supabase
    .from('dock_visible_users')
    .delete()
    .eq('dock_id', dockId);
  if (delUsersError) throw delUsersError;

  const { error: delRolesError } = await supabase
    .from('dock_visible_roles')
    .delete()
    .eq('dock_id', dockId);
  if (delRolesError) throw delRolesError;

  if (userIds.length > 0) {
    const { error } = await supabase
      .from('dock_visible_users')
      .insert(userIds.map((userId) => ({ dock_id: dockId, user_id: userId })));
    if (error) throw error;
  }

  if (roleIds.length > 0) {
    const { error } = await supabase
      .from('dock_visible_roles')
      .insert(roleIds.map((roleId) => ({ dock_id: dockId, role_id: roleId })));
    if (error) throw error;
  }
}