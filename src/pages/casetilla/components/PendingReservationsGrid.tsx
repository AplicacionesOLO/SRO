import { useState, useMemo, useCallback } from 'react';

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
  notes?: string | null;
  start_datetime?: string | null;
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

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
           d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

export default function PendingReservationsGrid({ reservations, onOpenIngreso, isLoading }: PendingReservationsGridProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredReservation, setHoveredReservation] = useState<PendingReservation | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  const filteredReservations = useMemo(() => {
    if (!searchTerm.trim()) return reservations;

    const term = searchTerm.toLowerCase();
    return reservations.filter((r) =>
      r.dua?.toLowerCase().includes(term) ||
      r.chofer?.toLowerCase().includes(term) ||
      r.provider_name?.toLowerCase().includes(term) ||
      r.placa?.toLowerCase().includes(term) ||
      (r.orden_compra ?? '').toLowerCase().includes(term) ||
      (r.notes ?? '').toLowerCase().includes(term)
    );
  }, [reservations, searchTerm]);

  const handleRowEnter = useCallback((reservation: PendingReservation, e: React.MouseEvent) => {
    setHoveredReservation(reservation);
    setPopupPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRowMove = useCallback((e: React.MouseEvent) => {
    // Si el mouse está en la zona derecha (donde está el botón de acción), ocultamos el popup
    if (e.clientX > window.innerWidth - 180) {
      setHoveredReservation(null);
      return;
    }
    // Posicionamos el popup a la izquierda del cursor para no tapar los botones de la derecha
    setPopupPos({ x: e.clientX - 340, y: e.clientY });
  }, []);

  const handleRowLeave = useCallback(() => {
    setHoveredReservation(null);
  }, []);

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
          <span>{reservations.length} reservas pendientes / confirmadas</span>
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
            {searchTerm ? 'No se encontraron reservas' : 'No hay reservas pendientes ni confirmadas'}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">INICIO CITA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">OBSERVACIONES</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">ACCIÓN</th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReservations.map((reservation) => (
                  <tr
                    key={reservation.id}
                    className="hover:bg-gray-50 transition-colors relative"
                    onMouseEnter={(e) => handleRowEnter(reservation, e)}
                    onMouseMove={handleRowMove}
                    onMouseLeave={handleRowLeave}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">{safeText(reservation.dua)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{safeText(reservation.placa)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{safeText(reservation.chofer)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.provider_name, 'N/A')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.warehouse_name, 'N/A')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{safeText(reservation.orden_compra)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {reservation.start_datetime ? formatDate(reservation.start_datetime) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px]">
                      {reservation.notes ? (
                        <span className="block truncate" title={reservation.notes}>{reservation.notes}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
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
                  {reservation.start_datetime && (
                    <div className="col-span-2">
                      <span className="text-gray-500 text-xs">Inicio Cita:</span>
                      <p className="text-gray-900 text-sm font-medium">{formatDate(reservation.start_datetime)}</p>
                    </div>
                  )}
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
                  {reservation.notes && (
                    <div className="flex items-start gap-2 text-xs">
                      <i className="ri-chat-1-line text-gray-400 mt-0.5 flex-shrink-0"></i>
                      <span className="text-gray-600">{reservation.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── Hover Popup: todos los datos de la reserva (solo desktop) ─── */}
      {hoveredReservation && (
        <div
          className="hidden md:block fixed z-50 pointer-events-none"
          style={{
            left: Math.max(8, popupPos.x),
            top: Math.min(popupPos.y - 10, window.innerHeight - 380),
          }}
        >
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-5 w-[320px] animate-in fade-in zoom-in-95 duration-150">
            {/* Cabecera */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <i className="ri-file-list-3-line text-teal-600 text-lg"></i>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">Reserva #{hoveredReservation.id.slice(-8).toUpperCase()}</p>
                <p className="text-xs text-gray-500">{formatDate(hoveredReservation.created_at)}</p>
              </div>
            </div>

            {/* Campos */}
            <div className="space-y-2.5">
              <FieldRow icon="ri-file-copy-line" label="DUA" value={hoveredReservation.dua} />
              <FieldRow icon="ri-car-line" label="Matrícula" value={hoveredReservation.placa} />
              <FieldRow icon="ri-user-line" label="Chofer" value={hoveredReservation.chofer} />
              <FieldRow icon="ri-building-line" label="Proveedor" value={hoveredReservation.provider_name} fallback="N/A" />
              <FieldRow icon="ri-store-line" label="Almacén" value={hoveredReservation.warehouse_name} fallback="N/A" />
              <FieldRow icon="ri-file-text-line" label="OC" value={hoveredReservation.orden_compra} />
              <FieldRow icon="ri-hashtag" label="N° Pedido" value={hoveredReservation.numero_pedido} />
              <FieldRow icon="ri-calendar-event-line" label="Inicio Cita" value={hoveredReservation.start_datetime ? formatDate(hoveredReservation.start_datetime) : ''} />
              <FieldRow icon="ri-chat-1-line" label="Observaciones" value={hoveredReservation.notes} fullWidth />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper: fila de campo para el hover popup ───
function FieldRow({ icon, label, value, fallback, fullWidth }: {
  icon: string;
  label: string;
  value?: string | null;
  fallback?: string;
  fullWidth?: boolean;
}) {
  const display = (value ?? '').trim();
  const fb = fallback || '-';

  return (
    <div className={`flex gap-2.5 ${fullWidth ? 'items-start' : 'items-center'}`}>
      <div className="w-7 h-7 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0">
        <i className={`${icon} text-gray-500 text-xs`}></i>
      </div>
      <div className={`min-w-0 ${fullWidth ? 'flex-1' : 'flex items-center gap-1.5 flex-1'}`}>
        <span className="text-xs text-gray-400 font-medium flex-shrink-0">{label}:</span>
        {display ? (
          <span className={`text-xs text-gray-800 font-medium ${fullWidth ? 'block break-words' : 'truncate'}`}>
            {display}
          </span>
        ) : (
          <span className="text-xs text-gray-300">{fb}</span>
        )}
      </div>
    </div>
  );
}