import { motion } from 'framer-motion';
import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from 'recharts';
import DashboardCard from './DashboardCard';
import SectionHeader from './SectionHeader';

interface TrendDataItem {
  label: string;
  count: number;
}

interface TrendChartProps {
  data: TrendDataItem[];
  periodLabel: string;
  isCustom: boolean;
  delay?: number;
}

export default function TrendChart({ data, periodLabel, isCustom, delay = 0 }: TrendChartProps) {
  const maxCount = useMemo(() => Math.max(...data.map(d => d.count), 1), [data]);

  const chartData = useMemo(() => {
    return data.map(d => ({ name: d.label, value: d.count }));
  }, [data]);

  if (data.length === 0) {
    return (
      <DashboardCard delay={delay}>
        <SectionHeader title="Tendencia de reservas" subtitle={`— ${periodLabel}`} />
        <p className="text-sm text-gray-400 text-center py-12">Sin datos para este período</p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard delay={delay}>
      <SectionHeader
        title="Tendencia de reservas"
        subtitle={`— ${periodLabel}`}
        action={<span className="text-xs text-gray-400">{isCustom ? 'Por día/semana/mes' : 'Por día'}</span>}
      />
      <div className="h-48 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              allowDecimals={false}
              domain={[0, Math.ceil(maxCount * 1.15)]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-white border border-gray-100 rounded-lg shadow-lg px-3 py-2">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="text-sm font-semibold text-gray-900">{payload[0].value} reservas</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#0d9488"
              strokeWidth={2}
              fill="url(#trendGradient)"
              dot={{ r: 3, fill: '#0d9488', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 5, fill: '#0d9488', strokeWidth: 2, stroke: '#fff' }}
            >
              <LabelList
                dataKey="value"
                position="top"
                offset={8}
                fill="#9ca3af"
                fontSize={10}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}