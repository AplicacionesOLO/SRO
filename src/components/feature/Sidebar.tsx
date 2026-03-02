import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';

interface MenuItem {
  path: string;
  label: string;
  icon: string;
  permission?: string;
  children?: MenuItem[];
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { orgId, can, loading: permsLoading } = usePermissions();
  
  const [orgName, setOrgName] = useState<string | null>(null);
  
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem(`sidebar-expanded-${user?.id}`);
    return saved ? JSON.parse(saved) : true;
  });
  
  const [expandedSubmenus, setExpandedSubmenus] = useState<Record<string, boolean>>({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) {
      supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            setOrgName('Sin organización');
          } else {
            setOrgName(data?.name || 'Sin organización');
          }
        });
    } else {
      setOrgName('Sin organización');
    }
  }, [orgId]);

  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`sidebar-expanded-${user.id}`, JSON.stringify(isExpanded));
    }
  }, [isExpanded, user?.id]);

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setActiveSubmenu(null);
  }, [location.pathname]);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const toggleSubmenu = (label: string) => {
    setExpandedSubmenus(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const menuItems: MenuItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'ri-dashboard-line', permission: 'menu.dashboard.view' },
    { label: 'Calendario', path: '/calendario', icon: 'ri-calendar-line', permission: 'menu.calendario.view' },
    { label: 'Reservas', path: '/reservas', icon: 'ri-file-list-line', permission: 'menu.reservas.view' },
    { label: 'Andenes', path: '/andenes', icon: 'ri-truck-line', permission: 'menu.andenes.view' },
    { label: 'Manpower', path: '/manpower', icon: 'ri-team-line', permission: 'menu.manpower.view' },
    { label: 'Punto Control IN/OUT', path: '/casetilla', icon: 'ri-door-open-line', permission: 'menu.casetilla.view' },
    {
      label: 'Administración',
      path: '/admin',
      icon: 'ri-settings-3-line',
      permission: 'menu.admin.view',
      children: [
        { label: 'Usuarios', path: '/admin/usuarios', icon: 'ri-user-line', permission: 'menu.admin.usuarios.view' },
        { label: 'Roles', path: '/admin/roles', icon: 'ri-shield-user-line', permission: 'menu.admin.roles.view' },
        { label: 'Matriz de Permisos', path: '/admin/matriz-permisos', icon: 'ri-key-line', permission: 'menu.admin.matriz_permisos.view' },
        { label: 'Catálogos', path: '/admin/catalogos', icon: 'ri-database-2-line', permission: 'menu.admin.catalogos.view' },
        { label: 'Almacenes', path: '/admin/almacenes', icon: 'ri-building-2-line', permission: 'menu.admin.almacenes.view' },
        { label: 'Clientes', path: '/admin/clientes', icon: 'ri-user-star-line', permission: 'menu.admin.clientes.view' },
        { label: 'Correspondencia', path: '/admin/correspondencia', icon: 'ri-mail-line', permission: 'menu.admin.correspondencia.view' },
      ],
    },
  ];

  // Items principales para la barra móvil (máximo 5)
  const mobileMainItems: MenuItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'ri-dashboard-line', permission: 'menu.dashboard.view' },
    { label: 'Calendario', path: '/calendario', icon: 'ri-calendar-line', permission: 'menu.calendario.view' },
    { label: 'Reservas', path: '/reservas', icon: 'ri-file-list-line', permission: 'menu.reservas.view' },
    { label: 'Andenes', path: '/andenes', icon: 'ri-truck-line', permission: 'menu.andenes.view' },
  ];

  // ✅ CONTROL ESTRICTO: Si no tiene permiso, NO renderizar
  const hasPermission = (permission?: string): boolean => {
    if (!permission) return true;
    // ✅ Durante carga, permitir render para evitar menú vacío
    if (permsLoading) return true;
    // ✅ Sin orgId, no hay permisos
    if (!orgId) return false;
    // ✅ Verificar permiso real
    return can(permission);
  };

  // ✅ Filtrar items del menú según permisos
  const filterMenuItems = (items: MenuItem[]): MenuItem[] => {
    return items
      .map(item => {
        // Si tiene hijos, filtrar los hijos primero
        if (item.children) {
          const visibleChildren = item.children.filter(child => hasPermission(child.permission));
          
          // Si no hay hijos visibles, no mostrar el padre
          if (visibleChildren.length === 0) {
            return null;
          }
          
          // Verificar permiso del padre también
          if (!hasPermission(item.permission)) {
            return null;
          }
          
          return {
            ...item,
            children: visibleChildren,
          };
        }
        
        // Item sin hijos: verificar su permiso
        if (!hasPermission(item.permission)) {
          return null;
        }
        
        return item;
      })
      .filter((item): item is MenuItem => item !== null);
  };

  const handleNavigate = (path: string) => {
    if (permsLoading && path !== '/') {
      return;
    }
    navigate(path);
    setIsMobileMenuOpen(false);
    setActiveSubmenu(null);
  };

  const handleLogoClick = () => {
    navigate('/');
  };

  const isActive = (path: string): boolean => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  if (authLoading) {
    return (
      <>
        {/* Desktop loading */}
        <aside className="hidden lg:flex fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
            <span className="text-sm text-gray-600">Cargando...</span>
          </div>
        </aside>
        {/* Mobile loading */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 z-50 flex items-center justify-center">
          <i className="ri-loader-4-line text-2xl text-teal-600 animate-spin"></i>
        </div>
      </>
    );
  }

  const visibleMenuItems = filterMenuItems(menuItems);
  const visibleMobileMainItems = filterMenuItems(mobileMainItems);
  const moreMenuItems = visibleMenuItems.filter(
    item => !visibleMobileMainItems.some(main => main.path === item.path)
  );

  const renderMenuItem = (item: MenuItem, isChild = false) => {
    const active = isActive(item.path);
    const hasChildren = item.children && item.children.length > 0;
    const isSubmenuExpanded = expandedSubmenus[item.label];
    const isDisabled = permsLoading && item.path !== '/';

    if (hasChildren) {
      return (
        <div key={item.path}>
          <button
            onClick={() => toggleSubmenu(item.label)}
            disabled={isDisabled}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
              active
                ? 'bg-teal-50 text-teal-600'
                : 'text-gray-700 hover:bg-gray-50'
            } ${!isExpanded ? 'justify-center' : ''} ${
              isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            title={!isExpanded ? item.label : ''}
          >
            <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center flex-shrink-0`}></i>
            {isExpanded && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                {isDisabled ? (
                  <i className="ri-loader-4-line text-sm animate-spin"></i>
                ) : (
                  <i className={`ri-arrow-${isSubmenuExpanded ? 'up' : 'down'}-s-line text-lg`}></i>
                )}
              </>
            )}
          </button>
          
          {isExpanded && isSubmenuExpanded && !isDisabled && (
            <div className="bg-gray-50">
              {item.children?.map(child => renderMenuItem(child, true))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={item.path}
        onClick={() => handleNavigate(item.path)}
        disabled={isDisabled}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
          active
            ? 'bg-teal-50 text-teal-600 border-r-2 border-teal-600'
            : 'text-gray-700 hover:bg-gray-50'
        } ${!isExpanded ? 'justify-center' : ''} ${isChild && isExpanded ? 'pl-12' : ''} ${
          isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
        title={!isExpanded ? item.label : ''}
      >
        <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center flex-shrink-0`}></i>
        {isExpanded && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {isDisabled && <i className="ri-loader-4-line text-sm animate-spin"></i>}
          </>
        )}
      </button>
    );
  };

  // Renderizar item del menú móvil expandido
  const renderMobileMenuItem = (item: MenuItem) => {
    const active = isActive(item.path);
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren) {
      return (
        <div key={item.path}>
          <button
            onClick={() => setActiveSubmenu(activeSubmenu === item.label ? null : item.label)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
              active ? 'bg-teal-50 text-teal-600' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
            <span className="flex-1 text-left">{item.label}</span>
            <i className={`ri-arrow-${activeSubmenu === item.label ? 'up' : 'down'}-s-line text-lg`}></i>
          </button>
          {activeSubmenu === item.label && (
            <div className="bg-gray-50 pl-4">
              {item.children?.map(child => (
                <button
                  key={child.path}
                  onClick={() => handleNavigate(child.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive(child.path) ? 'bg-teal-50 text-teal-600' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={`${child.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
                  <span>{child.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={item.path}
        onClick={() => handleNavigate(item.path)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
          active ? 'bg-teal-50 text-teal-600' : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <>
      {/* ========== DESKTOP SIDEBAR ========== */}
      <aside
        className={`hidden lg:flex fixed top-0 left-0 h-screen bg-white border-r border-gray-200 z-50 transition-all duration-300 flex-col ${
          isExpanded ? 'w-64' : 'w-16'
        }`}
      >
        {/* Header con logo clickeable */}
        <button
          onClick={handleLogoClick}
          className={`flex items-center gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0 hover:bg-gray-50 transition-colors cursor-pointer ${!isExpanded ? 'justify-center' : ''}`}
        >
          {isExpanded ? (
            <>
              <div className="h-9 w-9 flex-shrink-0 flex items-center justify-center">
                <img 
                  src="https://static.readdy.ai/image/96746b7ba583c55b81aa58d37fd022fd/894bf9da2b8030a7b0ba3c4dadd1585d.png" 
                  alt="Logo" 
                  className="h-12 w-auto object-contain"
                />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-base font-semibold text-gray-900 truncate">Sistema de reservas OLO</div>
                <div className="text-xs text-gray-500 truncate">
                  {orgName || 'Sin organización'}
                </div>
              </div>
            </>
          ) : (
            <div className="h-8 w-8 flex items-center justify-center">
              <img 
                src="https://static.readdy.ai/image/96746b7ba583c55b81aa58d37fd022fd/894bf9da2b8030a7b0ba3c4dadd1585d.png" 
                alt="Logo" 
                className="h-12 w-auto object-contain"
              />
            </div>
          )}
        </button>

        {/* Toggle Button */}
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            title={isExpanded ? 'Colapsar menú' : 'Expandir menú'}
          >
            <i className={`ri-menu-${isExpanded ? 'fold' : 'unfold'}-line text-xl w-5 h-5 flex items-center justify-center`}></i>
          </button>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-4">
          {visibleMenuItems.map(item => renderMenuItem(item))}
        </nav>

        {/* User Info */}
        {isExpanded && user && (
          <button
            onClick={() => handleNavigate('/perfil')}
            className="w-full px-4 py-3 border-t border-gray-200 flex-shrink-0 hover:bg-gray-50 transition-colors cursor-pointer text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 group-hover:bg-teal-200 transition-colors">
                <span className="text-sm font-medium text-teal-600">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{user.name}</div>
                <div className="text-xs text-gray-500 capitalize truncate">{user.role}</div>
              </div>
              <i className="ri-arrow-right-s-line text-gray-400 group-hover:text-teal-600 transition-colors w-4 h-4 flex items-center justify-center"></i>
            </div>
          </button>
        )}
        {!isExpanded && user && (
          <button
            onClick={() => handleNavigate('/perfil')}
            className="w-full px-4 py-3 border-t border-gray-200 flex-shrink-0 hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-center"
            title="Mi Perfil"
          >
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center hover:bg-teal-200 transition-colors">
              <span className="text-sm font-medium text-teal-600">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
          </button>
        )}
      </aside>

      {/* Desktop Spacer */}
      <div 
        className={`hidden lg:block transition-all duration-300 flex-shrink-0 ${isExpanded ? 'w-64' : 'w-16'}`}
      />

      {/* ========== MOBILE BOTTOM NAVIGATION ========== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {visibleMobileMainItems.map(item => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={`flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors cursor-pointer ${
                  active ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <i className={`${item.icon} text-xl w-6 h-6 flex items-center justify-center`}></i>
                <span className="text-xs mt-1 truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
          
          {/* Botón "Más" - solo mostrar si hay items adicionales */}
          {moreMenuItems.length > 0 && (
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors cursor-pointer ${
                isMobileMenuOpen ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <i className={`${isMobileMenuOpen ? 'ri-close-line' : 'ri-more-2-fill'} text-xl w-6 h-6 flex items-center justify-center`}></i>
              <span className="text-xs mt-1">{isMobileMenuOpen ? 'Cerrar' : 'Más'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => {
            setIsMobileMenuOpen(false);
            setActiveSubmenu(null);
          }}
        />
      )}

      {/* Mobile Menu Panel */}
      <div
        className={`lg:hidden fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 z-40 transition-transform duration-300 max-h-[70vh] overflow-y-auto rounded-t-2xl shadow-lg ${
          isMobileMenuOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Header del menú móvil */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 flex-shrink-0 flex items-center justify-center">
              <img 
                src="https://static.readdy.ai/image/96746b7ba583c55b81aa58d37fd022fd/894bf9da2b8030a7b0ba3c4dadd1585d.png" 
                alt="Logo" 
                className="h-12 w-auto object-contain"
              />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-900">Sistema de reservas OLO</div>
              <div className="text-xs text-gray-500">{orgName || 'Sin organización'}</div>
            </div>
          </div>
        </div>

        {/* Items del menú */}
        <nav className="py-2">
          {moreMenuItems.map(item => renderMobileMenuItem(item))}
        </nav>

        {/* User info en móvil */}
        {user && (
          <button
            onClick={() => handleNavigate('/perfil')}
            className="w-full border-t border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                <span className="text-sm font-medium text-teal-600">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{user.name}</div>
                <div className="text-xs text-gray-500 capitalize">{user.role}</div>
              </div>
              <i className="ri-arrow-right-s-line text-gray-400 group-hover:text-teal-600 transition-colors w-4 h-4 flex items-center justify-center"></i>
            </div>
          </button>
        )}
      </div>

      {/* Mobile bottom spacer */}
      <div className="lg:hidden h-16 flex-shrink-0" />
    </>
  );
}
