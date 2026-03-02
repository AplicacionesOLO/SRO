import { useState, useMemo } from 'react';

interface PendingReservation {
  id: string;
  dua: string;
  placa: string;
  chofer: string;
  orden_compra?: string;
  numero_pedido?: string;
  provider_name: string;
  warehouse_name: string;
  created_at: string;
}

interface PendingReservationsGridProps {
  reservations: PendingReservation[];
  onOpenIngreso: (reservation: PendingReservation) => void;
  isLoading?: boolean;
}

const safeText = (v: any, fallback = '-') => {
  const s = (v ?? '').toString().trim();
  return s.length ? s : fallback;
};

export default function PendingReservationsGrid({ reservations, onOpenIngreso, isLoading }: PendingReservationsGridProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredReservations = useMemo(() => {
    if (!searchTerm.trim()) return reservations;

    const term = searchTerm.toLowerCase();
    return reservations.filter((r) =>
      r.dua?.toLowerCase().includes(term) ||
      r.chofer?.toLowerCase().includes(term) ||
      r.provider_name?.toLowerCase().includes(term) ||
      r.placa?.toLowerCase().includes(term) ||
      (r.orden_compra ?? '').toLowerCase().includes(term)
    );
  }, [reservations, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
          <p className="mt-2 text-gray-600">Cargando reservas pendientes...</p>
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
          placeholder="Buscar por DUA, chofer, proveedor, placa, OC..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
        {filteredReservations.length === reservations.length ? (
          <span>{reservations.length} reservas pendientes</span>
        ) : (
          <span>
            {filteredReservations.length} de {reservations.length} reservas
          </span>
        )}
      </div>

      {filteredReservations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <i className="ri-inbox-line text-5xl text-gray-400"></i>
          <p className="mt-2 text-gray-600 font-medium">
            {searchTerm ? 'No se encontraron reservas' : 'No hay reservas pendientes'}
          </p>
          {searchTerm && <p className="text-sm text-gray-500 mt-1">Intenta con otro término de búsqueda</p>}
        </div>
      ) : (
        <>
          {/* Vista Desktop: Tabla con scroll horizontal */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">DUA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">MATRÍCULA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">CHOFER</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">PROVEEDOR</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">ALMACÉN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">OC</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">ACCIÓN</th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReservations.map((reservation) => (
                  <tr key={reservation.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">{safeText(reservation.dua)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{safeText(reservation.placa)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{safeText(reservation.chofer)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.provider_name, 'N/A')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.warehouse_name, 'N/A')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.orden_compra)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onOpenIngreso(reservation)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-login-box-line"></i>
                        Abrir Ingreso
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista Mobile: Cards */}
          <div className="md:hidden space-y-3">
            {filteredReservations.map((reservation) => (
              <div
                key={reservation.id}
                className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
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
                  <button
                    onClick={() => onOpenIngreso(reservation)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-login-box-line"></i>
                    Abrir
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Chofer:</span>
                    <p className="text-gray-900 font-medium truncate">{safeText(reservation.chofer)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">OC:</span>
                    <p className="text-gray-900 truncate">{safeText(reservation.orden_compra)}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <i className="ri-building-line text-gray-400"></i>
                    <span className="text-gray-600 truncate">{safeText(reservation.provider_name, 'N/A')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <i className="ri-store-line text-gray-400"></i>
                    <span className="text-gray-600 truncate">{safeText(reservation.warehouse_name, 'N/A')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
