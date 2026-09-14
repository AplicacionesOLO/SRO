import { useState, useEffect, useMemo } from 'react';
import type { ResourceCategory } from '@/types/manpowerResource';
import type { ForecastResourceAllocation } from '@/types/manpowerForecast';
import { computeDurationHours } from '@/services/manpowerForecastService';

interface DurationCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ResourceCategory[];
  initialBultos?: number | null;
  initialAllocations?: ForecastResourceAllocation[];
}

interface CalcRow {
  key: number;
  category_id: string;
  quantity: number;
}

function formatDuration(hours: number | null | undefined): string {
  if (hours == null) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export default function DurationCalculator({
  isOpen,
  onClose,
  categories,
  initialBultos,
  initialAllocations,
}: DurationCalculatorProps) {
  const [bultos, setBultos] = useState<number>(0);
  const [rows, setRows] = useState<CalcRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  useEffect(() => {
    if (isOpen) {
      setBultos(initialBultos ?? 0);
      const initialRows: CalcRow[] = (initialAllocations && initialAllocations.length > 0
        ? initialAllocations
        : []
      ).map((a, idx) => ({ key: idx + 1, category_id: a.category_id, quantity: a.quantity }));
      setRows(initialRows);
      setNextKey((initialRows.length || 0) + 1);
    }
  }, [isOpen, initialBultos, initialAllocations]);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const allocations = useMemo(
    () =>
      rows.map((r) => {
        const cat = categoryById.get(r.category_id);
        return { quantity: r.quantity, rate_per_hour: cat?.rate_per_hour ?? null };
      }),
    [rows, categoryById]
  );

  const totalThroughput = allocations.reduce(
    (sum, a) => sum + (a.quantity || 0) * (a.rate_per_hour ?? 0),
    0
  );

  const durationHours = computeDurationHours(bultos, allocations);

  // Duración de referencia (pronóstico mínimo original)
  const baselineHours = useMemo(() => {
    if (!initialAllocations || initialAllocations.length === 0) return null;
    return computeDurationHours(
      initialBultos ?? null,
      initialAllocations.map((a) => ({ quantity: a.quantity, rate_per_hour: a.rate_per_hour }))
    );
  }, [initialAllocations, initialBultos]);

  if (!isOpen) return null;

  const addRow = () => {
    const defaultCat = categories[0];
    if (!defaultCat) return;
    setRows((prev) => [...prev, { key: nextKey, category_id: defaultCat.id, quantity: 1 }]);
    setNextKey((k) => k + 1);
  };

  const updateCategory = (key: number, categoryId: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, category_id: categoryId } : r)));
  };

  const updateQuantity = (key: number, delta: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, quantity: Math.max(0, r.quantity + delta) } : r
      )
    );
  };

  const removeRow = (key: number) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const deltaText = () => {
    if (baselineHours == null || durationHours == null) return null;
    const delta = durationHours - baselineHours;
    const pct = baselineHours > 0 ? (delta / baselineHours) * 100 : 0;
    if (Math.abs(delta) < 0.01) return 'Sin cambio respecto al pronóstico mínimo';
    const dir = delta < 0 ? 'más rápido' : 'más lento';
    return `${Math.abs(pct).toFixed(0)}% ${dir} (${formatDuration(Math.abs(delta))})`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Calculadora de duración</h3>
            <p className="text-sm text-gray-500">Simulá agregar o quitar recursos y mirá cómo cambia el tiempo</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-6">
          {/* Bultos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bultos (o cantidad)</label>
              <input
                type="number"
                min={0}
                value={bultos}
                onChange={(e) => setBultos(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="flex flex-col justify-end">
              <div className="text-sm text-gray-500 mb-1.5">Ritmo total</div>
              <div className="text-lg font-semibold text-gray-900">
                {totalThroughput > 0 ? `${totalThroughput.toFixed(1)} unidades/h` : '—'}
              </div>
            </div>
          </div>

          {/* Recursos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Recursos</label>
              <button
                onClick={addRow}
                disabled={categories.length === 0}
                className="px-3 py-1.5 text-sm font-medium text-teal-700 border border-teal-300 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              >
                <i className="ri-add-line text-base w-4 h-4 flex items-center justify-center"></i>
                Agregar recurso
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 text-center">
                <p className="text-gray-500 text-sm">Agregá recursos para calcular la duración</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((r) => {
                  const cat = categoryById.get(r.category_id);
                  return (
                    <div
                      key={r.key}
                      className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3"
                    >
                      <select
                        value={r.category_id}
                        onChange={(e) => updateCategory(r.key, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(r.key, -1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <i className="ri-subtract-line"></i>
                        </button>
                        <span className="w-10 text-center text-sm font-semibold text-gray-900">
                          {r.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(r.key, 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <i className="ri-add-line"></i>
                        </button>
                      </div>

                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {cat?.rate_per_hour != null ? `${cat.rate_per_hour} u/h` : 'sin ritmo'}
                      </span>

                      <button
                        onClick={() => removeRow(r.key)}
                        className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Quitar"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resultado */}
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-5">
            <div className="text-sm text-teal-700 mb-1">Duración estimada</div>
            <div className="text-3xl font-bold text-teal-900">{formatDuration(durationHours)}</div>
            {deltaText() && <div className="mt-2 text-sm text-teal-700">{deltaText()}</div>}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}