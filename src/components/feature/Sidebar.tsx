import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';
import type { MenuItem } from './sidebar/types';
import { menuItems as rawMenuItems, TECH_PATTERN } from './sidebar/constants';
import {
  SidebarHeader,
  SidebarSection,
  SidebarItem,
  SidebarSubmenu,
  SidebarUserCard,
  SidebarToggle,
  SidebarMobileDrawer,
  SidebarMobileBottomNav,
} from './sidebar';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { orgId, can, loading: permsLoading } = usePermissions();

  const [orgName, setOrgName] = useState<string | null>(null);

  // ─── EXPANDED / COLLAPSED ───
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem(`sro_sidebar_collapsed_${user?.id}`);
    if (saved !== null) return JSON.parse(saved) === false;
    return true;
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

  // ─── SUBMENUS ───
  const [expandedSubmenus, setExpandedSubmenus] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sro_sidebar_submenus');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // ─── MOBILE ───
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  // ─── ORG NAME ───
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

  // ─── PERSIST EXPANDED STATE ───
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`sro_sidebar_collapsed_${user.id}`, JSON.stringify(!isExpanded));
    }
  }, [isExpanded, user?.id]);

  // ─── CLOSE MOBILE ON NAVIGATION ───
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setActiveSubmenu(null);
  }, [location.pathname]);

  // ─── REDUCED MOTION ───
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ─── PERMISSION FILTERING ───
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

  // ─── DERIVED MENU ITEMS ───
  const visibleMenuItems = useMemo(() => filterMenuItems(rawMenuItems), [filterMenuItems]);

  const rawMobileMainItems = useMemo(
    () => rawMenuItems.filter((item) => item.mobilePrimary),
    []
  );

  const visibleMobileMainItems = useMemo(
    () => filterMenuItems(rawMobileMainItems),
    [filterMenuItems, rawMobileMainItems]
  );

  const moreMenuItems = useMemo(
    () => visibleMenuItems.filter(
      (item) => !visibleMobileMainItems.some((main) => main.path === item.path)
    ),
    [visibleMenuItems, visibleMobileMainItems]
  );

  // ─── NAVIGATION ───
  const handleNavigate = useCallback((path: string) => {
    if (permsLoading && path !== '/') return;
    navigate(path);
    setIsMobileMenuOpen(false);
    setActiveSubmenu(null);
  }, [navigate, permsLoading]);

  // ─── ACTIVE DETECTION ───
  const isActive = useCallback((path: string): boolean => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }, [location.pathname]);

  // ─── TOGGLE ACTIONS ───
  const toggleSidebar = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const toggleSubmenu = useCallback((label: string) => {
    setExpandedSubmenus((prev) => ({ ...prev, [label]: !prev[label] }));
    if (!effectiveExpanded) setIsExpanded(true);
  }, [effectiveExpanded]);

  const handleMobileToggleSubmenu = useCallback((label: string) => {
    setActiveSubmenu((prev) => (prev === label ? null : label));
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setIsMobileMenuOpen(false);
    setActiveSubmenu(null);
  }, []);

  const handleToggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  // ─── USER DERIVED ───
  const drawerUser = user ? {
    name: user.name,
    role: user.role,
    initial: user.name.charAt(0).toUpperCase(),
    avatarUrl: user.avatarUrl,
  } : null;

  // ─── LOADING STATE ───
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
            className="sidebar-ambient-animate absolute w-[500px] h-[500px] rounded-full bg-teal-500/[0.03] blur-3xl transition-all duration-500"
            style={{ top: '10%', left: effectiveExpanded ? '-30%' : '0%' }}
          />
          <div
            className="sidebar-ambient-animate absolute w-[400px] h-[400px] rounded-full bg-teal-500/[0.02] blur-3xl transition-all duration-500"
            style={{ top: '55%', left: effectiveExpanded ? '-20%' : '5%', animationDelay: '-11s' }}
          />
        </div>

        {/* ───── Top edge refined glow ───── */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-400/35 to-transparent sidebar-edge-animate" />

        {/* ───── VISUAL CONNECTION LINE ───── */}
        {effectiveExpanded && (
          <div className="absolute left-[22px] top-[155px] bottom-[90px] pointer-events-none">
            <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-teal-400/5 via-teal-400/15 via-white/[0.08] via-teal-400/15 to-teal-400/5 sidebar-line-animate" />
            <div className="absolute top-[8%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/20 sidebar-node-pulse-animate" />
            <div className="absolute top-[22%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/25 sidebar-node-pulse-animate" style={{ animationDelay: '-2s' }} />
            <div className="absolute top-[58%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/20 sidebar-node-pulse-animate" style={{ animationDelay: '-4s' }} />
            <div className="absolute top-[65%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/30 sidebar-node-pulse-animate" style={{ animationDelay: '-1s' }} />
            <div className="absolute top-[92%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/20 sidebar-node-pulse-animate" style={{ animationDelay: '-3s' }} />
          </div>
        )}

        {/* ───── HEADER ───── */}
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
                  layoutNamespace="desktop"
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
                    layoutNamespace="desktop"
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
      <SidebarMobileBottomNav
        mainItems={visibleMobileMainItems}
        moreItemsCount={moreMenuItems.length}
        isMenuOpen={isMobileMenuOpen}
        isActive={isActive}
        onNavigate={handleNavigate}
        onToggleMenu={handleToggleMobileMenu}
      />

      {/* ========== MOBILE DRAWER + OVERLAY ========== */}
      <SidebarMobileDrawer
        isOpen={isMobileMenuOpen}
        onClose={handleCloseDrawer}
        menuItems={moreMenuItems}
        activePath={location.pathname}
        activeSubmenu={activeSubmenu}
        onToggleSubmenu={handleMobileToggleSubmenu}
        onNavigate={handleNavigate}
        isActive={isActive}
        user={drawerUser}
        reducedMotion={reducedMotion}
      />

      {/* Mobile bottom spacer */}
      <div className="lg:hidden h-16 flex-shrink-0" />
    </>
  );
}