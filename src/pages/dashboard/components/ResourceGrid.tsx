import { motion } from 'framer-motion';
import DashboardCard from './DashboardCard';
import SectionHeader from './SectionHeader';

interface Resource {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  suffix?: string;
  description: string;
}

interface ResourceGridProps {
  activeDocks: number;
  totalDocks: number;
  activeWarehouses: number;
  totalCollaborators: number;
  completionRate: number;
  delay?: number;
}

export default function ResourceGrid({ activeDocks, totalDocks, activeWarehouses, totalCollaborators, completionRate, delay = 0 }: ResourceGridProps) {
  const resources: Resource[] = [
    {
      icon: 'ri-truck-line',
      iconBg: '#eef2ff',
      iconColor: 'text-indigo-600',
      label: 'Andenes',
      value: String(activeDocks),
      suffix: `/${totalDocks}`,
      description: 'activos',
    },
    {
      icon: 'ri-building-2-line',
      iconBg: '#ecfdf5',
      iconColor: 'text-emerald-600',
      label: 'Almacenes',
      value: String(activeWarehouses),
      description: 'configurados',
    },
    {
      icon: 'ri-user-3-line',
      iconBg: '#fffbeb',
      iconColor: 'text-amber-600',
      label: 'Colaboradores',
      value: String(totalCollaborators),
      description: 'activos',
    },
    {
      icon: 'ri-percent-line',
      iconBg: '#fef2f2',
      iconColor: 'text-rose-600',
      label: 'Cumplimiento',
      value: `${completionRate}%`,
      description: 'finalizadas',
    },
  ];

  return (
    <DashboardCard delay={delay}>
      <SectionHeader title="Recursos Operativos" />
      <div className="grid grid-cols-2 gap-3">
        {resources.map((resource, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: delay + idx * 0.05 }}
            className="bg-gray-50/70 rounded-lg p-3 border border-gray-100/60 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: resource.iconBg }}
              >
                <i className={`${resource.icon} ${resource.iconColor} text-xs w-3.5 h-3.5 flex items-center justify-center`}></i>
              </div>
              <span className="text-[10px] text-gray-500 font-medium">{resource.label}</span>
            </div>
            <p className="text-lg font-bold text-gray-900 tracking-tight">
              {resource.value}
              {resource.suffix && <span className="text-xs font-normal text-gray-400 ml-0.5">{resource.suffix}</span>}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{resource.description}</p>
          </motion.div>
        ))}
      </div>
    </DashboardCard>
  );
}