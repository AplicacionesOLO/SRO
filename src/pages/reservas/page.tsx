import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { calendarService, type Reservation } from '../../services/calendarService';
import { providersService } from '../../services/providersService';
import ReservationModal from '../calendario/components/ReservationModal';

export default function ReservasPage() {
  const { can, orgId, loading: permLoading } = usePermissions();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [docks, setDocks] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortField, setSortField] = useState<'start_datetime' | 'created_at'>('start_datetime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Modal de confirmación de eliminación
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    reservationId: string | null;
    reservationName: string;
  }>({
    isOpen: false,
    reservationId: null,
    reservationName: ''
  });

  const canView = useMemo(() => can('reservations.view'), [can]);
  const canCreate = useMemo(() => can('reservations.create'), [can]);
  const canUpdate = useMemo(() => can('reservations.update'), [can]);
  const canDelete = useMemo(() => can('reservations.delete'), [can]);

  const loadData = useCallback(async () => {
    if (!orgId) return;

    try {
      setLoading(true);

      // Cargar últimos 3 meses de reservas
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3);

      const [reservationsData, docksData, statusesData, providersData] = await Promise.all([
        calendarService.getReservations(orgId, startDate.toISOString(), endDate.toISOString()),
        calendarService.getDocks(orgId),
        calendarService.getReservationStatuses(orgId),
        providersService.getActive(orgId),
      ]);

      setReservations(reservationsData);
      setDocks(docksData);
      setStatuses(statusesData);
      setProviders(providersData);

    } catch (error: any) {
      console.error('[Reservas] loadError', error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const ready = useMemo(() => !!orgId && !permLoading, [orgId, permLoading]);

  useEffect(() => {
    if (!ready) return;
    loadData();
  }, [ready, loadData]);

  const getProviderName = useCallback(
    (value: string | null | undefined) => {
      if (!value) return '-';
      const p = providers.find((x: any) => x.id === value);
      return p?.name || value; // si no coincide, lo deja tal cual (por si ya venía como nombre)
    },
    [providers]
  );

  const filteredReservations = useMemo(() => {
    let filtered = [...reservations];

    // Filtro de búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((r) =>
        r.dua?.toLowerCase().includes(term) ||
        r.invoice?.toLowerCase().includes(term) ||
        r.driver?.toLowerCase().includes(term) ||
        r.purchase_order?.toLowerCase().includes(term) ||
        r.shipper_provider?.toLowerCase().includes(term) ||
        r.truck_plate?.toLowerCase().includes(term)
      );
    }

    // Filtro de estado
    if (filterStatus !== 'all') {
      filtered = filtered.filter((r) => r.status_id === filterStatus);
    }

    // Filtro de fecha desde
    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((r) => new Date(r.start_datetime) >= fromDate);
    }

    // Filtro de fecha hasta
    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((r) => new Date(r.start_datetime) <= toDate);
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      const aValue = new Date(a[sortField]).getTime();
      const bValue = new Date(b[sortField]).getTime();
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return filtered;
  }, [reservations, searchTerm, filterStatus, filterDateFrom, filterDateTo, sortField, sortOrder]);

  const paginatedReservations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredReservations.slice(startIndex, endIndex);
  }, [filteredReservations, currentPage]);

  const totalPages = Math.ceil(filteredReservations.length / itemsPerPage);

  const handleSort = (field: 'start_datetime' | 'created_at') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleCreate = () => {
    setSelectedReservation(null);
    setIsModalOpen(true);
  };

  const handleEdit = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setIsModalOpen(true);
  };

  const handleDelete = async (reservation: Reservation) => {
    if (!canDelete) {
      setDeleteModal({
        isOpen: true,
        reservationId: null,
        reservationName: 'Sin permisos'
      });
      return;
    }

    setDeleteModal({
      isOpen: true,
      reservationId: reservation.id,
      reservationName: `${reservation.purchase_order || 'Reserva'} - ${getProviderName(reservation.shipper_provider)}`
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.reservationId) return;

    try {
      await calendarService.deleteReservation(deleteModal.reservationId);
      await loadData();
      setDeleteModal({ isOpen: false, reservationId: null, reservationName: '' });
    } catch (error) {
      console.error('[Reservas] deleteError', error);
      setDeleteModal({ isOpen: false, reservationId: null, reservationName: '' });
    }
  };

  const cancelDelete = () => {
    setDeleteModal({ isOpen: false, reservationId: null, reservationName: '' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDockName = (dockId: string) => {
    const dock = docks.find((d) => d.id === dockId);
    return dock?.name || '-';
  };

  const getStatusInfo = (statusId: string | null) => {
    if (!statusId) return { name: 'Sin estado', color: '#6B7280' };
    const status = statuses.find((s) => s.id === statusId);
    return status || { name: 'Sin estado', color: '#6B7280' };
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setCurrentPage(1);
  };

  if (permLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-teal-600 animate-spin"></i>
          <p className="mt-4 text-gray-600">Cargando reservas...</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">No tienes permisos para ver las reservas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reservas</h1>
            <p className="text-sm text-gray-600 mt-1">
              Gestión completa de reservas de andenes
            </p>
          </div>
          {canCreate && (
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Reserva
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <input
              type="text"
              placeholder="Buscar por DUA, Factura, Chofer, OC, Proveedor, Placa..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-sm"
          >
            <option value="all">Todos los estados</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => {
              setFilterDateFrom(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Desde"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-sm"
          />

          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => {
              setFilterDateTo(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Hasta"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-sm"
          />
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Mostrando {paginatedReservations.length} de {filteredReservations.length} reservas
          </div>
          {(searchTerm || filterStatus !== 'all' || filterDateFrom || filterDateTo) && (
            <button
              onClick={clearFilters}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              <i className="ri-close-circle-line mr-1"></i>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    ID
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('start_datetime')}
                  >
                    <div className="flex items-center gap-1">
                      Fecha/Hora
                      {sortField === 'start_datetime' && (
                        <i className={`ri-arrow-${sortOrder === 'asc' ? 'up' : 'down'}-s-line`}></i>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Andén
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Orden Compra
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Proveedor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Chofer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    DUA
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Placa
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedReservations.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center">
                      <i className="ri-inbox-line text-4xl text-gray-300 mb-2 w-10 h-10 flex items-center justify-center mx-auto"></i>
                      <p className="text-gray-500">No se encontraron reservas</p>
                      {canCreate && (
                        <button
                          onClick={handleCreate}
                          className="mt-4 text-sm text-teal-600 hover:text-teal-700 font-medium"
                        >
                          Crear primera reserva
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedReservations.map((reservation) => {
                    const statusInfo = getStatusInfo(reservation.status_id);
                    return (
                      <tr key={reservation.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                          #{reservation.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {formatDateTime(reservation.start_datetime)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {getDockName(reservation.dock_id)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white whitespace-nowrap"
                            style={{ backgroundColor: statusInfo.color }}
                          >
                            {statusInfo.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {reservation.purchase_order || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {getProviderName(reservation.shipper_provider)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {reservation.driver || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {reservation.dua || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {reservation.truck_plate || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canUpdate && (
                              <button
                                onClick={() => handleEdit(reservation)}
                                className="p-1.5 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                                title="Editar"
                              >
                                <i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(reservation)}
                                className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Eliminar"
                              >
                                <i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Página {currentPage} de {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <i className="ri-skip-back-mini-line"></i>
              </button>
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <i className="ri-arrow-left-s-line"></i>
              </button>
              <span className="px-4 py-1.5 text-sm text-gray-700">
                {currentPage}
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <i className="ri-arrow-right-s-line"></i>
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <i className="ri-skip-forward-mini-line"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <ReservationModal
          isOpen={isModalOpen}
          reservation={selectedReservation}
          defaults={null}
          docks={docks}
          statuses={statuses}
          orgId={orgId!}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedReservation(null);
          }}
          onSave={async () => {
            setIsModalOpen(false);
            setSelectedReservation(null);
            await loadData();
          }}
        />
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
                <i className="ri-alert-line text-2xl text-red-600 w-6 h-6 flex items-center justify-center"></i>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                {deleteModal.reservationId ? 'Confirmar Eliminación' : 'Sin Permisos'}
              </h3>

              <p className="text-sm text-gray-600 text-center mb-6">
                {deleteModal.reservationId ? (
                  <>
                    ¿Estás seguro de que deseas eliminar la reserva <strong>{deleteModal.reservationName}</strong>?
                    <br />
                    Esta acción no se puede deshacer.
                  </>
                ) : (
                  'No tienes permisos para eliminar reservas.'
                )}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={cancelDelete}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  {deleteModal.reservationId ? 'Cancelar' : 'Entendido'}
                </button>
                {deleteModal.reservationId && (
                  <button
                    onClick={confirmDelete}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
