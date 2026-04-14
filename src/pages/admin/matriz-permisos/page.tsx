import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePermissions } from '../../../hooks/usePermissions';
import { useAuth } from '../../../contexts/AuthContext';
import { useActiveWarehouse } from '../../../contexts/ActiveWarehouseContext';

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
    // ─── Admin › Clientes ───────────────────────────────────────────
    'admin.clients.view':                    'Ver módulo Clientes',
    'admin.clients.create':                  'Crear clientes',
    'admin.clients.update':                  'Editar clientes',
    'admin.clients.delete':                  'Eliminar clientes',
    'admin.clients.assign_docks':            'Asignar andenes a clientes',
    'admin.clients.providers.view':          'Ver proveedores asignados a un cliente',
    'admin.clients.providers.manage':        'Gestionar proveedores por cliente',
    'admin.clients.rules.update':            'Editar reglas de cutoff por cliente',

    // ─── Admin › Matriz de Permisos ─────────────────────────────────
    'admin.matrix.view':                     'Ver matriz de permisos',
    'admin.matrix.update':                   'Editar matriz de permisos',

    // ─── Admin › Permisos ────────────────────────────────────────────
    'admin.permissions.view':                'Ver permisos del sistema',
    'admin.permissions.create':              'Crear permisos del sistema',
    'admin.permissions.update':              'Editar permisos del sistema',
    'admin.permissions.delete':              'Eliminar permisos del sistema',
    'admin.permissions.manage':              'Gestionar permisos del sistema',

    // ─── Admin › Roles ───────────────────────────────────────────────
    'admin.roles.view':                      'Ver roles',
    'admin.roles.create':                    'Crear roles',
    'admin.roles.update':                    'Editar roles',
    'admin.roles.delete':                    'Eliminar roles',
    'admin.roles.manage':                    'Gestionar roles',

    // ─── Admin › Usuarios ────────────────────────────────────────────
    'admin.users.view':                      'Ver usuarios del sistema',
    'admin.users.create':                    'Crear usuarios',
    'admin.users.update':                    'Editar datos de usuarios',
    'admin.users.delete':                    'Eliminar usuarios',
    'admin.users.assign_roles':              'Asignar roles a usuarios',
    'admin.users.update_role':               'Cambiar rol y datos de un usuario',

    // ─── Calendario ──────────────────────────────────────────────────
    'calendar.view':                         'Ver calendario de reservas',
    'calendar.manage':                       'Gestionar calendario',
    'calendar.block':                        'Bloquear horarios en el calendario',

    // ─── Tipos de Carga ──────────────────────────────────────────────
    'cargo_types.view':                      'Ver tipos de carga',
    'cargo_types.create':                    'Crear tipos de carga',
    'cargo_types.update':                    'Editar tipos de carga',
    'cargo_types.delete':                    'Eliminar tipos de carga',

    // ─── Casetilla (Punto Control IN/OUT) ────────────────────────────
    'casetilla.view':                        'Ver registro de entradas y salidas (IN/OUT)',
    'casetilla.create':                      'Registrar entrada o salida (IN/OUT)',
    'casetilla.manage':                      'Gestionar registros de IN/OUT',

    // ─── Correspondencia ─────────────────────────────────────────────
    'correspondence.view':                   'Ver reglas de correspondencia',
    'correspondence.create':                 'Crear reglas de correspondencia',
    'correspondence.update':                 'Editar reglas de correspondencia',
    'correspondence.delete':                 'Eliminar reglas de correspondencia',
    'correspondence.gmail_account.view':     'Ver cuenta Gmail conectada',
    'correspondence.rules.view':             'Ver pestaña Reglas de Correspondencia',
    'correspondence.logs.view':              'Ver bitácora de correos enviados',

    // ─── Bloqueos de Andenes ─────────────────────────────────────────
    'dock_blocks.view':                      'Ver bloqueos de tiempo en andenes',
    'dock_blocks.create':                    'Crear bloqueos en andenes',
    'dock_blocks.update':                    'Editar bloqueos en andenes',
    'dock_blocks.delete':                    'Eliminar bloqueos en andenes',

    // ─── Categorías de Andenes ───────────────────────────────────────
    'dock_categories.view':                  'Ver categorías de andenes',
    'dock_categories.create':               'Crear categorías de andenes',
    'dock_categories.update':               'Editar categorías de andenes',
    'dock_categories.delete':               'Eliminar categorías de andenes',

    // ─── Estados de Andenes ──────────────────────────────────────────
    'dock_statuses.view':                    'Ver estados operativos de andenes',
    'dock_statuses.create':                  'Crear estados operativos de andenes',
    'dock_statuses.update':                  'Editar estados operativos de andenes',
    'dock_statuses.delete':                  'Eliminar estados operativos de andenes',

    // ─── Andenes ─────────────────────────────────────────────────────
    'docks.view':                            'Ver andenes',
    'docks.create':                          'Crear andenes',
    'docks.update':                          'Editar andenes',
    'docks.delete':                          'Eliminar andenes',

    // ─── Manpower (Colaboradores) ─────────────────────────────────────
    'manpower.view':                         'Ver lista de colaboradores',
    'manpower.manage':                       'Gestionar colaboradores (Manpower)',

    // ─── Menú › Navegación principal ─────────────────────────────────
    'menu.dashboard.view':                   'Acceder al menú Dashboard',
    'menu.calendario.view':                  'Acceder al menú Calendario',
    'menu.reservas.view':                    'Acceder al menú Reservas',
    'menu.andenes.view':                     'Acceder al menú Andenes',
    'menu.manpower.view':                    'Acceder al menú Manpower',
    'menu.casetilla.view':                   'Acceder al menú Punto Control IN/OUT',

    // ─── Menú › Submenú Administración ───────────────────────────────
    'menu.admin.view':                       'Acceder al menú Administración',
    'menu.admin.usuarios.view':              'Acceder al menú Usuarios (Admin)',
    'menu.admin.roles.view':                 'Acceder al menú Roles (Admin)',
    'menu.admin.matriz_permisos.view':       'Acceder al menú Matriz de Permisos (Admin)',
    'menu.admin.catalogos.view':             'Acceder al menú Catálogos (Admin)',
    'menu.admin.almacenes.view':             'Acceder al menú Almacenes (Admin)',
    'menu.admin.correspondencia.view':       'Acceder al menú Correspondencia (Admin)',
    'menu.admin.clientes.view':              'Acceder al menú Clientes (Admin)',

    // ─── Estados Operativos ──────────────────────────────────────────
    'operational_statuses.view':             'Ver estados operativos',
    'operational_statuses.create':           'Crear estados operativos',
    'operational_statuses.update':           'Editar estados operativos',
    'operational_statuses.delete':           'Eliminar estados operativos',

    // ─── Proveedores ──────────────────────────────────────────────────
    'providers.view':                        'Ver proveedores',
    'providers.create':                      'Crear proveedores',
    'providers.update':                      'Editar proveedores',
    'providers.delete':                      'Eliminar proveedores',

    // ─── Archivos de Reservas ─────────────────────────────────────────
    'reservation_files.view':                'Ver archivos adjuntos de reservas',
    'reservation_files.upload':              'Subir archivos a reservas',
    'reservation_files.delete':              'Eliminar archivos de reservas',

    // ─── Estados de Reserva ───────────────────────────────────────────
    'reservation_statuses.view':             'Ver estados de reserva',
    'reservation_statuses.create':           'Crear estados de reserva',
    'reservation_statuses.update':           'Editar estados de reserva',
    'reservation_statuses.delete':           'Eliminar estados de reserva',

    // ─── Reservas ─────────────────────────────────────────────────────
    'reservations.view':                     'Ver reservas',
    'reservations.create':                   'Crear reservas',
    'reservations.update':                   'Editar reservas',
    'reservations.delete':                   'Eliminar reservas',
    'reservations.cancel':                   'Cancelar reservas',
    'reservations.move':                     'Mover reservas (arrastrar en calendario)',
    'reservations.approve':                  'Aprobar reservas',
    'reservations.reject':                   'Rechazar reservas',
    'reservations.limit_status_view':        'Restringir vista de estados (solo Pendiente y Cancelado)',

    // ─── Perfiles de Tiempo ───────────────────────────────────────────
    'time_profiles.view':                    'Ver perfiles de tiempo (Proveedor × Tipo de carga)',
    'time_profiles.create':                  'Crear perfiles de tiempo',
    'time_profiles.update':                  'Editar perfiles de tiempo',
    'time_profiles.delete':                  'Eliminar perfiles de tiempo',

    // ─── Almacenes ────────────────────────────────────────────────────
    'warehouses.view':                       'Ver almacenes',
    'warehouses.create':                     'Crear almacenes',
    'warehouses.update':                     'Editar almacenes',
    'warehouses.delete':                     'Eliminar almacenes',

    // ─── Chat / Asistente SRO ─────────────────────────────────────────
    'chat.view':                             'Ver módulo de chat con asistente',
    'chat.ask':                              'Hacer preguntas al asistente SRO',
    'chat.answers.basic':                    'Recibir respuestas básicas del asistente',
    'chat.answers.extended':                 'Recibir respuestas extendidas del asistente',
    'chat.answers.internal':                 'Recibir respuestas con información interna',
    'chat.audit.view':                       'Ver auditoría de conversaciones del chat',
    'chat.documents.view':                   'Ver documentos de conocimiento del chat',
    'chat.documents.manage':                 'Gestionar documentos de conocimiento del chat',

    // ─── Dashboard / Reportes ────────────────────────────────────────
    'dashboard.view':                        'Ver panel de control',
    'dashboard.analytics':                   'Ver analíticas del dashboard',
    'reports.view':                          'Ver reportes',
    'reports.export':                        'Exportar reportes',
  };

  // Si existe traducción exacta, usarla
  if (translations[technicalName]) {
    return translations[technicalName];
  }

  // Fallback inteligente: descomponer el slug en partes
  const parts = technicalName.split('.');
  if (parts.length >= 2) {
    const action = parts[parts.length - 1];

    const actionLabels: Record<string, string> = {
      view:    'Ver',
      create:  'Crear',
      update:  'Editar',
      delete:  'Eliminar',
      manage:  'Gestionar',
      approve: 'Aprobar',
      reject:  'Rechazar',
      export:  'Exportar',
      cancel:  'Cancelar',
      move:    'Mover',
      upload:  'Subir',
      assign:  'Asignar',
    };

    // Reconstruir el objeto a partir de las partes intermedias del slug
    const moduleSlug = parts.slice(0, -1).join('.');
    const moduleLabels: Record<string, string> = {
      'admin':                     'Administración',
      'admin.users':               'usuarios',
      'admin.roles':               'roles',
      'admin.permissions':         'permisos',
      'admin.matrix':              'matriz de permisos',
      'admin.clients':             'clientes',
      'admin.clients.providers':   'proveedores del cliente',
      'admin.clients.rules':       'reglas del cliente',
      'warehouses':                'almacenes',
      'docks':                     'andenes',
      'dock_blocks':               'bloqueos de andenes',
      'dock_categories':           'categorías de andenes',
      'dock_statuses':             'estados de andenes',
      'reservations':              'reservas',
      'reservation_statuses':      'estados de reserva',
      'reservation_files':         'archivos de reservas',
      'calendar':                  'calendario',
      'providers':                 'proveedores',
      'cargo_types':               'tipos de carga',
      'time_profiles':             'perfiles de tiempo',
      'casetilla':                 'punto control IN/OUT',
      'manpower':                  'colaboradores',
      'operational_statuses':      'estados operativos',
      'correspondence':            'correspondencia',
      'menu':                      'acceso al menú',
      'dashboard':                 'panel de control',
      'reports':                   'reportes',
      'chat':                      'chat asistente',
    };

    const actionLabel = actionLabels[action] || action;
    const moduleLabel = moduleLabels[moduleSlug] || moduleSlug.replace(/_/g, ' ');

    return `${actionLabel} ${moduleLabel}`;
  }

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
  const { activeWarehouse } = useActiveWarehouse();

  // ✅ Estado de categorías colapsadas (visual only, no afecta permisos)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roleName, setRoleName] = useState<string | null>(null);
  const [roleCheckLoading, setRoleCheckLoading] = useState(true);

  const [canViewMatrix, setCanViewMatrix] = useState(false);
  const [canUpdateMatrix, setCanUpdateMatrix] = useState(false);
  const [permCheckLoading, setPermCheckLoading] = useState(true);

  // ✅ Validación directa por rol (ADMIN o Full Access tienen acceso total)
  const hasDirectAccess = user?.role === 'ADMIN' || user?.role === 'Full Access';

  useEffect(() => {
    // console.log('[MatrizPermisos] usePermissions return', {
    //   orgId,
    //   permissionsLoading,
    //   userId: user?.id,
    //   userRole: user?.role,
    //   hasDirectAccess
    // });
  }, [orgId, permissionsLoading, user?.id, user?.role, hasDirectAccess]);

  useEffect(() => {
    if (!permissionsLoading && orgId && user?.id) {
      // console.log('[AdminMatrix] mounted', {
      //   orgId,
      //   userId: user.id,
      //   userRole: user.role,
      //   hasDirectAccess
      // });
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
        // console.log('[MatrizPermisos] Direct access granted via role:', user?.role);
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

      // console.log('[MatrizPermisos] uor lookup', {
      //   hasRow: !!uorRes.data,
      //   role_id: uorRes.data?.role_id ?? null,
      //   error: uorRes.error ?? null
      // });

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

      // console.log('[MatrizPermisos] role name lookup', {
      //   roleName: roleRes.data?.name ?? null,
      //   error: roleRes.error ?? null
      // });

      if (roleRes.error) throw roleRes.error;

      const fetchedRoleName = roleRes.data?.name ?? null;
      setRoleName(fetchedRoleName);

      // ✅ Si el rol obtenido es Full Access, otorgar acceso completo
      if (fetchedRoleName === 'Full Access' || fetchedRoleName === 'ADMIN') {
        // console.log('[MatrizPermisos] Full access via fetched role:', fetchedRoleName);
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

      // console.log('[MatrizPermisos] rpc perms', {
      //   canView: viewRes.data,
      //   canUpdate: updateRes.data,
      //   viewError: viewRes.error ?? null,
      //   updateError: updateRes.error ?? null
      // });

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
    } catch (error: any) {
      console.error('Error al verificar permisos');
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
    } catch (error: any) {
      console.error('Error al cargar datos');
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
    } catch (error: any) {
      console.error('Error al actualizar permiso');
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
          {activeWarehouse && (
            <div className="flex items-center gap-1.5 mt-2">
              <i className="ri-store-2-line text-teal-600 text-xs w-4 h-4 flex items-center justify-center"></i>
              <span className="text-xs text-teal-700 font-medium">Almacén activo: {activeWarehouse.name}</span>
              <span className="text-xs text-gray-400">(los permisos aplican a toda la organización)</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          {/* Contenedor con scroll bidireccional y altura máxima para sticky header */}
          <div className="overflow-auto max-h-[calc(100vh-260px)]">
            <table className="w-full border-collapse">
              <colgroup>
                <col style={{ width: '400px' }} />
                {safeRoles.map((role) => (
                  <col key={role.id} style={{ width: '160px' }} />
                ))}
              </colgroup>

              {/* ✅ STICKY HEADER: top-0 + z-30 para que flote sobre filas y sobre la 1ª col sticky */}
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300 sticky top-0 z-30">
                <tr>
                  {/* ✅ Esquina superior-izquierda: sticky en AMBOS ejes — z-40 para estar sobre todo */}
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider sticky left-0 top-0 bg-gray-50 z-40 border-r border-gray-200" style={{ backgroundImage: 'linear-gradient(to right, #f9fafb, #f3f4f6)' }}>
                    Permiso
                  </th>
                  {safeRoles.map((role) => (
                    <th
                      key={role.id}
                      className="px-6 py-4 text-center text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 last:border-r-0 bg-gradient-to-r from-gray-50 to-gray-100"
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
                {Object.entries(groupedPermissions).map(([category, perms]) => {
                  const isCollapsed = collapsedCategories.has(category);
                  return (
                    <>
                      {/* ✅ CATEGORÍA COLAPSABLE: sticky left-0 en la celda de categoría para scroll horizontal */}
                      <tr key={`cat-${category}`} className="bg-gradient-to-r from-teal-50 to-teal-100/50 border-t-2 border-teal-200">
                        <td
                          colSpan={safeRoles.length + 1}
                          className="px-6 py-4 text-sm font-bold text-teal-900 uppercase tracking-wide"
                        >
                          {/* ✅ Botón de colapso — solo affordance mínimo, sin cambiar estética */}
                          <button
                            type="button"
                            onClick={() => toggleCategory(category)}
                            className="flex items-center gap-2 w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <i className="ri-folder-line text-lg"></i>
                            <span>{getCategoryLabel(category)}</span>
                            <i
                              className={`ri-arrow-down-s-line text-base ml-1 transition-transform duration-200 ${
                                isCollapsed ? '-rotate-90' : 'rotate-0'
                              }`}
                            ></i>
                            <span className="text-xs font-normal text-teal-600 ml-1 normal-case">
                              ({perms.length} {perms.length === 1 ? 'permiso' : 'permisos'})
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* ✅ Filas de permisos — ocultas visualmente cuando la categoría está colapsada */}
                      {!isCollapsed && perms.map((permission, idx) => (
                        <tr
                          key={permission.id}
                          className={`hover:bg-teal-50/30 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                          }`}
                        >
                          {/* ✅ STICKY 1ª COLUMNA: fondo explícito para cubrir contenido que pase por debajo */}
                          <td
                            className={`px-6 py-4 text-sm font-medium text-gray-900 sticky left-0 z-10 border-r border-gray-200 ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                            }`}
                          >
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
                  );
                })}
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
