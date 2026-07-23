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
}

export default function SidebarUserCard({ name, role, initial, avatarUrl, isExpanded, isCollapsed, onClick }: SidebarUserCardProps) {
  if (isCollapsed) {
    return (
      <div className="px-2 py-3 flex justify-center">
        <SidebarTooltip label={`${name} — ${role}`} isVisible={true}>
          <motion.button
            onClick={onClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-12 h-12 flex items-center justify-center rounded-xl bg-[#111827] border border-white/[0.06] hover:border-teal-400/30 transition-all duration-200 cursor-pointer"
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
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-[#0A0F1C]" />
            </span>
          </motion.button>
        </SidebarTooltip>
      </div>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="w-full flex-shrink-0 px-3 py-3"
    >
      <div className="relative flex items-center gap-3.5 p-4 rounded-2xl bg-[#0e1625] border border-white/[0.10] hover:border-white/[0.16] hover:bg-[#111b2c] transition-all duration-300 cursor-pointer group overflow-hidden shadow-[0_0_24px_rgba(0,0,0,0.35)]">
        {/* Shimmer hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-400/[0.04] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />

        {/* Avatar */}
        <div className="relative w-11 h-11 flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-11 h-11 rounded-full object-cover border border-white/[0.08]"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <span className="text-base font-bold text-teal-300">{initial}</span>
            </div>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#111827]" />
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[14px] font-semibold text-white truncate leading-tight">
            {name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[12px] text-gray-500 font-medium capitalize truncate">
              {role}
            </span>
            <span className="text-[11px] text-emerald-500/80 font-semibold whitespace-nowrap">
              En línea
            </span>
          </div>
        </div>

        {/* Iconos derecha */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.04]">
            <i className="ri-shield-check-line text-teal-500/40 text-sm w-4 h-4 flex items-center justify-center" />
          </span>
          <i className="ri-arrow-right-s-line text-gray-600 w-5 h-5 flex items-center justify-center group-hover:text-gray-400 transition-colors" />
        </div>
      </div>
    </motion.button>
  );
}