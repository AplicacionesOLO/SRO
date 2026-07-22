import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface DashboardCardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
  delay?: number;
}

export default function DashboardCard({ children, className = '', noPadding = false, delay = 0 }: DashboardCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.25, 0.1, 0.25, 1] }}
      whileHover={{ y: -2 }}
      className={`bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] transition-shadow duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] ${noPadding ? '' : 'p-4'} ${className}`}
    >
      {children}
    </motion.div>
  );
}