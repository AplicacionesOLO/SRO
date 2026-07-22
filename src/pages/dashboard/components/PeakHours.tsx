import { motion } from 'framer-motion';
import DashboardCard from './DashboardCard';
import SectionHeader from './SectionHeader';

interface PeakHour {
  hour: string;
  count: number;
}

interface PeakHoursProps {
  hours: PeakHour[];
  periodLabel: string;
  delay?: number;
}

export default function PeakHours({ hours, periodLabel, delay = 0 }: PeakHoursProps) {
  if (hours.length === 0) {
    return (
      <DashboardCard delay={delay}>
        <SectionHeader title="Horas Pico" subtitle={periodLabel} />
        <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
      </DashboardCard>
    );
  }

  const maxCount = hours[0].count || 1;

  return (
    <DashboardCard delay={delay}>
      <SectionHeader title="Horas Pico" subtitle={periodLabel} />
      <div className="space-y-1.5">
        {hours.map((hour, idx) => {
          const percentage = maxCount > 0 ? (hour.count / maxCount) * 100 : 0;
          const isTop = idx === 0;
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: delay + idx * 0.04 }}
              className="flex items-center gap-2.5"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${isTop ? 'bg-red-50' : 'bg-gray-100'}`}>
                <i className={`ri-time-line ${isTop ? 'text-red-500' : 'text-gray-400'} text-[10px] w-3 h-3 flex items-center justify-center`}></i>
              </div>
              <span className="text-xs text-gray-700 w-10 flex-shrink-0">{hour.hour}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, delay: delay + idx * 0.04 + 0.1 }}
                  className={`h-full rounded-full ${isTop ? 'bg-red-400' : 'bg-gray-400'}`}
                ></motion.div>
              </div>
              <span className="text-xs font-semibold text-gray-900 w-5 text-right tabular-nums">{hour.count}</span>
            </motion.div>
          );
        })}
      </div>
    </DashboardCard>
  );
}