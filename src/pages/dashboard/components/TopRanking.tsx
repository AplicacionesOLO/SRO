import { motion } from 'framer-motion';
import DashboardCard from './DashboardCard';
import SectionHeader from './SectionHeader';

interface RankingItem {
  name: string;
  count: number;
}

interface TopRankingProps {
  title: string;
  subtitle?: string;
  items: RankingItem[];
  icon: string;
  iconActiveBg: string;
  iconActiveColor: string;
  delay?: number;
}

const RANK_COLORS = [
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-100' },
  { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-100' },
];

export default function TopRanking({ title, subtitle, items, icon, iconActiveBg, iconActiveColor, delay = 0 }: TopRankingProps) {
  if (items.length === 0) {
    return (
      <DashboardCard delay={delay}>
        <SectionHeader title={title} subtitle={subtitle} />
        <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard delay={delay}>
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="space-y-1.5">
        {items.map((item, idx) => {
          const rankStyle = RANK_COLORS[idx] || RANK_COLORS[4];
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: delay + idx * 0.04 }}
              className="flex items-center gap-2.5 group"
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold border ${rankStyle.bg} ${rankStyle.text} ${rankStyle.border} flex-shrink-0`}
              >
                {idx + 1}
              </span>
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${idx === 0 ? iconActiveBg : 'bg-gray-100'}`}
              >
                <i className={`${icon} ${idx === 0 ? iconActiveColor : 'text-gray-400'} text-[10px] w-3 h-3 flex items-center justify-center`}></i>
              </div>
              <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">{item.name}</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{item.count}</span>
            </motion.div>
          );
        })}
      </div>
    </DashboardCard>
  );
}