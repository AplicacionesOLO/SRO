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
  pendingAccess: boolean;
  permissionsSet: Set<string> | null;
  permissionsLoading: boolean;
  canLocal: (permission: string) => boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAccess, setPendingAccess] = useState(false);
  
  const [permissionsSet, setPermissionsSet] = useState<Set<string> | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  // Tracks whether the user was authenticated at some point in this session
  const [wasAuthenticated, setWasAuthenticated] = useState(false);

  // useEffect(() => {
  //   console.log('[AuthContext] state', {
  //     userId: user?.id || null,
  //     email: user?.email || null,
  //     orgId: user?.orgId || null,
  //     role: user?.role || null,
  //     loading,
  //     pendingAccess,
  //     permissionsLoading,
  //     permsCount: permissionsSet?.size || 0,
  //     permsIsNull: permissionsSet === null
  //   });
  // }, [user, loading, pendingAccess, permissionsLoading, permissionsSet]);

  const clearCorruptedSession = async (expired = false) => {
    // Clear all Supabase keys from localStorage
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key);
      }
    });
    // Use scope: 'local' so it doesn't try to hit the server with the bad token
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore — token is already invalid
    }
    setUser(null);
    setSupabaseUser(null);
    setPermissionsSet(null);
    setPendingAccess(false);
    setLoading(false);
    setPermissionsLoading(false);
    // Only show the "session expired" modal if the user was already authenticated
    if (expired) {
      setSessionExpired(true);
    }
  };

  const clearSessionExpired = () => setSessionExpired(false);

  useEffect(() => {
    // console.log('[AuthContext] init', { authLoading: loading });
    
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        const msg = error.message || '';
        if (
          msg.includes('Refresh Token Not Found') ||
          msg.includes('Invalid Refresh Token') ||
          msg.includes('refresh_token_not_found') ||
          (error as any).code === 'refresh_token_not_found'
        ) {
          clearCorruptedSession();
          return;
        }
      }

      // console.log('[AuthContext] getSession', { 
      //   hasSession: !!session, 
      //   userId: session?.user?.id || null,
      //   email: session?.user?.email || null
      // });
      
      if (session?.user) {
        setSupabaseUser(session.user);
        loadUserProfile(session.user.id, session.user.email || '');
      } else {
        setLoading(false);
        setPermissionsLoading(false);
        setPendingAccess(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session, error?: unknown) => {
      // Handle token refresh errors emitted as auth state changes
      if (_event === 'TOKEN_REFRESHED' && !session) {
        // If user was authenticated, show expired modal instead of silent redirect
        setWasAuthenticated((prev) => {
          clearCorruptedSession(prev);
          return false;
        });
        return;
      }

      if (_event === 'SIGNED_OUT' && !session) {
        // Could be triggered by a failed refresh — clear everything
        setUser(null);
        setSupabaseUser(null);
        setPermissionsSet(null);
        setPendingAccess(false);
        setLoading(false);
        setPermissionsLoading(false);
        return;
      }
      
      if (session?.user) {
        setSupabaseUser(session.user);
        setWasAuthenticated(true);
        loadUserProfile(session.user.id, session.user.email || '');
      } else {
        setSupabaseUser(null);
        setUser(null);
        setPermissionsSet(null);
        setPendingAccess(false);
        setLoading(false);
        setPermissionsLoading(false);
      }
    });

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event?.reason?.message || '';
      const code = event?.reason?.code || '';
      if (
        msg.includes('Refresh Token Not Found') ||
        msg.includes('Invalid Refresh Token') ||
        msg.includes('refresh_token_not_found') ||
        code === 'refresh_token_not_found'
      ) {
        event.preventDefault();
        setWasAuthenticated((prev) => {
          clearCorruptedSession(prev);
          return false;
        });
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const loadUserProfile = async (userId: string, userEmail: string) => {
    try {
      // console.log('[AuthContext] loadUserProfile start', { userId, userEmail });
      setPermissionsLoading(true);
      
      // console.log('[AuthContext] RLS probe - user_org_roles');
      const { data: uorProbe, error: uorProbeErr } = await supabase
        .from('user_org_roles')
        .select('*')
        .limit(5);
      
      // console.log('[AuthContext] RLS probe result', {
      //   uorDataLen: uorProbe?.length || 0,
      //   uorErr: uorProbeErr ? {
      //     code: uorProbeErr.code,
      //     message: uorProbeErr.message,
      //     details: uorProbeErr.details,
      //     hint: uorProbeErr.hint
      //   } : null
      // });
      
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

      // console.log('[AuthContext] user_org_roles query', {
      //   hasData: !!userOrgRole,
      //   orgId: userOrgRole?.org_id || null,
      //   roleId: userOrgRole?.role_id || null,
      //   roleName: (userOrgRole?.roles as any)?.name || null,
      //   error: error ? {
      //     code: error.code,
      //     message: error.message,
      //     details: error.details,
      //     hint: error.hint
      //   } : null
      // });

      if (error) {
        setLoading(false);
        setPermissionsLoading(false);
        setPendingAccess(false);
        return;
      }

      if (!userOrgRole) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', userId)
          .maybeSingle();

        setUser({
          id: userId,
          name: profile?.name || userEmail.split('@')[0] || 'Usuario',
          email: profile?.email || userEmail,
          role: 'OPERADOR',
          orgId: null
        });
        
        setPermissionsSet(new Set());
        setPendingAccess(true);
        setLoading(false);
        setPermissionsLoading(false);
        return;
      }

      if (userOrgRole && userOrgRole.roles) {
        const roleName = (userOrgRole.roles as any)?.name || 'OPERADOR';
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', userId)
          .maybeSingle();

        setUser({
          id: userId,
          name: profile?.name || userEmail.split('@')[0] || 'Usuario',
          email: profile?.email || userEmail,
          role: roleName as UserRole,
          orgId: userOrgRole.org_id
        });

        setPendingAccess(false);
        
        await loadPermissions(userOrgRole.role_id, userOrgRole.org_id);
      }
    } catch (err) {
      setPermissionsSet(new Set());
      setPendingAccess(false);
    } finally {
      setLoading(false);
      setPermissionsLoading(false);
    }
  };

  const loadPermissions = async (roleId: string, orgId: string) => {
    try {
      // console.log('[AuthContext] loadPermissions start', { roleId, orgId });
      
      // console.log('[AuthContext] RLS probe - role_permissions');
      const { data: rpProbe, error: rpProbeErr } = await supabase
        .from('role_permissions')
        .select('role_id, permission_id')
        .limit(5);
      
      // console.log('[AuthContext] RLS probe result', {
      //   rpDataLen: rpProbe?.length || 0,
      //   rpErr: rpProbeErr ? {
      //     code: rpProbeErr.code,
      //     message: rpProbeErr.message,
      //     details: rpProbeErr.details,
      //     hint: rpProbeErr.hint
      //   } : null
      // });
      
      const { data: rolePermissions, error } = await supabase
        .from('role_permissions')
        .select(`
          permissions!role_permissions_permission_id_fkey (
            name
          )
        `)
        .eq('role_id', roleId);

      // console.log('[AuthContext] role_permissions query', {
      //   roleId,
      //   count: rolePermissions?.length || 0,
      //   error: error ? {
      //     code: error.code,
      //     message: error.message,
      //     details: error.details,
      //     hint: error.hint
      //   } : null
      // });

      if (error) {
        setPermissionsSet(new Set());
        return;
      }

      const permSet = new Set<string>();
      if (rolePermissions) {
        rolePermissions.forEach((rp: any) => {
          if (rp.permissions?.name) {
            permSet.add(rp.permissions.name);
          }
        });
      }

      // const permArray = Array.from(permSet);
      // console.log('[AuthContext] permissions loaded', {
      //   orgId,
      //   count: permSet.size,
      //   sampleFirst30: permArray.slice(0, 30),
      //   has_admin_users_create: permSet.has('admin.users.create'),
      //   has_admin_users_update: permSet.has('admin.users.update'),
      //   has_admin_users_delete: permSet.has('admin.users.delete'),
      //   has_admin_users_assign_roles: permSet.has('admin.users.assign_roles'),
      //   has_admin_matrix_view: permSet.has('admin.matrix.view'),
      //   has_admin_matrix_update: permSet.has('admin.matrix.update'),
      //   has_users_create: permSet.has('users.create'),
      //   has_users_update: permSet.has('users.update'),
      //   has_users_delete: permSet.has('users.delete')
      // });

      setPermissionsSet(permSet);
    } catch (err) {
      setPermissionsSet(new Set());
    }
  };

  const canLocal = (permission: string): boolean => {
    if (permissionsSet === null) {
      // console.log('[AuthContext] canLocal - perms not loaded', { permission });
      return false;
    }
    const result = permissionsSet.has(permission);
    // console.log('[AuthContext] canLocal', { permission, result, totalPerms: permissionsSet.size });
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
        return false;
      }

      if (data.user) {
        setSupabaseUser(data.user);
        setWasAuthenticated(true);
        setSessionExpired(false);
        await loadUserProfile(data.user.id, data.user.email || '');
        return true;
      }

      return false;
    } catch (err) {
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
    setPermissionsSet(null);
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
      pendingAccess,
      permissionsSet,
      permissionsLoading,
      canLocal,
      sessionExpired,
      clearSessionExpired
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