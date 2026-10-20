import { supabase } from '@/lib/supabase';

export interface OrgUserOption {
  id: string;
  name: string;
  email: string | null;
}

export interface OrgRoleOption {
  id: string;
  name: string;
}

/**
 * Devuelve los usuarios activos (miembros) de una organización para usarlos
 * en selectores tipo "Visible solo para".
 * Solo expone id, nombre y email — nada sensible.
 *
 * Nota: user_org_roles.user_id apunta a auth.users (no a profiles), por eso
 * se resuelve en dos consultas y no con un embed de PostgREST.
 */
export async function getOrgUsersForPicker(orgId: string): Promise<OrgUserOption[]> {
  if (!orgId) return [];

  const { data: members, error } = await supabase
    .from('user_org_roles')
    .select('user_id')
    .eq('org_id', orgId);

  if (error) throw error;

  const ids = Array.from(
    new Set((members ?? []).map((row: any) => row.user_id).filter(Boolean))
  );
  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', ids);

  if (profilesError) throw profilesError;

  const users: OrgUserOption[] = (profiles ?? []).map((row: any) => ({
    id: row.id,
    name: row.name?.trim() || row.email || 'Usuario',
    email: row.email ?? null,
  }));

  const seen = new Set<string>();
  return users
    .filter((u) => {
      if (!u.id || seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Devuelve los roles que están asignados a miembros de la organización.
 * Se usa para "Visible solo para roles".
 */
export async function getOrgRolesForPicker(orgId: string): Promise<OrgRoleOption[]> {
  if (!orgId) return [];

  const { data: members, error } = await supabase
    .from('user_org_roles')
    .select('role_id')
    .eq('org_id', orgId);

  if (error) throw error;

  const ids = Array.from(
    new Set((members ?? []).map((row: any) => row.role_id).filter(Boolean))
  );
  if (ids.length === 0) return [];

  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('id, name')
    .in('id', ids);

  if (rolesError) throw rolesError;

  return ((roles ?? []) as OrgRoleOption[])
    .filter((r) => !!r?.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}