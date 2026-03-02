import { useAuth } from '../contexts/AuthContext';

export function usePermissions() {
  const { user, permissionsSet, permissionsLoading, canLocal } = useAuth();

  const orgId = user?.orgId ?? null;

  console.log('[usePermissions] hook called', {
    userId: user?.id || null,
    userOrgId: user?.orgId || null,
    resolvedOrgId: orgId,
    permissionsLoading,
    permsCount: permissionsSet?.size || 0
  });

  return {
    orgId,
    userId: user?.id || null,
    can: canLocal,
    loading: permissionsLoading,
    permissionsSet
  };
}
