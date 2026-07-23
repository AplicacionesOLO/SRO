import { motion } from 'framer-motion';

interface SidebarTooltipProps {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
  isVisible: boolean;
}

export default function SidebarTooltip({ label, shortcut, children, isVisible }: SidebarTooltipProps) {
  return (
    <div className="relative group/tooltip flex items-center justify-center">
      {children}
      {isVisible && (
        <div className="absolute left-full ml-3 px-4 py-2.5 rounded-xl bg-[#111827] border border-white/[0.08] shadow-2xl pointer-events-none z-[120] min-w-max opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 translate-x-1 group-hover/tooltip:translate-x-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold text-gray-200 whitespace-nowrap">{label}</span>
            {shortcut && (
              <kbd className="px-2 py-0.5 rounded-md bg-white/[0.05] text-teal-400 text-[11px] font-semibold border border-white/[0.06]">
                {shortcut}
              </kbd>
            )}
          </div>
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2.5 h-2.5 bg-[#111827] border-l border-b border-white/[0.08] rotate-45" />
        </div>
      )}
    </div>
  );
}