import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';
import {
  SidebarHeader,
  SidebarSection,
  SidebarItem,
  SidebarSubmenu,
  SidebarUserCard,
  SidebarToggle,
} from './sidebar';

interface MenuItem {
  path: string;
  label: string;
  icon: string;
  permission?: string;
  children?: MenuItem[];
}

const TECH_PATTERN = `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%232DD4BF' stroke-opacity='0.04' stroke-width='0.5'%3E%3Cpath d='M40 4 L68 20 L68 52 L40 68 L12 52 L12 20 Z'/%3E%3Ccircle cx='40' cy='36' r='1.2' fill='%232DD4BF' fill-opacity='0.06'/%3E%3Ccircle cx='12' cy='36' r='0.6' fill='%232DD4BF' fill-opacity='0.04'/%3E%3Ccircle cx='68' cy='36' r='0.6' fill='%232DD4BF' fill-opacity='0.04'/%3E%3C/g%3E%3Cg fill='none' stroke='%232DD4BF' stroke-opacity='0.02' stroke-width='0.3'%3E%3Cpath d='M40 0 L40 76'/%3E%3Cpath d='M4 18 L76 18'/%3E%3Cpath d='M4 54 L76 54'/%3E%3C/g%3E%3C/svg%3E")`;

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { orgId, can, loading: permsLoading } = usePermissions();

  const [orgName, setOrgName] = useState<string | null>(null);

  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem(`sro_sidebar_collapsed_${user?.id}`);
    if (saved !== null) return JSON.parse(saved) === false;
    return false;
  });

  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveExpanded = isExpanded || isHovering;

  const handleSidebarMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovering(true);
  }, []);

  const handleSidebarMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
      hoverTimeoutRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const [expandedSubmenus, setExpandedSubmenus] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sro_sidebar_submenus');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
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
          if (error) setOrgName('Sin organización');
          else setOrgName(data?.name || 'Sin organización');
        });
    } else {
      setOrgName('Sin organización');
    }
  }, [orgId]);

  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`sro_sidebar_collapsed_${user.id}`, JSON.stringify(!isExpanded));
    }
  }, [isExpanded, user?.id]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setActiveSubmenu(null);
  }, [location.pathname]);

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const menuItems: MenuItem[] = useMemo(() => [
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
        { label: 'Base de Conocimiento', path: '/conocimiento', icon: 'ri-book-open-line', permission: 'chat.documents.manage' },
        { label: 'Auditoría Chat', path: '/chat/auditoria', icon: 'ri-shield-check-line', permission: 'chat.audit.view' },
      ],
    },
  ], []);

  const mobileMainItems: MenuItem[] = useMemo(() => [
    { label: 'Dashboard', path: '/dashboard', icon: 'ri-dashboard-line', permission: 'menu.dashboard.view' },
    { label: 'Calendario', path: '/calendario', icon: 'ri-calendar-line', permission: 'menu.calendario.view' },
    { label: 'Reservas', path: '/reservas', icon: 'ri-file-list-line', permission: 'menu.reservas.view' },
    { label: 'Andenes', path: '/andenes', icon: 'ri-truck-line', permission: 'menu.andenes.view' },
  ], []);

  const hasPermission = useCallback((permission?: string): boolean => {
    if (!permission) return true;
    if (permsLoading) return true;
    if (!orgId) return false;
    return can(permission);
  }, [permsLoading, orgId, can]);

  const filterMenuItems = useCallback((items: MenuItem[]): MenuItem[] => {
    return items
      .map((item) => {
        if (item.children) {
          const visibleChildren = item.children.filter((child) => hasPermission(child.permission));
          if (visibleChildren.length === 0) return null;
          if (!hasPermission(item.permission)) return null;
          return { ...item, children: visibleChildren };
        }
        if (!hasPermission(item.permission)) return null;
        return item;
      })
      .filter((item): item is MenuItem => item !== null);
  }, [hasPermission]);

  const visibleMenuItems = useMemo(() => filterMenuItems(menuItems), [filterMenuItems, menuItems]);
  const visibleMobileMainItems = useMemo(() => filterMenuItems(mobileMainItems), [filterMenuItems, mobileMainItems]);
  const moreMenuItems = useMemo(
    () => visibleMenuItems.filter((item) => !visibleMobileMainItems.some((main) => main.path === item.path)),
    [visibleMenuItems, visibleMobileMainItems]
  );

  const handleNavigate = useCallback((path: string) => {
    if (permsLoading && path !== '/') return;
    navigate(path);
    setIsMobileMenuOpen(false);
    setActiveSubmenu(null);
  }, [navigate, permsLoading]);

  const isActive = useCallback((path: string): boolean => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }, [location.pathname]);

  const toggleSidebar = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const toggleSubmenu = useCallback((label: string) => {
    setExpandedSubmenus((prev) => ({ ...prev, [label]: !prev[label] }));
    if (!effectiveExpanded) setIsExpanded(true);
  }, [effectiveExpanded]);

  if (authLoading) {
    return (
      <>
        <aside className="hidden lg:flex fixed top-0 left-0 h-full w-[304px] bg-[#060d18] z-50 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <i className="ri-loader-4-line text-3xl text-teal-400 animate-spin" />
            <span className="text-sm text-gray-500">Cargando...</span>
          </div>
        </aside>
        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#060d18] border-t border-white/[0.06] z-50 flex items-center justify-center">
          <i className="ri-loader-4-line text-2xl text-teal-400 animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      {/* ========== DESKTOP SIDEBAR ========== */}
      <motion.aside
        initial={false}
        animate={{ width: effectiveExpanded ? 304 : 80 }}
        transition={{ duration: reducedMotion ? 0 : 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="hidden lg:flex fixed top-0 left-0 h-screen z-50 flex-col overflow-hidden bg-[#060d18] border-r border-white/[0.06]"
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        {/* ───── LAYER 1: Base gradient (deep navy) ───── */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#080f20] via-[#060d18] to-[#040a14]" />

        {/* ───── LAYER 2: Tech pattern with slow drift ───── */}
        <div
          className="absolute inset-0 sidebar-bg-animate pointer-events-none"
          style={{ backgroundImage: TECH_PATTERN, backgroundSize: '80px 80px' }}
        />

        {/* ───── LAYER 3: Ambient radial light sweeping slowly ───── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="sidebar-ambient-animate absolute w-[500px] h-[500px] rounded-full bg-teal-500/[0.03] blur-3xl"
            style={{ top: '10%', left: '-30%' }}
          />
          <div
            className="sidebar-ambient-animate absolute w-[400px] h-[400px] rounded-full bg-teal-500/[0.02] blur-3xl"
            style={{ top: '55%', left: '-20%', animationDelay: '-11s' }}
          />
        </div>

        {/* ───── Top edge refined glow ───── */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-400/25 to-transparent sidebar-edge-animate" />

        {/* ───── VISUAL CONNECTION LINE ───── */}
        {/* Subtle vertical tech line connecting branding → operations → admin → user */}
        {effectiveExpanded && (
          <div className="absolute left-[22px] top-[155px] bottom-[90px] pointer-events-none">
            {/* Main line — segmented gradient */}
            <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-teal-400/5 via-teal-400/15 via-white/[0.08] via-teal-400/15 to-teal-400/5 sidebar-line-animate" />

            {/* Node dots at rhythm points */}
            {/* After branding area */}
            <div className="absolute top-[8%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/20 sidebar-node-pulse-animate" />
            {/* Operations section start */}
            <div className="absolute top-[22%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/25 sidebar-node-pulse-animate" style={{ animationDelay: '-2s' }} />
            {/* Operations section end */}
            <div className="absolute top-[58%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/20 sidebar-node-pulse-animate" style={{ animationDelay: '-4s' }} />
            {/* Admin section */}
            <div className="absolute top-[65%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/30 sidebar-node-pulse-animate" style={{ animationDelay: '-1s' }} />
            {/* Bottom, before user */}
            <div className="absolute top-[92%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/20 sidebar-node-pulse-animate" style={{ animationDelay: '-3s' }} />
          </div>
        )}

        {/* ───── HEADER — identidad del producto ───── */}
        <SidebarHeader isExpanded={effectiveExpanded} isCollapsed={!effectiveExpanded} onLogoClick={() => navigate('/')} />

        {/* ───── TOGGLE ───── */}
        <SidebarToggle isExpanded={isExpanded} onToggle={toggleSidebar} isCollapsed={!isExpanded} />

        {/* ───── SCROLLABLE MENU ───── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="px-2 py-1 flex flex-col">
            {/* Sección Operaciones */}
            {visibleMenuItems.some((i) => !i.children && i.label !== 'Administración') && (
              <SidebarSection label="Operaciones" isExpanded={effectiveExpanded} />
            )}

            {/* Items de Operaciones */}
            {visibleMenuItems.map((item) => {
              if (item.label === 'Administración') return null;
              const active = isActive(item.path);
              const isDisabled = permsLoading && item.path !== '/';

              return (
                <SidebarItem
                  key={item.path}
                  path={item.path}
                  label={item.label}
                  icon={item.icon}
                  isActive={active}
                  isExpanded={effectiveExpanded}
                  isCollapsed={!effectiveExpanded}
                  onClick={() => handleNavigate(item.path)}
                  isDisabled={isDisabled}
                />
              );
            })}

            {/* Separador entre Operaciones y Administración */}
            {visibleMenuItems.some((i) => i.label === 'Administración') && (
              <div className="py-3.5">
                <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />
              </div>
            )}

            {/* Sección Administración */}
            {visibleMenuItems
              .filter((item) => item.label === 'Administración')
              .map((item) => {
                const active = isActive(item.path);
                const isDisabled = permsLoading && item.path !== '/';

                return (
                  <SidebarSubmenu
                    key={item.path}
                    label={item.label}
                    icon={item.icon}
                    isExpanded={effectiveExpanded}
                    isCollapsed={!effectiveExpanded}
                    isOpen={!!expandedSubmenus[item.label]}
                    isActive={active}
                    onToggle={() => toggleSubmenu(item.label)}
                    children={item.children!}
                    activeChildPath={location.pathname}
                    onChildClick={handleNavigate}
                    isDisabled={isDisabled}
                  />
                );
              })}
          </div>
        </nav>

        {/* ───── SEPARADOR antes del perfil ───── */}
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.16] to-transparent flex-shrink-0" />

        {/* ───── PERFIL ───── */}
        {user && (
          <SidebarUserCard
            name={user.name}
            role={user.role}
            initial={user.name.charAt(0).toUpperCase()}
            avatarUrl={user.avatarUrl}
            isExpanded={effectiveExpanded}
            isCollapsed={!effectiveExpanded}
            onClick={() => handleNavigate('/perfil')}
          />
        )}
      </motion.aside>

      {/* Desktop Spacer */}
      <motion.div
        initial={false}
        animate={{ width: effectiveExpanded ? 304 : 80 }}
        transition={{ duration: reducedMotion ? 0 : 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="hidden lg:block flex-shrink-0"
      />

      {/* ========== MOBILE BOTTOM NAVIGATION ========== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#060d18] border-t border-white/[0.06] z-50 safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {visibleMobileMainItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={`flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors cursor-pointer ${
                  active ? 'text-teal-400' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <i className={`${item.icon} text-xl w-6 h-6 flex items-center justify-center`} />
                <span className="text-xs mt-1 truncate max-w-full">{item.label}</span>
              </button>
            );
          })}

          {moreMenuItems.length > 0 && (
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors cursor-pointer ${
                isMobileMenuOpen ? 'text-teal-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <i className={`${isMobileMenuOpen ? 'ri-close-line' : 'ri-more-2-fill'} text-xl w-6 h-6 flex items-center justify-center`} />
              <span className="text-xs mt-1">{isMobileMenuOpen ? 'Cerrar' : 'Más'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ========== MOBILE OVERLAY ========== */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={() => {
              setIsMobileMenuOpen(false);
              setActiveSubmenu(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* ========== MOBILE DRAWER ========== */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: reducedMotion ? 0 : 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="lg:hidden fixed top-0 left-0 bottom-0 w-[304px] z-50 flex flex-col bg-[#060d18] border-r border-white/[0.06]"
          >
            {/* Mobile background layers */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#080f20] via-[#060d18] to-[#040a14]" />
            <div
              className="absolute inset-0 sidebar-bg-animate pointer-events-none"
              style={{ backgroundImage: TECH_PATTERN, backgroundSize: '80px 80px' }}
            />

            {/* Header móvil */}
            <div className="relative flex-shrink-0">
              <div className="absolute top-10 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-teal-500/[0.04] blur-3xl sidebar-ambient-animate pointer-events-none" />

              <div className="relative px-5 pt-7 pb-4">
                <div className="flex flex-col gap-4">
                  <div className="relative w-16 h-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.08]">
                    <img
                      src="https://public.readdy.ai/ai/img_res/fd160613-607e-4879-85f2-e61c798a4540.png"
                      alt="SRO"
                      className="h-12 w-auto object-contain brightness-110"
                    />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-white tracking-tight">SRO</div>
                    <div className="text-[13px] text-gray-400 font-medium">Sistema de Reservas OLO</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Items móvil */}
            <nav className="flex-1 overflow-y-auto px-2 py-2 relative">
              <div className="flex flex-col gap-0.5">
                {moreMenuItems.map((item) => {
                  const active = isActive(item.path);
                  const hasChildren = item.children && item.children.length > 0;

                  if (hasChildren) {
                    return (
                      <div key={item.path}>
                        <button
                          onClick={() => setActiveSubmenu(activeSubmenu === item.label ? null : item.label)}
                          className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-xl transition-colors cursor-pointer ${
                            active ? 'text-white bg-gradient-to-r from-teal-500/15 to-transparent border-l-[3px] border-teal-400' : 'text-white/80 hover:text-white hover:bg-white/[0.03]'
                          }`}
                        >
                          <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.02]">
                            <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center ${active ? 'text-teal-300' : 'text-white/70'}`} />
                          </span>
                          <span className="flex-1 text-left text-sm">{item.label}</span>
                          <motion.i
                            animate={{ rotate: activeSubmenu === item.label ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="ri-arrow-down-s-line text-lg w-5 h-5 flex items-center justify-center text-white/40"
                          />
                        </button>
                        <AnimatePresence>
                          {activeSubmenu === item.label && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden ml-4"
                            >
                              <div className="py-1 space-y-px border-l-2 border-white/[0.08] pl-4 mt-1">
                                {item.children?.map((child) => (
                                  <button
                                    key={child.path}
                                    onClick={() => handleNavigate(child.path)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors cursor-pointer ${
                                      isActive(child.path) ? 'text-white bg-white/[0.03]' : 'text-white/70 hover:text-white hover:bg-white/[0.02]'
                                    }`}
                                  >
                                    <i className={`${child.icon} text-sm w-4 h-4 flex items-center justify-center`} />
                                    <span>{child.label}</span>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-xl transition-colors cursor-pointer ${
                        active
                          ? 'text-white bg-gradient-to-r from-teal-500/15 to-transparent border-l-[3px] border-teal-400'
                          : 'text-white/80 hover:text-white hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.02]">
                        <i className={`${item.icon} text-lg w-5 h-5 flex items-center justify-center ${active ? 'text-teal-300' : 'text-white/70'}`} />
                      </span>
                      <span className="flex-1 text-left text-sm">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* User en móvil */}
            {user && (
              <div className="flex-shrink-0 p-4 border-t border-white/[0.06] relative">
                <button
                  onClick={() => handleNavigate('/perfil')}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-[#111827] border border-white/[0.06] cursor-pointer w-full"
                >
                  <div className="relative w-11 h-11">
                    <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                      <span className="text-base font-bold text-teal-300">{user.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#060d18]" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-semibold text-white truncate">{user.name}</div>
                    <div className="text-xs text-teal-400/70 capitalize">{user.role}</div>
                  </div>
                  <i className="ri-arrow-right-s-line text-gray-400 w-5 h-5 flex items-center justify-center" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile bottom spacer */}
      <div className="lg:hidden h-16 flex-shrink-0" />
    </>
  );
}