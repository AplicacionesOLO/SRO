import { motion } from 'framer-motion';
import SidebarTooltip from './SidebarTooltip';

interface SidebarItemProps {
  path: string;
  label: string;
  icon: string;
  isActive: boolean;
  isExpanded: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  isDisabled?: boolean;
}

export default function SidebarItem({
  label,
  icon,
  isActive,
  isExpanded,
  isCollapsed,
  onClick,
  isDisabled,
}: SidebarItemProps) {
  const content = (
    <motion.button
      onClick={onClick}
      disabled={isDisabled}
      whileHover={!isCollapsed && !isDisabled ? { x: 3 } : undefined}
      whileTap={{ scale: 0.97 }}
      className={`
        relative w-full flex items-center gap-3 font-medium transition-all duration-250 cursor-pointer
        ${isCollapsed ? 'justify-center px-2 py-3.5' : 'px-3 h-[46px]'}
        ${isActive
          ? 'text-white'
          : `text-white/85 hover:text-white ${!isDisabled ? 'hover:bg-white/[0.04]' : ''}`
        }
        ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}
        rounded-[10px]
        group
      `}
      aria-current={isActive ? 'page' : undefined}
      aria-label={isCollapsed ? label : undefined}
    >
      {/* Active glow bar */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active-bar"
          className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-teal-400 shadow-[0_0_14px_rgba(45,212,191,0.6),0_0_4px_rgba(45,212,191,0.3)]"
          transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.8 }}
        />
      )}

      {/* Active background depth */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active-bg"
          className="absolute inset-0 rounded-[10px] bg-gradient-to-r from-teal-500/18 via-teal-400/8 to-teal-400/2 border border-teal-500/12 shadow-[inset_0_1px_0_rgba(45,212,191,0.08)]"
          transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.8 }}
        />
      )}

      {/* Hover subtle glow line at left edge */}
      <div className="absolute left-0 top-2.5 bottom-2.5 w-px bg-gradient-to-b from-transparent via-teal-400/0 to-transparent group-hover:via-teal-400/20 transition-all duration-300" />

      {/* Icon container */}
      <span
        className={`
          relative z-10 w-[34px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-250
          ${isActive
            ? 'bg-teal-500/20 text-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.2)]'
            : 'text-white/65 group-hover:text-white/90'
          }
        `}
      >
        <i className={`${icon} text-[18px] w-5 h-5 flex items-center justify-center`} />
      </span>

      {/* Label */}
      {isExpanded && (
        <motion.span
          initial={false}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 min-w-0 text-left relative z-10 truncate text-[14px]"
        >
          {label}
        </motion.span>
      )}
    </motion.button>
  );

  if (isCollapsed) {
    return (
      <SidebarTooltip label={label} isVisible={true}>
        {content}
      </SidebarTooltip>
    );
  }

  return <div className="group">{content}</div>;
}