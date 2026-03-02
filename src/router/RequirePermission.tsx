import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';

interface RequirePermissionProps {
  children: ReactNode;
  permission?: string;
  requireAnyAdmin?: boolean;
  fallbackPath?: string;
}

export default function RequirePermission({ 
  children, 
  permission,
  requireAnyAdmin = false,
  fallbackPath = '/'
}: RequirePermissionProps) {
  const { pendingAccess } = useAuth();
  const { can, loading, permissionsSet } = usePermissions();
  const location = useLocation();

  // Si el usuario está pendiente de acceso, redirigir a /access-pending
  // (excepto si ya está en /access-pending o /login)
  if (pendingAccess && location.pathname !== '/access-pending' && location.pathname !== '/login') {
    console.log('[RequirePermission] Redirecting to /access-pending', { 
      currentPath: location.pathname,
      pendingAccess 
    });
    return <Navigate to="/access-pending" replace />;
  }

  // Mostrar loader mientras se cargan los permisos
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
          <span className="text-sm text-gray-600">Verificando permisos...</span>
        </div>
      </div>
    );
  }

  // Si requiere cualquier permiso admin.*
  if (requireAnyAdmin) {
    const hasAnyAdminPerm = permissionsSet 
      ? Array.from(permissionsSet).some(p => p.startsWith('admin.'))
      : false;

    console.log('[RequirePermission] Checking any admin permission', {
      path: location.pathname,
      hasAnyAdminPerm,
      totalPerms: permissionsSet?.size || 0
    });

    if (!hasAnyAdminPerm) {
      console.log('[RequirePermission] No admin permissions, redirecting to', fallbackPath);
      return <Navigate to={fallbackPath} replace />;
    }

    return <>{children}</>;
  }

  // Si requiere un permiso específico
  if (permission) {
    const hasPermission = can(permission);

    console.log('[RequirePermission] Checking specific permission', {
      path: location.pathname,
      permission,
      hasPermission
    });

    if (!hasPermission) {
      console.log('[RequirePermission] Permission denied, redirecting to', fallbackPath);
      return <Navigate to={fallbackPath} replace />;
    }
  }

  return <>{children}</>;
}
