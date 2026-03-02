import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function AccessPending() {
  const { user, logout, loading, pendingAccess } = useAuth();
  const navigate = useNavigate();

  // ✅ Log de estado para diagnóstico
  useEffect(() => {
    console.log('[AccessPending] state', {
      loading,
      hasUser: !!user,
      userId: user?.id || null,
      orgId: user?.orgId || null,
      role: user?.role || null,
      pendingAccess
    });
  }, [loading, user, pendingAccess]);

  // ✅ Redirect a login si no hay usuario
  useEffect(() => {
    if (!loading && !user) {
      console.log('[AccessPending] No user, redirecting to /login');
      navigate('/login');
    }
  }, [loading, user, navigate]);

  // ✅ Redirect a dashboard si loading terminó y tiene orgId
  useEffect(() => {
    if (!loading && user && user.orgId) {
      console.log('[AccessPending] User has orgId, redirecting to /dashboard');
      navigate('/dashboard');
    }
  }, [loading, user, navigate]);

  // ✅ No renderizar mientras loading sea true
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  // ✅ Solo renderizar si loading terminó y no tiene orgId
  if (!user || user.orgId) {
    return null; // El useEffect se encarga del redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                <i className="ri-truck-line text-white text-xl"></i>
              </div>
              <h1 className="text-xl font-bold text-gray-900">DockFlow</h1>
            </div>
            <button
              onClick={logout}
              className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-logout-box-line text-lg"></i>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="ri-error-warning-line text-yellow-600 text-4xl"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Acceso Pendiente
          </h2>
          <p className="text-gray-600 mb-6">
            Tu cuenta ha sido creada exitosamente, pero aún no has sido asignado a una organización.
          </p>
          <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
            <h3 className="font-semibold text-gray-900 mb-3">¿Qué sigue?</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start space-x-2">
                <i className="ri-checkbox-circle-line text-teal-500 mt-0.5"></i>
                <span>Contacta a tu administrador para que te asigne a una organización</span>
              </li>
              <li className="flex items-start space-x-2">
                <i className="ri-checkbox-circle-line text-teal-500 mt-0.5"></i>
                <span>Una vez asignado, tendrás acceso al calendario y todas las funcionalidades</span>
              </li>
              <li className="flex items-start space-x-2">
                <i className="ri-checkbox-circle-line text-teal-500 mt-0.5"></i>
                <span>Recibirás permisos según tu rol (Operador, Supervisor o Admin)</span>
              </li>
            </ul>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-refresh-line mr-2"></i>
              Verificar acceso
            </button>
            <button
              onClick={logout}
              className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
