import { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { ConfirmModal } from '../base/ConfirmModal';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Inicio',
  '/dashboard': 'Dashboard',
  '/calendario': 'Calendario',
  '/reservas': 'Reservas',
  '/andenes': 'Andenes',
  '/manpower': 'Manpower',
  '/casetilla': 'Punto de Control',
  '/perfil': 'Mi Perfil',
  '/admin': 'Administración',
  '/admin/usuarios': 'Usuarios',
  '/admin/roles': 'Roles',
  '/admin/matriz-permisos': 'Matriz de Permisos',
  '/admin/catalogos': 'Catálogos',
  '/admin/almacenes': 'Almacenes',
  '/admin/clientes': 'Clientes',
  '/admin/correspondencia': 'Correspondencia',
  '/admin/mensajeria': 'Mensajería',
  '/conocimiento': 'Base de Conocimiento',
  '/chat/auditoria': 'Auditoría Chat',
  '/access-pending': 'Acceso Pendiente',
};

function resolvePageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const segments = pathname.split('/').filter(Boolean);
  const parent = '/' + segments.slice(0, 2).join('/');
  if (PAGE_TITLES[parent]) return PAGE_TITLES[parent];
  if (segments.length >= 1) {
    const root = '/' + segments[0];
    if (PAGE_TITLES[root]) return PAGE_TITLES[root];
  }
  return '';
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const pageTitle = useMemo(() => resolvePageTitle(location.pathname), [location.pathname]);

  const handleLogout = () => {
    try {
      logout();
      navigate('/login');
    } catch (error) {
      // silenced
    }
  };

  return (
    <nav className="sticky top-0 z-40 bg-[#0A0F1C] border-b border-white/[0.06]">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* Left: Page Title — CONTEXTO, sin retroceder */}
          <div className="flex items-center gap-2 min-w-0">
            {pageTitle && (
              <h1 className="text-[15px] font-semibold text-white/90 truncate">
                {pageTitle}
              </h1>
            )}
          </div>

          {/* Right: User + Logout */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Desktop user info */}
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[#111827] border border-white/[0.06]">
              <div className="relative w-7 h-7 flex-shrink-0">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover border border-white/[0.08]"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                    <span className="text-xs font-bold text-teal-300">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#111827]" />
              </div>
              <span className="text-[13px] font-medium text-white/80 max-w-[120px] truncate">
                {user?.name}
              </span>
            </div>

            {/* Mobile avatar */}
            <div className="sm:hidden relative w-7 h-7 flex-shrink-0">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover border border-white/[0.08]"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-xs font-bold text-teal-300">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Logout */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/8 rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer"
              title="Cerrar sesión"
            >
              <i className="ri-logout-box-r-line text-sm w-4 h-4 flex items-center justify-center" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </div>

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