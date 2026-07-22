import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import DashboardCard from './DashboardCard';

interface QuickAction {
  label: string;
  description: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  hoverBorder: string;
  path: string;
}

const ACTIONS: QuickAction[] = [
  {
    label: 'Nueva Reserva',
    description: 'Crear reservación',
    icon: 'ri-add-line',
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    hoverBorder: 'hover:border-teal-200',
    path: '/calendario',
  },
  {
    label: 'Ver Andenes',
    description: 'Estado actual',
    icon: 'ri-truck-line',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    hoverBorder: 'hover:border-indigo-200',
    path: '/andenes',
  },
  {
    label: 'Casetilla',
    description: 'Control de ingreso',
    icon: 'ri-door-open-line',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    hoverBorder: 'hover:border-amber-200',
    path: '/casetilla',
  },
];

export default function QuickActions({ delay = 0 }: { delay?: number }) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {ACTIONS.map((action, idx) => (
        <DashboardCard
          key={action.path}
          noPadding
          delay={delay + idx * 0.05}
          className={`p-4 cursor-pointer ${action.hoverBorder}`}
        >
          <button
            onClick={() => navigate(action.path)}
            className="w-full flex items-center gap-3 text-left group"
          >
            <div className={`w-10 h-10 ${action.iconBg} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
              <i className={`${action.icon} ${action.iconColor} text-lg w-5 h-5 flex items-center justify-center`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-800 transition-colors">{action.label}</p>
              <p className="text-[11px] text-gray-500">{action.description}</p>
            </div>
            <i className="ri-arrow-right-s-line text-gray-300 group-hover:text-gray-500 transition-colors w-4 h-4 flex items-center justify-center"></i>
          </button>
        </DashboardCard>
      ))}
    </div>
  );
}