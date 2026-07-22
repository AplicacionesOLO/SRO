import { motion } from 'framer-motion';
import DashboardCard from './DashboardCard';

interface PeriodSummaryProps {
  todayCount: number;
  weekCount: number;
  monthCount: number;
  yearCount: number;
  activePreset: string;
  delay?: number;
}

const PERIODS = [
  { key: 'day', label: 'Hoy', icon: 'ri-sun-line', countKey: 'today' as const },
  { key: 'week', label: 'Esta semana', icon: 'ri-calendar-check-line', countKey: 'week' as const },
  { key: 'month', label: 'Este mes', icon: 'ri-calendar-2-line', countKey: 'month' as const },
] as const;

const EXTRA = { key: 'year_total' as const, label: 'Total anual', icon: 'ri-bar-chart-line', countKey: 'year' as const };

export default function PeriodSummary({ todayCount, weekCount, monthCount, yearCount, activePreset, delay = 0 }: PeriodSummaryProps) {
  const counts: Record<string, number> = { day: todayCount, week: weekCount, month: monthCount, year_total: yearCount };

  const allPeriods = [...PERIODS, EXTRA];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {allPeriods.map((period, idx) => {
        const isActive = activePreset === period.key;
        const count = counts[period.key] ?? 0;
        const isExtra = period.key === 'year_total';
        return (
          <DashboardCard key={period.key} delay={delay + idx * 0.03} className={isActive && !isExtra ? 'bg-teal-50/60 border-teal-100/60' : ''}>
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  isActive && !isExtra ? 'bg-teal-100' : 'bg-gray-100'
                }`}
              >
                <i className={`${period.icon} ${isActive && !isExtra ? 'text-teal-600' : 'text-gray-500'} text-base w-4 h-4 flex items-center justify-center`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: delay + idx * 0.03 + 0.1 }}
                  className="text-lg font-bold text-gray-900 tracking-tight"
                >
                  {count.toLocaleString()}
                </motion.p>
                <p className="text-[11px] text-gray-500">{period.label}</p>
              </div>
              {isActive && !isExtra && (
                <div className="ml-auto flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-teal-500 block"></span>
                </div>
              )}
            </div>
          </DashboardCard>
        );
      })}
    </div>
  );
}