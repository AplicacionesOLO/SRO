import { motion } from 'framer-motion';

interface SidebarSectionProps {
  label: string;
  isExpanded: boolean;
}

export default function SidebarSection({ label, isExpanded }: SidebarSectionProps) {
  if (!isExpanded) {
    return (
      <div className="py-3">
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="px-4 pt-7 pb-2.5"
    >
      <div className="flex items-center gap-2.5">
        {/* Node marker */}
        <span className="w-2 h-2 rounded-full bg-teal-400/50 flex-shrink-0 sidebar-node-pulse-animate shadow-[0_0_8px_rgba(45,212,191,0.4)]" />

        {/* Section title */}
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400 whitespace-nowrap">
          {label}
        </span>

        {/* Decorative line extending right */}
        <span className="flex-1 h-px bg-gradient-to-r from-teal-400/20 via-teal-400/10 to-transparent" />
      </div>
    </motion.div>
  );
}