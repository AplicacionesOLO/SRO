import { motion } from 'framer-motion';
import DashboardCard from './DashboardCard';
import SectionHeader from './SectionHeader';

interface WarehouseStat {
  name: string;
  reservations: number;
  docks: number;
}

interface WarehousePerformanceProps {
  warehouses: WarehouseStat[];
  periodLabel: string;
  delay?: number;
}

export default function WarehousePerformance({ warehouses, periodLabel, delay = 0 }: WarehousePerformanceProps) {
  if (warehouses.length === 0) return null;

  const maxReservations = Math.max(...warehouses.map(w => w.reservations), 1);

  return (
    <DashboardCard delay={delay}>
      <SectionHeader title="Rendimiento por Almacén" subtitle={periodLabel} />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2 pl-1">Almacén</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2">Reservas</th>
              <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2">Andenes</th>
              <th className="text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2 pr-1">Ocupación</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((warehouse, idx) => {
              const occupancy = Math.round((warehouse.reservations / maxReservations) * 100);
              return (
                <motion.tr
                  key={idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: delay + idx * 0.05 }}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="py-2 pl-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className="ri-building-2-line text-gray-500 text-xs w-3.5 h-3.5 flex items-center justify-center"></i>
                      </div>
                      <span className="text-xs font-medium text-gray-900">{warehouse.name}</span>
                    </div>
                  </td>
                  <td className="py-2 text-center">
                    <span className="text-xs font-semibold text-gray-900 tabular-nums">{warehouse.reservations}</span>
                  </td>
                  <td className="py-2 text-center">
                    <span className="text-xs text-gray-500 tabular-nums">{warehouse.docks}</span>
                  </td>
                  <td className="py-2 pr-1">
                    <div className="flex items-center justify-end gap-2.5">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${occupancy}%` }}
                          transition={{ duration: 0.6, delay: delay + idx * 0.05 + 0.1 }}
                          className="h-full bg-teal-500 rounded-full"
                        ></motion.div>
                      </div>
                      <span className="text-[10px] text-gray-500 w-6 text-right tabular-nums">{occupancy}%</span>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}