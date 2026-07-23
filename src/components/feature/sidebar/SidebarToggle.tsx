import { motion } from 'framer-motion';
import SidebarTooltip from './SidebarTooltip';

interface SidebarToggleProps {
  isExpanded: boolean;
  onToggle: () => void;
  isCollapsed: boolean;
}

export default function SidebarToggle({ isExpanded, onToggle, isCollapsed }: SidebarToggleProps) {
  if (isCollapsed) {
    return (
      <div className="flex-shrink-0 py-2.5 flex justify-center relative">
        {/* Tiny connecting node */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-400/20" />

        <SidebarTooltip label="Expandir panel" isVisible={true}>
          <motion.button
            onClick={onToggle}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.10] text-gray-300 hover:text-teal-400 hover:border-teal-400/40 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer shadow-[0_0_12px_rgba(0,0,0,0.15)]"
            aria-label="Expandir panel lateral"
          >
            <i className="ri-arrow-right-s-line text-xl w-6 h-6 flex items-center justify-center" />
          </motion.button>
        </SidebarTooltip>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 px-4 py-1 flex justify-end relative">
      <motion.button
        onClick={onToggle}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.10] text-gray-300 hover:text-teal-400 hover:border-teal-400/40 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer shadow-[0_0_12px_rgba(0,0,0,0.15)]"
        aria-label="Colapsar panel lateral"
      >
        <i className="ri-arrow-left-s-line text-lg w-6 h-6 flex items-center justify-center" />
      </motion.button>
    </div>
  );
}