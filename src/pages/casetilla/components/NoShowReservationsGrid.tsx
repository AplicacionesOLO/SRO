import { useState, useMemo } from 'react';
import type { NoShowReservation } from '../../../types/casetilla';

interface NoShowReservationsGridProps {
  reservations: NoShowReservation[];
  isLoading?: boolean;
}

const safeText = (v: any, fallback = '-') => {
  const s = (v ?? '').toString().trim();
  return s.length ? s : fallback;
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export default function NoShowReservationsGrid({ reservations, isLoading }: NoShowReservationsGridProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return reservations;
    const term = searchTerm.toLowerCase();
    return reservations.filter((r) =>
      r.dua?.toLowerCase().includes(term) ||
      r.chofer?.toLowerCase().includes(term) ||
      r.provider_name?.toLowerCase().includes(term) ||
      r.placa?.toLowerCase().includes(term)
    );
  }, [reservations, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-gray-500 animate-spin"></i>
          <p className="mt-2 text-gray-600">Cargando reservas No arribó...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por DUA, chofer, proveedor, placa..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <i className="ri-close-line"></i>
          </button>
        )}
      </div>

      <div className="text-sm text-gray-600">
        {filtered.length === reservations.length ? (
          <span>{reservations.length} reservas marcadas como No arribó</span>
        ) : (
          <span>{filtered.length} de {reservations.length} reservas</span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <i className="ri-user-unfollow-line text-5xl text-gray-400"></i>
          <p className="mt-2 text-gray-600 font-medium">
            {searchTerm ? 'No se encontraron reservas' : 'No hay reservas marcadas como No arribó'}
          </p>
          {searchTerm && <p className="text-sm text-gray-500 mt-1">Intenta con otro término de búsqueda</p>}
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">DUA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">MATRÍCULA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">CHOFER</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">PROVEEDOR</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">ALMACÉN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">CITA INICIO</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">CITA FIN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">MOTIVO</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">ESTADO</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((reservation) => (
                  <tr key={reservation.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">{safeText(reservation.dua)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{safeText(reservation.placa)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{safeText(reservation.chofer)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.provider_name, 'N/A')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.warehouse_name, 'N/A')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDateTime(reservation.start_datetime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDateTime(reservation.end_datetime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.motivo)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                        <i className="ri-user-unfollow-line"></i>
                        No arribó
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filtered.map((reservation) => (
              <div
                key={reservation.id}
                className="bg-white border border-gray-200 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase">DUA</span>
                      <span className="text-sm font-bold text-gray-900">{safeText(reservation.dua)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="ri-truck-line text-gray-400 text-sm"></i>
                      <span className="text-sm text-gray-900">{safeText(reservation.placa)}</span>
                    </div>
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                    <i className="ri-user-unfollow-line"></i>
                    No arribó
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Chofer:</span>
                    <p className="text-gray-900 font-medium truncate">{safeText(reservation.chofer)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Proveedor:</span>
                    <p className="text-gray-900 truncate">{safeText(reservation.provider_name)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Cita inicio:</span>
                    <p className="text-gray-900">{formatDateTime(reservation.start_datetime)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Cita fin:</span>
                    <p className="text-gray-900">{formatDateTime(reservation.end_datetime)}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <span className="text-gray-500 text-xs">Motivo:</span>
                  <p className="text-sm text-gray-700">{safeText(reservation.motivo)}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}