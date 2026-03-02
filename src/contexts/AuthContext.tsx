import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'OPERADOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  orgId: string | null;
}

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
  pendingAccess: boolean; // ✅ Nuevo: indica si el usuario está esperando asignación
  // ✅ Nuevo: Sistema de caché de permisos
  permissionsSet: Set<string> | null; // ✅ null = no cargado, Set = cargado
  permissionsLoading: boolean;
  canLocal: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAccess, setPendingAccess] = useState(false); // ✅ Nuevo
  
  // ✅ Nuevo: Cache de permisos en memoria (null = no cargado)
  const [permissionsSet, setPermissionsSet] = useState<Set<string> | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  // ✅ Log de estado cuando cambia
  useEffect(() => {
    console.log('[AuthContext] state', {
      userId: user?.id || null,
      email: user?.email || null,
      orgId: user?.orgId || null,
      role: user?.role || null,
      loading,
      pendingAccess, // ✅ Nuevo log
      permissionsLoading,
      permsCount: permissionsSet?.size || 0,
      permsIsNull: permissionsSet === null
    });
  }, [user, loading, pendingAccess, permissionsLoading, permissionsSet]);

  useEffect(() => {
    console.log('[AuthContext] init', { authLoading: loading });
    
    // Verificar sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthContext] getSession', { 
        hasSession: !!session, 
        userId: session?.user?.id || null,
        email: session?.user?.email || null
      });
      
      if (session?.user) {
        setSupabaseUser(session.user);
        loadUserProfile(session.user.id, session.user.email || '');
      } else {
        setLoading(false);
        setPermissionsLoading(false);
        setPendingAccess(false);
      }
    });

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[AuthContext] onAuthStateChange', { 
        event: _event,
        hasSession: !!session,
        userId: session?.user?.id || null 
      });
      
      if (session?.user) {
        setSupabaseUser(session.user);
        loadUserProfile(session.user.id, session.user.email || '');
      } else {
        setSupabaseUser(null);
        setUser(null);
        setPermissionsSet(null); // ✅ null = no cargado
        setPendingAccess(false);
        setLoading(false);
        setPermissionsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId: string, userEmail: string) => {
    try {
      console.log('[AuthContext] loadUserProfile start', { userId, userEmail });
      setPermissionsLoading(true);
      
      // 🔍 DIAGNÓSTICO: Probar RLS en user_org_roles
      console.log('[AuthContext] RLS probe - user_org_roles');
      const { data: uorProbe, error: uorProbeErr } = await supabase
        .from('user_org_roles')
        .select('*')
        .limit(5);
      
      console.log('[AuthContext] RLS probe result', {
        uorDataLen: uorProbe?.length || 0,
        uorErr: uorProbeErr ? {
          code: uorProbeErr.code,
          message: uorProbeErr.message,
          details: uorProbeErr.details,
          hint: uorProbeErr.hint
        } : null
      });
      
      // Obtener perfil y rol del usuario
      const { data: userOrgRole, error } = await supabase
        .from('user_org_roles')
        .select(`
          org_id,
          role_id,
          roles!user_org_roles_role_id_fkey (
            id,
            name
          )
        `)
        .eq('user_id', userId)
        .maybeSingle();

      console.log('[AuthContext] user_org_roles query', {
        hasData: !!userOrgRole,
        orgId: userOrgRole?.org_id || null,
        roleId: userOrgRole?.role_id || null,
        roleName: (userOrgRole?.roles as any)?.name || null,
        error: error ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        } : null
      });

      if (error) {
        console.error('[AuthContext] ERROR loading user profile:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        setLoading(false);
        setPermissionsLoading(false);
        setPendingAccess(false);
        return;
      }

      // ✅ Si el usuario no tiene rol asignado, marcar como pendingAccess
      if (!userOrgRole) {
        console.warn('[AuthContext] Usuario sin rol asignado. Debe ser asignado a una organización.');
        
        // Crear perfil básico sin rol
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', userId)
          .maybeSingle();

        console.log('[AuthContext] profile without role', {
          hasProfile: !!profile,
          name: profile?.name || null
        });

        setUser({
          id: userId,
          name: profile?.name || userEmail.split('@')[0] || 'Usuario',
          email: profile?.email || userEmail,
          role: 'OPERADOR', // Rol por defecto temporal
          orgId: null
        });
        
        setPermissionsSet(new Set()); // ✅ Set vacío = sin permisos
        setPendingAccess(true); // ✅ Marcar como pendiente SOLO cuando loading terminó
        setLoading(false);
        setPermissionsLoading(false);
        return;
      }

      if (userOrgRole && userOrgRole.roles) {
        const roleName = (userOrgRole.roles as any)?.name || 'OPERADOR';
        
        // Obtener perfil del usuario
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', userId)
          .maybeSingle();

        console.log('[AuthContext] setting user', {
          userId,
          roleName,
          orgId: userOrgRole.org_id,
          profileName: profile?.name || null
        });

        setUser({
          id: userId,
          name: profile?.name || userEmail.split('@')[0] || 'Usuario',
          email: profile?.email || userEmail,
          role: roleName as UserRole,
          orgId: userOrgRole.org_id
        });

        setPendingAccess(false); // ✅ Usuario tiene acceso completo
        
        // ✅ Cargar permisos del rol en paralelo
        await loadPermissions(userOrgRole.role_id, userOrgRole.org_id);
      }
    } catch (err) {
      console.error('[AuthContext] Exception loading user profile:', err);
      setPermissionsSet(new Set()); // ✅ Set vacío = sin permisos
      setPendingAccess(false);
    } finally {
      setLoading(false);
      setPermissionsLoading(false);
    }
  };

  // ✅ Nuevo: Cargar permisos una sola vez
  const loadPermissions = async (roleId: string, orgId: string) => {
    try {
      console.log('[AuthContext] loadPermissions start', { roleId, orgId });
      
      // 🔍 DIAGNÓSTICO: Probar RLS en role_permissions
      console.log('[AuthContext] RLS probe - role_permissions');
      const { data: rpProbe, error: rpProbeErr } = await supabase
        .from('role_permissions')
        .select('role_id, permission_id')
        .limit(5);
      
      console.log('[AuthContext] RLS probe result', {
        rpDataLen: rpProbe?.length || 0,
        rpErr: rpProbeErr ? {
          code: rpProbeErr.code,
          message: rpProbeErr.message,
          details: rpProbeErr.details,
          hint: rpProbeErr.hint
        } : null
      });
      
      // Obtener permisos del rol mediante JOIN
      const { data: rolePermissions, error } = await supabase
        .from('role_permissions')
        .select(`
          permissions!role_permissions_permission_id_fkey (
            name
          )
        `)
        .eq('role_id', roleId);

      console.log('[AuthContext] role_permissions query', {
        roleId,
        count: rolePermissions?.length || 0,
        error: error ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        } : null
      });

      if (error) {
        console.error('[AuthContext] ERROR al cargar permisos:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        setPermissionsSet(new Set()); // ✅ Set vacío = sin permisos
        return;
      }

      // Construir Set de permisos para lookup O(1)
      const permSet = new Set<string>();
      if (rolePermissions) {
        rolePermissions.forEach((rp: any) => {
          if (rp.permissions?.name) {
            permSet.add(rp.permissions.name);
          }
        });
      }

      const permArray = Array.from(permSet);
      console.log('[AuthContext] permissions loaded', {
        orgId,
        count: permSet.size,
        sampleFirst30: permArray.slice(0, 30),
        has_admin_users_create: permSet.has('admin.users.create'),
        has_admin_users_update: permSet.has('admin.users.update'),
        has_admin_users_delete: permSet.has('admin.users.delete'),
        has_admin_users_assign_roles: permSet.has('admin.users.assign_roles'),
        has_admin_matrix_view: permSet.has('admin.matrix.view'),
        has_admin_matrix_update: permSet.has('admin.matrix.update'),
        has_users_create: permSet.has('users.create'),
        has_users_update: permSet.has('users.update'),
        has_users_delete: permSet.has('users.delete')
      });

      setPermissionsSet(permSet);
    } catch (err) {
      console.error('[AuthContext] Exception al cargar permisos:', err);
      setPermissionsSet(new Set()); // ✅ Set vacío = sin permisos
    }
  };

  // ✅ Nuevo: Verificación local de permisos (sin RPC)
  const canLocal = (permission: string): boolean => {
    if (permissionsSet === null) {
      console.log('[AuthContext] canLocal - perms not loaded', { permission });
      return false; // ✅ No cargado = sin permisos
    }
    const result = permissionsSet.has(permission);
    console.log('[AuthContext] canLocal', { permission, result, totalPerms: permissionsSet.size });
    return result;
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      setPermissionsLoading(true);
      setPendingAccess(false);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        return false;
      }

      if (data.user) {
        setSupabaseUser(data.user);
        await loadUserProfile(data.user.id, data.user.email || '');
        return true;
      }

      return false;
    } catch (err) {
      console.error('Login error:', err);
      return false;
    } finally {
      setLoading(false);
      setPermissionsLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSupabaseUser(null);
    setPermissionsSet(null); // ✅ null = no cargado
    setPendingAccess(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      supabaseUser,
      login, 
      logout, 
      isAuthenticated: !!user,
      loading,
      pendingAccess, // ✅ Exponer estado
      // ✅ Exponer sistema de caché
      permissionsSet,
      permissionsLoading,
      canLocal
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
