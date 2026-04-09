import { useAuth } from '../contexts/AuthContext';

export function usePermissions() {
  const { user, permissionsSet, permissionsLoading, canLocal, loading: authLoading } = useAuth();

  const orgId = user?.orgId ?? null;

  // ✅ FIX: Si terminó de cargar auth Y no hay usuario → no está autenticado
  // Evita loading infinito cuando la sesión expiró
  const isLoadingPermissions = authLoading || permissionsLoading;

  // console.log('[usePermissions] hook called', {
  //   userId: user?.id || null,
  //   userOrgId: user?.orgId || null,
  //   resolvedOrgId: orgId,
  //   authLoading,
  //   permissionsLoading,
  //   isLoadingPermissions,
  //   permsCount: permissionsSet?.size || 0
  // });

  const hasRole = (role: string): boolean => {
    return user?.role === role;
  };

  return {
    orgId,
    userId: user?.id || null,
    can: canLocal,
    hasRole,
    loading: isLoadingPermissions,
    permissionsSet
  };
}