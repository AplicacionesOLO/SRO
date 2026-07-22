import { motion } from 'framer-motion';
import DashboardCard from './DashboardCard';
import SectionHeader from './SectionHeader';

interface StatusDistributionItem {
  name: string;
  code: string;
  count: number;
  color: string;
}

interface StatusDistributionProps {
  items: StatusDistributionItem[];
  totalReservations: number;
  delay?: number;
}

export default function StatusDistribution({ items, delay = 0 }: StatusDistributionProps) {
  const sortedItems = [...items].sort((a, b) => b.count - a.count);

  return (
    <DashboardCard delay={delay}>
      <SectionHeader title="Distribución por Estado" />
      <div className="space-y-2">
        {sortedItems.map((status, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: delay + idx * 0.03 }}
            className="flex items-center gap-2"
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: status.color }}
            ></div>
            <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">{status.name}</span>
            <span className="text-xs font-semibold text-gray-900 tabular-nums">{status.count}</span>
          </motion.div>
        ))}
      </div>
    </DashboardCard>
  );
}