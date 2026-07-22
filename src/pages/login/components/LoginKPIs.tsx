import { motion } from 'framer-motion';

const kpis = [
  {
    label: 'Reservas hoy',
    value: '142',
    change: '+12% vs ayer',
    icon: 'ri-calendar-check-line',
    positive: true,
  },
  {
    label: 'Vehículos en operación',
    value: '18',
    change: 'En tiempo real',
    icon: 'ri-truck-line',
    positive: true,
  },
  {
    label: 'Tiempo promedio',
    value: '01:12',
    change: 'hrs por operación',
    icon: 'ri-time-line',
    positive: true,
  },
];

export default function LoginKPIs() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {kpis.map((kpi, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 + i * 0.12, duration: 0.5 }}
          className="login-glass rounded-xl p-3 lg:p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-sro-teal/10 flex items-center justify-center">
              <i className={`${kpi.icon} text-sro-teal text-xs w-4 h-4 flex items-center justify-center`} />
            </div>
          </div>
          <div className="text-xs text-white/40 mb-1 leading-tight">{kpi.label}</div>
          <div className="text-xl lg:text-2xl font-semibold text-white tracking-tight font-mono">
            {kpi.value}
          </div>
          <div className="flex items-center gap-1 mt-1">
            {kpi.positive && (
              <i className="ri-arrow-up-line text-sro-teal text-[10px] w-3 h-3 flex items-center justify-center" />
            )}
            <span className="text-[11px] text-sro-teal/70">{kpi.change}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}