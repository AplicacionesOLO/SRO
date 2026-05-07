import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * HomeRedirect: Redirige a la ruta inicial según el rol del usuario
 * - CASETILLA → /casetilla
 * - ADMIN, SUPERVISOR, OPERADOR, otros → /calendario
 */
export default function HomeRedirect() {
  const { user } = useAuth();

  if (user?.role === 'CASETILLA') {
    return <Navigate to="/casetilla" replace />;
  }

  return <Navigate to="/calendario" replace />;
}