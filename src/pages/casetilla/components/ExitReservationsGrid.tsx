
import { useState, useMemo } from 'react';

interface ExitEligibleReservation {
  id: string;
  dua: string | null;
  matricula: string;
  chofer: string;
  proveedor: string;
  almacen: string;
  orden_compra: string | null;
  fecha_ingreso: string;
  warehouse_id: string;
  provider_id: string;
}

interface ExitReservationsGridProps {
  reservations: ExitEligibleReservation[];
  onOpenExit: (reservation: ExitEligibleReservation) => void;
  isLoading: boolean;
}

export default function ExitReservationsGrid({
  reservations,
  onOpenExit,
  isLoading
}: ExitReservationsGridProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Filtrar reservas por búsqueda
  const filteredReservations = useMemo(() => {
    if (!searchTerm.trim()) return reservations;

    const term = searchTerm.toLowerCase();
    return reservations.filter(res => 
      (res.dua?.toLowerCase().includes(term)) ||
      res.chofer.toLowerCase().includes(term) ||
      res.matricula.toLowerCase().includes(term) ||
      res.proveedor.toLowerCase().includes(term) ||
      (res.orden_compra?.toLowerCase().includes(term))
    );
  }, [reservations, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-sm text-gray-600">Cargando reservas...</p>
        </div>
      </div>
    );
  }

  if (reservations.length === 0) {
    return (
      <div className="text-center py-12">
        <i className="ri-inbox-line text-6xl text-gray-400"></i>
        <h3 className="mt-4 text-lg font-semibold text-gray-700">No hay reservas elegibles</h3>
        <p className="mt-2 text-sm text-gray-600">
          No existen reservas que hayan arribado y estén pendientes de salida
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
          <input
            type="text"
            placeholder="Buscar por DUA, Chofer, Matrícula, Proveedor u OC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          )}
        </div>
      </div>

      {/* Contador de resultados */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {filteredReservations.length} {filteredReservations.length === 1 ? 'reserva encontrada' : 'reservas encontradas'}
        </span>
        {searchTerm && (
          <span className="text-emerald-600 font-medium">
            Filtrando por: "{searchTerm}"
          </span>
        )}
      </div>

      {filteredReservations.length === 0 ? (
        <div className="text-center py-8">
          <i className="ri-search-line text-5xl text-gray-400"></i>
          <p className="mt-3 text-sm text-gray-600">
            No se encontraron reservas con el término "{searchTerm}"
          </p>
        </div>
      ) : (
        <>
          {/* Vista Desktop: Tabla */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    DUA
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Matrícula
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Chofer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Proveedor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Almacén
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    OC
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Fecha Ingreso
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReservations.map((reservation) => (
                  <tr
                    key={reservation.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {reservation.dua || (
                        <span className="text-gray-400 italic">Sin DUA</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {reservation.matricula}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {reservation.chofer}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {reservation.proveedor}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {reservation.almacen}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {reservation.orden_compra || (
                        <span className="text-gray-400 italic">Sin OC</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {new Date(reservation.fecha_ingreso).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onOpenExit(reservation)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-logout-box-line"></i>
                        Registrar Salida
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista Mobile: Cards */}
          <div className="lg:hidden space-y-3">
            {filteredReservations.map((reservation) => (
              <div
                key={reservation.id}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="space-y-3">
                  {/* Header con matrícula */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <i className="ri-truck-line text-emerald-600 text-lg flex-shrink-0"></i>
                        <span className="font-bold text-gray-900 text-base truncate">
                          {reservation.matricula}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        {reservation.chofer}
                      </p>
                    </div>
                  </div>

                  {/* Información en grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500 block mb-0.5">DUA:</span>
                      <span className="text-gray-900 font-medium">
                        {reservation.dua || (
                          <span className="text-gray-400 italic">Sin DUA</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-0.5">OC:</span>
                      <span className="text-gray-900 font-medium">
                        {reservation.orden_compra || (
                          <span className="text-gray-400 italic">Sin OC</span>
                        )}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 block mb-0.5">Proveedor:</span>
                      <span className="text-gray-900 font-medium">
                        {reservation.proveedor}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 block mb-0.5">Almacén:</span>
                      <span className="text-gray-900 font-medium">
                        {reservation.almacen}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 block mb-0.5">Fecha Ingreso:</span>
                      <span className="text-gray-900 font-medium">
                        {new Date(reservation.fecha_ingreso).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Botón de acción */}
                  <button
                    onClick={() => onOpenExit(reservation)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <i className="ri-logout-box-line text-base"></i>
                    Registrar Salida
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
