import { motion } from 'framer-motion';
import SidebarTooltip from './SidebarTooltip';

interface SidebarHeaderProps {
  isExpanded: boolean;
  isCollapsed: boolean;
  onLogoClick: () => void;
}

const logoUrl = 'https://static.readdy.ai/image/96746b7ba583c55b81aa58d37fd022fd/d30ecbfba1611915e8b0a7d420f0fa0c.png';

export default function SidebarHeader({ isExpanded, isCollapsed, onLogoClick }: SidebarHeaderProps) {
  if (isCollapsed) {
    return (
      <div className="flex-shrink-0 flex flex-col items-center pt-6 pb-2 relative">
        {/* Ambient glow dot behind logo */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-teal-500/8 blur-xl sidebar-node-pulse-animate" />

        <SidebarTooltip label="SRO — Sistema de Reservas OLO" isVisible={true}>
          <button
            onClick={onLogoClick}
            className="relative w-12 h-12 flex items-center justify-center rounded-xl hover:bg-white/[0.04] transition-all duration-200 cursor-pointer group"
            aria-label="Ir al inicio"
          >
            <img
              src={logoUrl}
              alt="SRO"
              className="h-10 w-auto object-contain brightness-110 group-hover:brightness-125 transition-all duration-300"
            />
          </button>
        </SidebarTooltip>

        {/* Connection node dot */}
        <div className="mt-2 w-1.5 h-1.5 rounded-full bg-teal-400/30 sidebar-node-pulse-animate" />
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 relative">
      {/* Ambient radial glow behind logo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-teal-500/[0.04] blur-3xl sidebar-ambient-animate pointer-events-none" />

      <div className="relative px-5 pt-8 pb-4">
        <button
          onClick={onLogoClick}
          className="flex flex-col items-center gap-4 cursor-pointer group w-full"
          aria-label="Ir al inicio"
        >
          {/* Logo container with integrated glow */}
          <div className="relative">
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-2xl bg-teal-500/10 blur-md scale-125 sidebar-node-pulse-animate" />

            <div className="relative w-[72px] h-[72px] flex items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.08] group-hover:border-white/[0.16] group-hover:from-white/[0.08] group-hover:to-white/[0.04] transition-all duration-400 shadow-[0_0_30px_rgba(13,148,136,0.08)] group-hover:shadow-[0_0_40px_rgba(13,148,136,0.15)]">
              <img
                src={logoUrl}
                alt="SRO"
                className="h-[54px] w-auto object-contain brightness-110 group-hover:brightness-125 transition-all duration-400"
              />
            </div>
          </div>

          {/* Nombre y tagline */}
          <div className="flex flex-col gap-1 text-center">
            <motion.span
              initial={{ opacity: 1 }}
              className="text-[22px] font-extrabold text-white tracking-tight leading-none"
            >
              SRO
            </motion.span>
            <motion.span
              initial={{ opacity: 1 }}
              className="text-[12px] text-gray-400 font-medium leading-tight tracking-wide"
            >
              Sistema de Reservas OLO
            </motion.span>
          </div>
        </button>
      </div>

      {/* Decorative bottom line — flows into connection line system */}
      <div className="relative mx-5 mb-2">
        <div className="h-px bg-gradient-to-r from-transparent via-teal-400/25 to-transparent" />
        {/* Node dot centered on the line */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-teal-400/50 sidebar-node-pulse-animate" />
      </div>
    </div>
  );
}