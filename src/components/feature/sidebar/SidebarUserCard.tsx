import { motion } from 'framer-motion';
import SidebarTooltip from './SidebarTooltip';

interface SidebarUserCardProps {
  name: string;
  role: string;
  initial: string;
  avatarUrl: string | null;
  isExpanded: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  variant?: 'desktop' | 'drawer';
}

export default function SidebarUserCard({ name, role, initial, avatarUrl, isExpanded, isCollapsed, onClick, variant = 'desktop' }: SidebarUserCardProps) {
  // ───── DRAWER VARIANT ─────
  if (variant === 'drawer') {
    return (
      <div className="flex-shrink-0 p-4 border-t border-white/[0.08] relative">
        <button
          onClick={onClick}
          className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#0e1625] border border-white/[0.10] hover:border-white/[0.16] hover:bg-[#111b2c] transition-all duration-300 cursor-pointer w-full"
        >
          <div className="relative w-11 h-11 flex-shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="w-11 h-11 rounded-full object-cover border border-white/[0.10]"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-white/[0.10] flex items-center justify-center">
                <span className="text-base font-bold text-teal-300">{initial}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-semibold text-white truncate leading-tight">{name}</div>
            <div className="text-xs text-gray-500 font-medium capitalize mt-0.5">{role}</div>
          </div>
          <i className="ri-arrow-right-s-line text-gray-500 w-5 h-5 flex items-center justify-center group-hover:text-gray-300 transition-colors" />
        </button>
      </div>
    );
  }

  // ───── DESKTOP COLLAPSED ─────
  if (isCollapsed) {
    return (
      <div className="px-2 py-3 flex justify-center">
        <SidebarTooltip label={`${name} — ${role}`} isVisible={true}>
          <motion.button
            onClick={onClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-12 h-12 flex items-center justify-center rounded-xl bg-[#0e1625] border border-white/[0.10] hover:border-teal-400/30 transition-all duration-200 cursor-pointer"
            aria-label="Mi perfil"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="w-10 h-10 rounded-full object-cover border border-white/[0.08]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <span className="text-sm font-bold text-teal-300">{initial}</span>
              </div>
            )}
          </motion.button>
        </SidebarTooltip>
      </div>
    );
  }

  // ───── DESKTOP EXPANDED ─────
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="w-full flex-shrink-0 px-3 py-3"
    >
      <div className="relative flex items-center gap-3.5 p-4 rounded-2xl bg-[#0e1625] border border-white/[0.10] hover:border-white/[0.16] hover:bg-[#111b2c] transition-all duration-300 cursor-pointer group overflow-hidden">
        {/* Shimmer hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-400/[0.04] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />

        {/* Avatar */}
        <div className="relative w-11 h-11 flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-11 h-11 rounded-full object-cover border border-white/[0.10]"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-white/[0.10] flex items-center justify-center">
              <span className="text-base font-bold text-teal-300">{initial}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[14px] font-semibold text-white truncate leading-tight">
            {name}
          </div>
          <div className="text-[12px] text-gray-500 font-medium capitalize truncate mt-0.5">
            {role}
          </div>
        </div>

        {/* Arrow */}
        <i className="ri-arrow-right-s-line text-gray-500 w-5 h-5 flex items-center justify-center group-hover:text-gray-300 transition-colors flex-shrink-0" />
      </div>
    </motion.button>
  );
}