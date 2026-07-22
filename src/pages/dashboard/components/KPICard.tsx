import { motion } from 'framer-motion';
import DashboardCard from './DashboardCard';

interface KPICardProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  value: string | number;
  label: string;
  trend?: number;
  trendLabel?: string;
  badge?: string;
  badgeColor?: string;
  badgeBg?: string;
  delay?: number;
}

export default function KPICard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
  trend,
  trendLabel,
  badge,
  badgeColor,
  badgeBg,
  delay = 0,
}: KPICardProps) {
  const trendUp = trend !== undefined && trend >= 0;
  const trendDown = trend !== undefined && trend < 0;

  return (
    <DashboardCard delay={delay}>
      <div className="flex items-start justify-between mb-1">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <i className={`${icon} ${iconColor} text-base w-4 h-4 flex items-center justify-center`}></i>
        </div>
        <div className="flex flex-col items-end gap-1">
          {badge !== undefined && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ color: badgeColor, backgroundColor: badgeBg }}
            >
              {badge}
            </span>
          )}
          {trend !== undefined && trendLabel && (
            <div className={`flex items-center gap-0.5 text-[10px] font-medium ${trendUp ? 'text-emerald-600' : trendDown ? 'text-red-500' : 'text-gray-400'}`}>
              <i className={trendUp ? 'ri-arrow-up-s-line' : trendDown ? 'ri-arrow-down-s-line' : 'ri-subtract-line'}></i>
              <span>{Math.abs(trend)}%</span>
              <span className="text-gray-400 font-normal ml-0.5">{trendLabel}</span>
            </div>
          )}
        </div>
      </div>
      <motion.p
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: delay + 0.15 }}
        className="text-xl font-bold text-gray-900 tracking-tight"
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </motion.p>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{label}</p>
    </DashboardCard>
  );
}