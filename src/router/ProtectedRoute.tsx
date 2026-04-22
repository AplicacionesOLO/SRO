import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SessionExpiredModal from '@/components/feature/SessionExpiredModal';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute: Guard de autenticación global
 * 
 * Valida que exista sesión válida antes de renderizar rutas protegidas.
 * Si no hay sesión o está expirada, redirige automáticamente a /login.
 * 
 * Flujo:
 * 1. Mientras carga sesión (loading=true) → muestra loader
 * 2. Si no hay user después de cargar → redirect a /login
 * 3. Si hay user → renderiza children (puede tener RequirePermission adicional)
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Solo redirigir cuando terminó de cargar, no hay usuario Y la sesión no expiró
    // Si sessionExpired=true, mostramos el modal en lugar de redirigir silenciosamente
    if (!loading && !user && !sessionExpired) {
      const returnUrl = location.pathname + location.search;
      navigate('/login', { 
        replace: true,
        state: { returnUrl }
      });
    }
  }, [loading, user, sessionExpired, navigate, location]);

  // Mostrar loader mientras valida sesión
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
          <span className="text-sm text-gray-600">Verificando sesión...</span>
        </div>
      </div>
    );
  }

  // Sesión expirada mientras navegaba: mostrar modal encima del contenido actual
  // (o encima de un fondo vacío si ya no hay nada renderizado)
  if (sessionExpired) {
    return (
      <>
        {/* Renderizamos children en background para que el usuario vea dónde estaba */}
        {user ? <>{children}</> : <div className="min-h-screen bg-gray-50" />}
        <SessionExpiredModal />
      </>
    );
  }

  // Si no hay usuario después de cargar, no renderizar nada (el useEffect redirige)
  if (!user) {
    return null;
  }

  // Usuario válido: renderizar contenido protegido
  return <>{children}</>;
}