import { motion, AnimatePresence } from 'framer-motion';
import SidebarTooltip from './SidebarTooltip';

interface SubMenuChild {
  path: string;
  label: string;
  icon: string;
  permission?: string;
}

interface SidebarSubmenuProps {
  label: string;
  icon: string;
  isExpanded: boolean;
  isCollapsed: boolean;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  children: SubMenuChild[];
  activeChildPath: string | null;
  onChildClick: (path: string) => void;
  isDisabled?: boolean;
}

export default function SidebarSubmenu({
  label,
  icon,
  isExpanded,
  isCollapsed,
  isOpen,
  isActive,
  onToggle,
  children,
  activeChildPath,
  onChildClick,
  isDisabled,
}: SidebarSubmenuProps) {
  const hasActiveChild = children.some((child) => child.path === activeChildPath);

  if (isCollapsed) {
    return (
      <SidebarTooltip label={label} isVisible={true}>
        <button
          onClick={onToggle}
          disabled={isDisabled}
          className={`
            relative w-full flex items-center justify-center px-2 py-3.5 text-sm font-medium rounded-[10px] transition-all duration-250 cursor-pointer
            ${isActive || hasActiveChild ? 'text-teal-400' : 'text-white/85 hover:text-white hover:bg-white/[0.03]'}
            ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}
          `}
          aria-expanded={isOpen}
          aria-label={label}
        >
          {(isActive || hasActiveChild) && (
            <motion.div
              layoutId="sidebar-active-bar"
              className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-teal-400 shadow-[0_0_14px_rgba(45,212,191,0.6)]"
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            />
          )}

          <span
            className={`
              w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-250
              ${isActive || hasActiveChild
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/20 shadow-[0_0_12px_rgba(45,212,191,0.15)]'
                : 'text-white/65 border border-transparent'
              }
            `}
          >
            <i className={`${icon} text-lg w-5 h-5 flex items-center justify-center`} />
          </span>
        </button>
      </SidebarTooltip>
    );
  }

  const isSectionActive = isActive || hasActiveChild;

  return (
    <div>
      {/* Parent button — Admin section header */}
      <motion.button
        onClick={onToggle}
        disabled={isDisabled}
        whileHover={!isDisabled ? { x: 3 } : undefined}
        whileTap={{ scale: 0.97 }}
        className={`
          relative w-full flex items-center gap-3 px-3 h-[46px] font-medium rounded-[10px] transition-all duration-250 cursor-pointer group
          ${isSectionActive
            ? 'text-teal-300 bg-gradient-to-r from-teal-500/12 via-teal-400/5 to-transparent border border-teal-500/10 shadow-[0_0_20px_rgba(13,148,136,0.06)]'
            : `text-white/85 hover:text-white hover:bg-white/[0.04] ${!isDisabled ? '' : ''}`
          }
          ${isOpen
            ? 'rounded-b-none border-b-0'
            : ''
          }
          ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}
        `}
        aria-expanded={isOpen}
        aria-label={label}
      >
        {/* Active bar when section is active but not open */}
        {isSectionActive && (
          <motion.div
            layoutId="sidebar-active-bar"
            className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-teal-400 shadow-[0_0_14px_rgba(45,212,191,0.6),0_0_4px_rgba(45,212,191,0.3)]"
            transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.8 }}
          />
        )}

        {/* Hover edge line */}
        <div className="absolute left-0 top-2.5 bottom-2.5 w-px bg-gradient-to-b from-transparent via-teal-400/0 to-transparent group-hover:via-teal-400/20 transition-all duration-300" />

        {/* Icon */}
        <span
          className={`
            relative z-10 w-[34px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-250
            ${isSectionActive
              ? 'bg-teal-500/20 text-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.2)]'
              : 'text-white/65 group-hover:text-white/90'
            }
          `}
        >
          <i className={`${icon} text-[18px] w-5 h-5 flex items-center justify-center`} />
        </span>

        {/* Label */}
        <span className="flex-1 min-w-0 text-left truncate text-[14px] relative z-10">
          {label}
        </span>

        {/* Chevron + node */}
        <motion.i
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className={`text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors relative z-10 ${
            isOpen ? 'text-teal-400' : 'text-gray-400 group-hover:text-gray-200'
          }`}
        >
          <i className="ri-arrow-down-s-line" />
        </motion.i>
      </motion.button>

      {/* Children panel */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="relative mx-0.5 mb-1 rounded-b-xl rounded-tr-xl bg-white/[0.03] border border-white/[0.06] border-t-0 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
              {/* Top inner glow line */}
              <div className="absolute top-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />

              {/* Vertical hierarchy line */}
              <div className="absolute left-[21px] top-4 bottom-4 w-px bg-gradient-to-b from-teal-400/25 via-white/[0.08] to-teal-400/25 sidebar-line-animate" />

              <div className="py-2 space-y-0.5">
                {children.map((child, index) => {
                  const childActive = activeChildPath === child.path;
                  return (
                    <motion.button
                      key={child.path}
                      onClick={() => onChildClick(child.path)}
                      whileHover={{ x: 2 }}
                      className={`
                        relative w-full flex items-center gap-3 pl-[44px] pr-3 h-[42px] font-medium rounded-[10px] transition-all duration-200 cursor-pointer group/child mx-1.5
                        ${childActive
                          ? 'text-white'
                          : 'text-white/85 hover:text-white hover:bg-white/[0.03]'
                        }
                      `}
                      aria-current={childActive ? 'page' : undefined}
                    >
                      {/* Active child bar */}
                      {childActive && (
                        <motion.div
                          layoutId="sidebar-active-bar"
                          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.6)]"
                          transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.8 }}
                        />
                      )}

                      {/* Active child bg */}
                      {childActive && (
                        <motion.div
                          layoutId="sidebar-active-bg"
                          className="absolute inset-0 rounded-[10px] bg-gradient-to-r from-teal-500/14 via-teal-400/5 to-transparent border border-teal-500/10 shadow-[inset_0_1px_0_rgba(45,212,191,0.06)]"
                          transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.8 }}
                        />
                      )}

                      {/* Hierarchy node on the vertical line */}
                      <span
                        className={`absolute left-[17px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full border-2 transition-all duration-250 z-10 ${
                          childActive
                            ? 'bg-teal-400 border-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.7)] sidebar-node-pulse-animate'
                            : 'bg-[#0A0F1C] border-white/[0.15] group-hover/child:border-teal-400/40 group-hover/child:shadow-[0_0_8px_rgba(45,212,191,0.3)]'
                        }`}
                      />

                      {/* Child icon */}
                      <span
                        className={`
                          relative z-10 w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 transition-all duration-200
                          ${childActive
                            ? 'text-white'
                            : 'text-white/65 group-hover/child:text-white/85'
                          }
                        `}
                      >
                        <i className={`${child.icon} text-sm w-4 h-4 flex items-center justify-center`} />
                      </span>

                      {/* Child label */}
                      <span className="relative z-10 flex-1 min-w-0 text-left truncate text-[13px]">
                        {child.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              {/* Bottom inner glow line */}
              <div className="absolute bottom-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-teal-500/15 to-transparent" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}