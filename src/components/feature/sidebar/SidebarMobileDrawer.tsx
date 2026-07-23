import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem } from './types';
import { TECH_PATTERN } from './constants';
import SidebarHeader from './SidebarHeader';
import SidebarSection from './SidebarSection';
import SidebarItem from './SidebarItem';
import SidebarSubmenu from './SidebarSubmenu';
import SidebarUserCard from './SidebarUserCard';

interface SidebarMobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  activePath: string;
  activeSubmenu: string | null;
  onToggleSubmenu: (label: string) => void;
  onNavigate: (path: string) => void;
  isActive: (path: string) => boolean;
  user: {
    name: string;
    role: string;
    initial: string;
    avatarUrl: string | null;
  } | null;
  reducedMotion: boolean;
}

export default function SidebarMobileDrawer({
  isOpen,
  onClose,
  menuItems,
  activePath,
  activeSubmenu,
  onToggleSubmenu,
  onNavigate,
  isActive,
  user,
  reducedMotion,
}: SidebarMobileDrawerProps) {
  // ─── Group items by section ───
  const { operacionesItems, adminItem } = useMemo(() => {
    const ops: MenuItem[] = [];
    let adm: MenuItem | null = null;

    for (const item of menuItems) {
      if (item.label === 'Administración' && item.children) {
        adm = item;
      } else if (!item.children) {
        ops.push(item);
      }
    }

    return { operacionesItems: ops, adminItem: adm };
  }, [menuItems]);

  return (
    <>
      {/* ========== MOBILE OVERLAY ========== */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* ========== MOBILE DRAWER ========== */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: reducedMotion ? 0 : 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="lg:hidden fixed top-0 left-0 bottom-0 w-[304px] z-50 flex flex-col overflow-hidden bg-[#060d18] border-r border-white/[0.06]"
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
                className="sidebar-ambient-animate absolute w-[400px] h-[400px] rounded-full bg-teal-500/[0.03] blur-3xl"
                style={{ top: '5%', left: '-30%' }}
              />
              <div
                className="sidebar-ambient-animate absolute w-[300px] h-[300px] rounded-full bg-teal-500/[0.02] blur-3xl"
                style={{ top: '60%', left: '-15%', animationDelay: '-11s' }}
              />
            </div>

            {/* ───── Top edge refined glow ───── */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-400/25 to-transparent sidebar-edge-animate" />

            {/* ───── HEADER ───── */}
            <SidebarHeader
              isExpanded
              isCollapsed={false}
              onLogoClick={() => onNavigate('/')}
              variant="drawer"
            />

            {/* ───── SCROLLABLE NAV ───── */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 relative">
              <div className="px-2 py-1 flex flex-col">
                {/* ─── Operaciones section ─── */}
                {operacionesItems.length > 0 && (
                  <SidebarSection label="Operaciones" isExpanded />
                )}

                {operacionesItems.map((item) => (
                  <SidebarItem
                    key={item.path}
                    path={item.path}
                    label={item.label}
                    icon={item.icon}
                    isActive={isActive(item.path)}
                    isExpanded
                    isCollapsed={false}
                    onClick={() => onNavigate(item.path)}
                    layoutNamespace="drawer"
                  />
                ))}

                {/* ─── Separator between Operaciones and Admin ─── */}
                {operacionesItems.length > 0 && adminItem && (
                  <div className="py-3.5">
                    <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />
                  </div>
                )}

                {/* ─── Admin submenu ─── */}
                {adminItem && (
                  <SidebarSubmenu
                    key={adminItem.path}
                    label={adminItem.label}
                    icon={adminItem.icon}
                    isExpanded
                    isCollapsed={false}
                    isOpen={activeSubmenu === adminItem.label}
                    isActive={isActive(adminItem.path)}
                    onToggle={() => onToggleSubmenu(adminItem.label)}
                    children={adminItem.children!}
                    activeChildPath={activePath}
                    onChildClick={onNavigate}
                    layoutNamespace="drawer"
                  />
                )}
              </div>
            </nav>

            {/* ───── Separator before user ───── */}
            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.16] to-transparent flex-shrink-0" />

            {/* ───── USER ───── */}
            {user && (
              <SidebarUserCard
                name={user.name}
                role={user.role}
                initial={user.initial}
                avatarUrl={user.avatarUrl}
                isExpanded
                isCollapsed={false}
                onClick={() => onNavigate('/perfil')}
                variant="drawer"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}