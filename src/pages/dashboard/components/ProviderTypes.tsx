import DashboardCard from './DashboardCard';
import SectionHeader from './SectionHeader';
import type { ProviderTypeStats } from '../../../services/dashboardService';

interface ProviderTypesProps {
  stats: ProviderTypeStats;
  periodLabel: string;
  delay?: number;
}

export default function ProviderTypes({ stats, periodLabel, delay = 0 }: ProviderTypesProps) {
  const hasData = stats.total > 0;

  return (
    <DashboardCard delay={delay}>
      <SectionHeader
        title="Reservas por Tipo de Proveedor"
        action={<span className="text-xs text-gray-400">{periodLabel} · {stats.total} total</span>}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Nacional */}
        <div className="bg-emerald-50/60 rounded-xl p-3.5 border border-emerald-100/60">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="ri-home-4-line text-emerald-600 text-base w-4 h-4 flex items-center justify-center"></i>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Nacional</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-bold text-gray-900 tracking-tight">{stats.nacional}</span>
            <span className="text-xs font-semibold text-emerald-600">{stats.nacionalPct}%</span>
          </div>
          <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: hasData ? `${stats.nacionalPct}%` : '0%' }}
            ></div>
          </div>
        </div>

        {/* Importado */}
        <div className="bg-orange-50/60 rounded-xl p-3.5 border border-orange-100/60">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="ri-ship-line text-orange-600 text-base w-4 h-4 flex items-center justify-center"></i>
            </div>
            <span className="text-[11px] font-semibold text-orange-700 uppercase tracking-wide">Importado</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-bold text-gray-900 tracking-tight">{stats.importado}</span>
            <span className="text-xs font-semibold text-orange-600">{stats.importadoPct}%</span>
          </div>
          <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-700"
              style={{ width: hasData ? `${stats.importadoPct}%` : '0%' }}
            ></div>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}