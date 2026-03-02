import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../base/ConfirmModal';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    try {
      logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleLogoClick = () => {
    navigate('/');
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/')}
              className="flex items-center ml-2 lg:ml-0 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <img
                src="https://static.readdy.ai/image/96746b7ba583c55b81aa58d37fd022fd/894bf9da2b8030a7b0ba3c4dadd1585d.png"
                alt="SRO Logo"
                className="h-12 w-auto object-contain"
              />
            </button>
          </div>

          {/* User info y logout */}
          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-gray-900">
                {user?.name}
              </div>
              <div className="text-xs text-gray-500 capitalize">
                {user?.role}
              </div>
            </div>
            
            {/* Avatar en móvil */}
            <div className="sm:hidden w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
              <span className="text-sm font-medium text-teal-600">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>

            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <i className="ri-logout-box-line text-lg w-5 h-5 flex items-center justify-center"></i>
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmación para cerrar sesión */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        type="warning"
        title="¿Cerrar sesión?"
        message="¿Estás seguro de que deseas salir de la aplicación? Tendrás que volver a iniciar sesión para acceder."
        confirmText="Sí, cerrar sesión"
        cancelText="Cancelar"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
        showCancel={true}
      />
    </nav>
  );
}
