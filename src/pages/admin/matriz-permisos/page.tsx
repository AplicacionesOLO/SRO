import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePermissions } from '../../../hooks/usePermissions';
import { useAuth } from '../../../contexts/AuthContext';

interface Role {
  id: string;
  name: string;
}

interface Permission {
  id: string;
  name: string;
  category: string;
}

interface RolePermission {
  role_id: string;
  permission_id: string;
}

// ✅ Función para traducir nombres técnicos a descripciones amigables
const getPermissionLabel = (technicalName: string): string => {
  const translations: Record<string, string> = {
    // Admin - Usuarios
    'admin.users.view': 'Ver usuarios',
    'admin.users.create': 'Crear usuarios',
    'admin.users.update': 'Editar usuarios',
    'admin.users.delete': 'Eliminar usuarios',
    'admin.users.assign_roles': 'Asignar roles a usuarios',
    
    // Admin - Roles
    'admin.roles.view': 'Ver roles',
    'admin.roles.create': 'Crear roles',
    'admin.roles.update': 'Editar roles',
    'admin.roles.delete': 'Eliminar roles',
    
    // Admin - Permisos
    'admin.permissions.view': 'Ver permisos',
    'admin.permissions.create': 'Crear permisos',
    'admin.permissions.update': 'Editar permisos',
    'admin.permissions.delete': 'Eliminar permisos',
    
    // Admin - Matriz
    'admin.matrix.view': 'Ver matriz de permisos',
    'admin.matrix.update': 'Editar matriz de permisos',
    
    // Almacenes
    'warehouses.view': 'Ver almacenes',
    'warehouses.create': 'Crear almacenes',
    'warehouses.update': 'Editar almacenes',
    'warehouses.delete': 'Eliminar almacenes',
    
    // Andenes
    'docks.view': 'Ver andenes',
    'docks.create': 'Crear andenes',
    'docks.update': 'Editar andenes',
    'docks.delete': 'Eliminar andenes',
    
    // Reservas
    'reservations.view': 'Ver reservas',
    'reservations.create': 'Crear reservas',
    'reservations.update': 'Editar reservas',
    'reservations.delete': 'Eliminar reservas',
    'reservations.approve': 'Aprobar reservas',
    'reservations.reject': 'Rechazar reservas',
    
    // Calendario
    'calendar.view': 'Ver calendario',
    'calendar.manage': 'Gestionar calendario',
    'calendar.block': 'Bloquear horarios',
    
    // Catálogos
    'catalogs.view': 'Ver catálogos',
    'catalogs.create': 'Crear catálogos',
    'catalogs.update': 'Editar catálogos',
    'catalogs.delete': 'Eliminar catálogos',
    
    // Proveedores
    'providers.view': 'Ver proveedores',
    'providers.create': 'Crear proveedores',
    'providers.update': 'Editar proveedores',
    'providers.delete': 'Eliminar proveedores',
    
    // Tipos de carga
    'cargo_types.view': 'Ver tipos de carga',
    'cargo_types.create': 'Crear tipos de carga',
    'cargo_types.update': 'Editar tipos de carga',
    'cargo_types.delete': 'Eliminar tipos de carga',
    
    // Perfiles de tiempo
    'time_profiles.view': 'Ver perfiles de tiempo',
    'time_profiles.create': 'Crear perfiles de tiempo',
    'time_profiles.update': 'Editar perfiles de tiempo',
    'time_profiles.delete': 'Eliminar perfiles de tiempo',
    
    // Dashboard
    'dashboard.view': 'Ver panel de control',
    'dashboard.analytics': 'Ver analíticas',
    
    // Reportes
    'reports.view': 'Ver reportes',
    'reports.export': 'Exportar reportes',

    // ✅ NUEVOS: Permisos de menú principal
    'menu.dashboard.view': 'Ver menú Dashboard',
    'menu.calendario.view': 'Ver menú Calendario',
    'menu.reservas.view': 'Ver menú Reservas',
    'menu.andenes.view': 'Ver menú Andenes',
    'menu.manpower.view': 'Ver menú Manpower',
    'menu.casetilla.view': 'Ver menú Punto Control IN/OUT',

    // ✅ NUEVOS: Permisos de submenú Administración
    'menu.admin.view': 'Ver menú Administración',
    'menu.admin.usuarios.view': 'Ver menú Usuarios',
    'menu.admin.roles.view': 'Ver menú Roles',
    'menu.admin.matriz_permisos.view': 'Ver menú Matriz de Permisos',
    'menu.admin.catalogos.view': 'Ver menú Catálogos',
    'menu.admin.almacenes.view': 'Ver menú Almacenes',
    'menu.admin.correspondencia.view': 'Ver menú Correspondencia',

    // ✅ NUEVOS: Permisos de tabs de Correspondencia
    'correspondence.gmail_account.view': 'Ver tab Cuenta Gmail',
    'correspondence.rules.view': 'Ver tab Reglas de Correspondencia',
    'correspondence.logs.view': 'Ver tab Bitácora de Envíos',
  };

  // Si existe traducción, usarla
  if (translations[technicalName]) {
    return translations[technicalName];
  }

  // Si no existe, intentar generar una descripción automática
  const parts = technicalName.split('.');
  if (parts.length >= 2) {
    const module = parts[0];
    const action = parts[parts.length - 1];
    
    const actionLabels: Record<string, string> = {
      'view': 'Ver',
      'create': 'Crear',
      'update': 'Editar',
      'delete': 'Eliminar',
      'manage': 'Gestionar',
      'approve': 'Aprobar',
      'reject': 'Rechazar',
      'export': 'Exportar',
    };

    const moduleLabels: Record<string, string> = {
      'admin': 'administración',
      'users': 'usuarios',
      'roles': 'roles',
      'permissions': 'permisos',
      'warehouses': 'almacenes',
      'docks': 'andenes',
      'reservations': 'reservas',
      'calendar': 'calendario',
      'catalogs': 'catálogos',
      'providers': 'proveedores',
      'cargo_types': 'tipos de carga',
      'time_profiles': 'perfiles de tiempo',
      'dashboard': 'panel',
      'reports': 'reportes',
      'menu': 'menú',
      'correspondence': 'correspondencia',
    };

    const actionLabel = actionLabels[action] || action;
    const moduleLabel = moduleLabels[module] || module;
    
    return `${actionLabel} ${moduleLabel}`;
  }

  // Si no se puede traducir, devolver el nombre original
  return technicalName;
};

// ✅ Función para traducir categorías
const getCategoryLabel = (category: string): string => {
  const categoryLabels: Record<string, string> = {
    'admin': 'Administración',
    'warehouses': 'Almacenes',
    'docks': 'Andenes',
    'reservations': 'Reservas',
    'calendar': 'Calendario',
    'catalogs': 'Catálogos',
    'providers': 'Proveedores',
    'cargo_types': 'Tipos de Carga',
    'time_profiles': 'Perfiles de Tiempo',
    'dashboard': 'Panel de Control',
    'reports': 'Reportes',
    'menu': 'Menú de Navegación',
    'correspondence': 'Correspondencia',
  };

  return categoryLabels[category] || category;
};

export default function MatrizPermisosPage() {
  const { user } = useAuth();
  const { orgId, loading: permissionsLoading, can } = usePermissions();

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  const [roleName, setRoleName] = useState<string | null>(null);
  const [roleCheckLoading, setRoleCheckLoading] = useState(true);

  const [canViewMatrix, setCanViewMatrix] = useState(false);
  const [canUpdateMatrix, setCanUpdateMatrix] = useState(false);
  const [permCheckLoading, setPermCheckLoading] = useState(true);

  // ✅ Validación directa por rol (ADMIN o Full Access tienen acceso total)
  const hasDirectAccess = user?.role === 'ADMIN' || user?.role === 'Full Access';

  useEffect(() => {
    console.log('[MatrizPermisos] usePermissions return', {
      orgId,
      permissionsLoading,
      userId: user?.id,
      userRole: user?.role,
      hasDirectAccess
    });
  }, [orgId, permissionsLoading, user?.id, user?.role, hasDirectAccess]);

  useEffect(() => {
    if (!permissionsLoading && orgId && user?.id) {
      console.log('[AdminMatrix] mounted', {
        orgId,
        userId: user.id,
        userRole: user.role,
        hasDirectAccess
      });
      checkRoleAndPerms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, orgId, user?.id]);

  const checkRoleAndPerms = async () => {
    try {
      setRoleCheckLoading(true);
      setPermCheckLoading(true);

      // ✅ Si tiene acceso directo por rol (ADMIN o Full Access), otorgar permisos completos
      if (hasDirectAccess) {
        console.log('[MatrizPermisos] Direct access granted via role:', user?.role);
        setRoleName(user?.role || 'ADMIN');
        setCanViewMatrix(true);
        setCanUpdateMatrix(true);
        loadData();
        return;
      }

      // 1) ✅ Buscar la asignación en user_org_roles (sin JOIN para evitar errores)
      const uorRes = await supabase
        .from('user_org_roles')
        .select('role_id')
        .eq('user_id', user!.id)
        .eq('org_id', orgId!)
        .maybeSingle();

      console.log('[MatrizPermisos] uor lookup', {
        hasRow: !!uorRes.data,
        role_id: uorRes.data?.role_id ?? null,
        error: uorRes.error ?? null
      });

      if (uorRes.error) throw uorRes.error;

      if (!uorRes.data?.role_id) {
        setRoleName(null);
        setCanViewMatrix(false);
        setCanUpdateMatrix(false);
        setLoading(false);
        return;
      }

      // 2) ✅ Obtener nombre del rol desde roles
      const roleRes = await supabase
        .from('roles')
        .select('name')
        .eq('id', uorRes.data.role_id)
        .maybeSingle();

      console.log('[MatrizPermisos] role name lookup', {
        roleName: roleRes.data?.name ?? null,
        error: roleRes.error ?? null
      });

      if (roleRes.error) throw roleRes.error;

      const fetchedRoleName = roleRes.data?.name ?? null;
      setRoleName(fetchedRoleName);

      // ✅ Si el rol obtenido es Full Access, otorgar acceso completo
      if (fetchedRoleName === 'Full Access' || fetchedRoleName === 'ADMIN') {
        console.log('[MatrizPermisos] Full access via fetched role:', fetchedRoleName);
        setCanViewMatrix(true);
        setCanUpdateMatrix(true);
        loadData();
        return;
      }

      // 3) ✅ Ver permisos reales con RPC (solo si no tiene acceso directo)
      const [viewRes, updateRes] = await Promise.all([
        supabase.rpc('has_org_permission', {
          p_org_id: orgId,
          p_permission: 'admin.matrix.view'
        }),
        supabase.rpc('has_org_permission', {
          p_org_id: orgId,
          p_permission: 'admin.matrix.update'
        })
      ]);

      console.log('[MatrizPermisos] rpc perms', {
        canView: viewRes.data,
        canUpdate: updateRes.data,
        viewError: viewRes.error ?? null,
        updateError: updateRes.error ?? null
      });

      if (viewRes.error) throw viewRes.error;
      if (updateRes.error) throw updateRes.error;

      // ✅ Combinar: acceso directo O permiso granular
      const canView = Boolean(viewRes.data) || can('admin.matrix.view');
      const canUpdate = Boolean(updateRes.data) || can('admin.matrix.update');

      setCanViewMatrix(canView);
      setCanUpdateMatrix(canUpdate);

      if (canView) {
        loadData();
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('[MatrizPermisos] Error checking role/perms:', error);
      // ✅ En caso de error, verificar acceso directo como fallback
      if (hasDirectAccess) {
        setRoleName(user?.role || null);
        setCanViewMatrix(true);
        setCanUpdateMatrix(true);
        loadData();
      } else {
        setRoleName(null);
        setCanViewMatrix(false);
        setCanUpdateMatrix(false);
        setLoading(false);
      }
    } finally {
      setRoleCheckLoading(false);
      setPermCheckLoading(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [rolesRes, permissionsRes, rolePermissionsRes] = await Promise.all([
        supabase.from('roles').select('id, name').order('name'),
        supabase.from('permissions').select('id, name, category').order('category, name'),
        supabase.from('role_permissions').select('role_id, permission_id')
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (permissionsRes.error) throw permissionsRes.error;
      if (rolePermissionsRes.error) throw rolePermissionsRes.error;

      setRoles(rolesRes.data || []);
      setPermissions(permissionsRes.data || []);
      setRolePermissions(rolePermissionsRes.data || []);
    } catch (error) {
      console.error('[MatrizPermisos] Error loading data:', error);
      setRoles([]);
      setPermissions([]);
      setRolePermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (roleId: string, permissionId: string) => {
    return rolePermissions.some(
      (rp) => rp.role_id === roleId && rp.permission_id === permissionId
    );
  };

  const togglePermission = async (roleId: string, permissionId: string) => {
    if (!canUpdateMatrix) {
      alert('No tienes permiso para editar la matriz');
      return;
    }

    const exists = hasPermission(roleId, permissionId);

    try {
      if (exists) {
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)
          .eq('permission_id', permissionId);

        if (error) throw error;

        setRolePermissions((prev) =>
          prev.filter((rp) => !(rp.role_id === roleId && rp.permission_id === permissionId))
        );
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .insert({ role_id: roleId, permission_id: permissionId });

        if (error) throw error;

        setRolePermissions((prev) => [...prev, { role_id: roleId, permission_id: permissionId }]);
      }
    } catch (error) {
      console.error('[MatrizPermisos] Error toggling permission:', error);
      alert('Error al actualizar el permiso');
    }
  };

  // ✅ Guard 1: Verificar permisos loading
  if (permissionsLoading || roleCheckLoading || permCheckLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando permisos...</p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Guard 2: Verificar orgId
  if (!orgId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-alert-line text-6xl text-amber-500 mb-4"></i>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Organización no encontrada</h1>
            <p className="text-gray-600">No tienes una organización asignada. Contacta al administrador.</p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Guard 3: Verificar que tenga rol asignado en la org (DB real)
  if (!roleName) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-user-unfollow-line text-6xl text-amber-500 mb-4"></i>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Rol no asignado</h1>
            <p className="text-gray-600">
              Tu usuario no tiene un rol asignado en esta organización. Contacta al administrador para asignarlo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Guard 4: Verificar permiso real para ver matriz
  if (!canViewMatrix) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h1>
            <p className="text-gray-600">No tienes permiso para ver la matriz de permisos.</p>
          </div>
        </div>
      </div>
    );
  }

  const safeRoles = roles ?? [];

const safePermissions = (permissions ?? []).filter((p) => {
  const name = (p.name || '').trim();

  // Evita filas "raras" tipo "ADMIN" o permisos sin patrón modulo.accion
  if (!name) return false;
  if (name.toUpperCase() === 'ADMIN') return false;

  // Si querés permitir otros formatos, quitá esta línea
  if (!name.includes('.')) return false;

  return true;
});

const groupedPermissions = safePermissions.reduce((acc, perm) => {
  const category = perm.category || 'Sin categoría';
  if (!acc[category]) acc[category] = [];
  acc[category].push(perm);
  return acc;
}, {} as Record<string, Permission[]>);


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando matriz de permisos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="px-6 py-8 max-w-[1600px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Matriz de Permisos</h1>
          <p className="text-gray-600 text-lg">Gestiona los permisos de cada rol en el sistema</p>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <colgroup>
                <col style={{ width: '400px' }} />
                {safeRoles.map((role) => (
                  <col key={role.id} style={{ width: '160px' }} />
                ))}
              </colgroup>

              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-10 shadow-sm border-r border-gray-200">
                    Permiso
                  </th>
                  {safeRoles.map((role) => (
                    <th
                      key={role.id}
                      className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <i className="ri-shield-user-line text-lg text-teal-600"></i>
                        <span className="whitespace-nowrap">{role.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <>
                    <tr key={`cat-${category}`} className="bg-gradient-to-r from-teal-50 to-teal-100/50 border-t-2 border-teal-200">
                      <td
                        colSpan={safeRoles.length + 1}
                        className="px-6 py-4 text-sm font-bold text-teal-900 uppercase tracking-wide"
                      >
                        <div className="flex items-center gap-2">
                          <i className="ri-folder-line text-lg"></i>
                          {getCategoryLabel(category)}
                        </div>
                      </td>
                    </tr>

                    {perms.map((permission, idx) => (
                      <tr 
                        key={permission.id} 
                        className={`hover:bg-teal-50/30 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                        }`}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 sticky left-0 bg-inherit shadow-sm border-r border-gray-200">
                          <div className="flex items-start gap-2">
                            <i className="ri-key-2-line text-gray-400 text-base mt-0.5 flex-shrink-0"></i>
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900">{getPermissionLabel(permission.name)}</span>
                              <span className="text-xs text-gray-500 mt-0.5 font-mono">{permission.name}</span>
                            </div>
                          </div>
                        </td>

                        {safeRoles.map((role) => (
                          <td key={role.id} className="px-6 py-4 text-center border-r border-gray-200 last:border-r-0">
                            <div className="flex items-center justify-center">
                              <label className="inline-flex items-center justify-center cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={hasPermission(role.id, permission.id)}
                                  onChange={() => togglePermission(role.id, permission.id)}
                                  disabled={!canUpdateMatrix}
                                  className="w-5 h-5 text-teal-600 border-2 border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all group-hover:border-teal-400"
                                />
                              </label>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {safePermissions.length === 0 && (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-key-line text-5xl text-gray-300"></i>
              </div>
              <p className="text-gray-500 text-lg font-medium">No hay permisos registrados</p>
              <p className="text-gray-400 text-sm mt-2">Los permisos aparecerán aquí cuando se creen</p>
            </div>
          )}
        </div>

        {/* Leyenda informativa */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 mb-1">
                Información sobre la matriz de permisos
              </p>
              <p className="text-sm text-blue-700">
                Marca los checkboxes para asignar permisos a cada rol. Los cambios se guardan automáticamente. 
                Los permisos están organizados por categorías para facilitar su gestión. El nombre técnico aparece debajo de cada descripción.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
