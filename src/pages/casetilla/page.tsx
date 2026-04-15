import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useUserScope } from '../../hooks/useUserScope';
import { useActiveWarehouse } from '../../contexts/ActiveWarehouseContext';
import WarehousePageHeader from '../../components/feature/WarehousePageHeader';
import WarehouseSelector from '../../components/feature/WarehouseSelector';
import IngresoForm from './components/IngresoForm';
import PendingReservationsGrid from './components/PendingReservationsGrid';
import ExitReservationsGrid from './components/ExitReservationsGrid';
import ExitForm from './components/ExitForm';
import DurationReportGrid from './components/DurationReportGrid';
import { ConfirmModal } from '../../components/base/ConfirmModal';
import { casetillaService } from '../../services/casetillaService';
import type { PendingReservation, ExitEligibleReservation } from '../../types/casetilla';

const SESSION_KEY = 'casetilla_ui_state';
const FOTOS_INGRESO_KEY = 'casetilla_fotos_ingreso';
const FOTOS_SALIDA_KEY  = 'casetilla_fotos_salida';

type ViewMode = 'HOME' | 'INGRESO' | 'PENDIENTES' | 'SALIDA' | 'DURACION';

interface PersistedUIState {
  viewMode: ViewMode;
  fotosIngreso: string[];
  fotosSalida: string[];
  selectedReservation: PendingReservation | null;
  selectedExitReservation: ExitEligibleReservation | null;
}

const readSession = (): Partial<PersistedUIState> => {
  try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};
const writeSession = (state: PersistedUIState) => {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch { /* noop */ }
};
const clearSession = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(FOTOS_INGRESO_KEY);
    sessionStorage.removeItem(FOTOS_SALIDA_KEY);
  } catch { /* noop */ }
};

export default function CasetillaPage() {
  const { user } = useAuth();
  const { can, orgId: currentOrgId } = usePermissions();

  // ── SCOPE CENTRALIZADO — usa user_warehouse_access (tabla real) ──────────
  const {
    allowedWarehouseIds: scopeWarehouseIds,
    availableClients: scopeClients,
    loading: scopeLoading,
  } = useUserScope();

  const {
    activeWarehouse,
    allowedWarehouses,
    hasMultipleWarehouses,
    effectiveWarehouseIds,
    setActiveWarehouseId,
    loading: activeWhLoading,
  } = useActiveWarehouse();

  const [viewMode, setViewModeRaw] = useState<ViewMode>(() => readSession().viewMode || 'HOME');
  const [fotosIngreso, setFotosIngresoRaw] = useState<string[]>(() => {
    const s = readSession();
    if (s.fotosIngreso?.length) return s.fotosIngreso;
    try { const r = sessionStorage.getItem(FOTOS_INGRESO_KEY); if (r) { const u = JSON.parse(r) as string[]; if (u.length) return u; } } catch { /* noop */ }
    return [];
  });
  const [fotosSalida, setFotosSalidaRaw] = useState<string[]>(() => {
    const s = readSession();
    if (s.fotosSalida?.length) return s.fotosSalida;
    try { const r = sessionStorage.getItem(FOTOS_SALIDA_KEY); if (r) { const u = JSON.parse(r) as string[]; if (u.length) return u; } } catch { /* noop */ }
    return [];
  });
  const [selectedReservation, setSelectedReservationRaw] = useState<PendingReservation | null>(() => readSession().selectedReservation || null);
  const [selectedExitReservation, setSelectedExitReservationRaw] = useState<ExitEligibleReservation | null>(() => readSession().selectedExitReservation || null);

  const [pendingReservations, setPendingReservations] = useState<PendingReservation[]>([]);
  const [exitEligibleReservations, setExitEligibleReservations] = useState<ExitEligibleReservation[]>([]);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [isLoadingExitReservations, setIsLoadingExitReservations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [modal, setModal] = useState<{
    isOpen: boolean; type: 'success' | 'warning' | 'error' | 'info';
    title: string; message: string; showCancel: boolean;
    onConfirm: () => void; onCancel?: () => void;
  }>({ isOpen: false, type: 'success', title: '', message: '', showCancel: false, onConfirm: () => {}, onCancel: undefined });

  const orgId = currentOrgId || user?.orgId || null;
  const canView = can('casetilla.view');
  const canCreate = can('casetilla.create') || can('casetilla.manage');
  void canCreate;

  useEffect(() => {
    writeSession({ viewMode, fotosIngreso, fotosSalida, selectedReservation, selectedExitReservation });
  }, [viewMode, fotosIngreso, fotosSalida, selectedReservation, selectedExitReservation]);

  const setViewMode = useCallback((vm: ViewMode) => setViewModeRaw(vm), []);
  const setFotosIngreso = useCallback((urls: string[]) => {
    setFotosIngresoRaw(urls);
    try { const c = readSession(); sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...c, fotosIngreso: urls })); } catch { /* noop */ }
  }, []);
  const setFotosSalida = useCallback((urls: string[]) => {
    setFotosSalidaRaw(urls);
    try { const c = readSession(); sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...c, fotosSalida: urls })); } catch { /* noop */ }
  }, []);
  const setSelectedReservation = useCallback((r: PendingReservation | null) => setSelectedReservationRaw(r), []);
  const setSelectedExitReservation = useCallback((r: ExitEligibleReservation | null) => setSelectedExitReservationRaw(r), []);

  // ── Cargar datos SOLO cuando scope esté resuelto ─────────────────────────
  useEffect(() => {
    if (viewMode === 'PENDIENTES' && orgId && canView && !scopeLoading && !activeWhLoading) {
      loadPendingReservations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, orgId, canView, scopeLoading, activeWhLoading, selectedClientId, effectiveWarehouseIds]);

  useEffect(() => {
    if (viewMode === 'SALIDA' && orgId && canView && !scopeLoading && !activeWhLoading) {
      loadExitEligibleReservations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, orgId, canView, scopeLoading, activeWhLoading, selectedClientId, effectiveWarehouseIds]);

  const loadPendingReservations = async () => {
    if (!orgId) return;
    setIsLoadingReservations(true);
    try {
      const data = await casetillaService.getPendingReservations(orgId, effectiveWarehouseIds, selectedClientId);
      setPendingReservations(data);
    } catch { showModal('error', 'Error', 'No se pudieron cargar las reservas pendientes'); }
    finally { setIsLoadingReservations(false); }
  };

  const loadExitEligibleReservations = async () => {
    if (!orgId) return;
    setIsLoadingExitReservations(true);
    try {
      const data = await casetillaService.getExitEligibleReservations(orgId, effectiveWarehouseIds, selectedClientId);
      setExitEligibleReservations(data);
    } catch { showModal('error', 'Error', 'No se pudieron cargar las reservas elegibles para salida'); }
    finally { setIsLoadingExitReservations(false); }
  };

  const handleOpenIngresoFromPending = (reservation: PendingReservation) => {
    setFotosIngresoRaw([]); setSelectedReservation(reservation); setViewMode('INGRESO');
  };
  const handleOpenExitForm = (reservation: ExitEligibleReservation) => {
    setFotosSalidaRaw([]); setSelectedExitReservation(reservation); setViewMode('SALIDA');
  };

  const handleSubmitIngreso = async (data: any) => {
    if (!orgId || !user?.id) return;
    setIsSubmitting(true);
    try {
      await casetillaService.createIngreso(orgId, user.id, { ...data, fotos: fotosIngreso });
      setModal({ isOpen: true, type: 'success', title: 'Éxito', message: 'Ingreso registrado correctamente', showCancel: false,
        onConfirm: () => { setModal(prev => ({ ...prev, isOpen: false })); setSelectedReservation(null); setFotosIngresoRaw([]); clearSession(); setViewModeRaw('HOME'); }, onCancel: undefined });
    } catch (error: any) { showModal('error', 'Error', error.message || 'No se pudo registrar el ingreso'); }
    finally { setIsSubmitting(false); }
  };

  const handleSubmitSalida = async () => {
    if (!orgId || !user?.id || !selectedExitReservation) return;
    setIsSubmitting(true);
    try {
      await casetillaService.createSalida(orgId, user.id, selectedExitReservation.id, fotosSalida);
      setModal({ isOpen: true, type: 'success', title: 'Éxito', message: 'Salida registrada correctamente', showCancel: false,
        onConfirm: () => { setModal(prev => ({ ...prev, isOpen: false })); setSelectedExitReservation(null); setFotosSalidaRaw([]); clearSession(); setViewModeRaw('HOME'); }, onCancel: undefined });
    } catch (error: any) { showModal('error', 'Error', error.message || 'No se pudo registrar la salida'); }
    finally { setIsSubmitting(false); }
  };

  const showModal = (type: 'success' | 'warning' | 'error' | 'info', title: string, message: string, onConfirm?: () => void) => {
    const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
    setModal({ isOpen: true, type, title, message, showCancel: false, onConfirm: onConfirm || closeModal, onCancel: undefined });
  };

  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <i className="ri-lock-line text-6xl text-gray-400"></i>
          <h2 className="mt-4 text-xl font-semibold text-gray-700">Acceso Denegado</h2>
          <p className="mt-2 text-gray-600">No tienes permisos para acceder a Punto Control IN/OUT</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <WarehousePageHeader
          title="Punto Control IN/OUT"
          subtitle="Gestión de ingresos, salidas y reportes"
          activeWarehouse={activeWarehouse}
          allowedWarehouses={allowedWarehouses}
          hasMultipleWarehouses={hasMultipleWarehouses}
          onWarehouseChange={setActiveWarehouseId}
          loading={activeWhLoading}
        />

        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              {hasMultipleWarehouses && (
                <div className="mt-2">
                  <WarehouseSelector variant="chips" />
                </div>
              )}
            </div>
            {scopeClients.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  <i className="ri-user-line mr-1"></i>Cliente:
                </label>
                <select
                  value={selectedClientId ?? ''}
                  onChange={(e) => { setSelectedClientId(e.target.value || null); setViewModeRaw('HOME'); }}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white cursor-pointer min-w-[180px]"
                >
                  <option value="">Todos los clientes</option>
                  {scopeClients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
                {selectedClientId && (
                  <button onClick={() => { setSelectedClientId(null); setViewModeRaw('HOME'); }} className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer" title="Quitar filtro">
                    <i className="ri-close-circle-line text-lg"></i>
                  </button>
                )}
              </div>
            )}
          </div>
          {selectedClientId && scopeClients.length > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs text-teal-700 font-medium">
              <i className="ri-filter-line"></i>
              Filtrando por: {scopeClients.find(c => c.id === selectedClientId)?.name}
            </div>
          )}
        </div>

        {viewMode === 'HOME' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-amber-100 rounded-lg flex items-center justify-center">
                  <i className="ri-time-line text-2xl sm:text-3xl text-amber-600"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Reservas Pendientes</h2>
                  <p className="text-sm text-gray-600 mb-4">Consulte y registre el ingreso de reservas pendientes</p>
                  <button onClick={() => setViewMode('PENDIENTES')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap cursor-pointer">
                    <i className="ri-list-check"></i>Ver Pendientes
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <i className="ri-logout-box-line text-2xl sm:text-3xl text-emerald-600"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Registrar Salida</h2>
                  <p className="text-sm text-gray-600 mb-4">Registre la salida de vehículos que ya arribaron al almacén</p>
                  <button onClick={() => setViewMode('SALIDA')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer">
                    <i className="ri-logout-box-line"></i>Registrar Salida
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="ri-time-line text-2xl sm:text-3xl text-blue-600"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Duración en Punto Control</h2>
                  <p className="text-sm text-gray-600 mb-4">Reporte de tiempos de permanencia en el almacén</p>
                  <button onClick={() => setViewMode('DURACION')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer">
                    <i className="ri-bar-chart-line"></i>Ver Reporte
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'INGRESO' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <IngresoForm
              orgId={orgId!}
              initialData={{
                chofer: selectedReservation?.chofer || '',
                matricula: selectedReservation?.placa || '',
                dua: selectedReservation?.dua || '',
                factura: '',
                cedula: '',
                orden_compra: selectedReservation?.orden_compra || '',
                numero_pedido: selectedReservation?.numero_pedido || '',
                observaciones: selectedReservation?.notes || '',
                reservation_id: selectedReservation?.id || undefined,
              }}
              linkedReservation={selectedReservation}
              initialFotos={fotosIngreso} onFotosChange={setFotosIngreso} photoSessionKey={FOTOS_INGRESO_KEY}
              onSubmit={handleSubmitIngreso}
              onCancel={() => { setSelectedReservation(null); setFotosIngresoRaw([]); clearSession(); setViewModeRaw('HOME'); }}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {viewMode === 'PENDIENTES' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Reservas Pendientes</h2>
                  <p className="text-sm text-gray-600 mt-1">Seleccione una reserva para crear su ingreso</p>
                </div>
                <button onClick={() => { clearSession(); setViewModeRaw('HOME'); }} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer">
                  <i className="ri-arrow-left-line"></i>Volver
                </button>
              </div>
            </div>
            <PendingReservationsGrid reservations={pendingReservations} onOpenIngreso={handleOpenIngresoFromPending} isLoading={isLoadingReservations} />
          </div>
        )}

        {viewMode === 'SALIDA' && !selectedExitReservation && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Registrar Salida</h2>
                  <p className="text-sm text-gray-600 mt-1">Seleccione una reserva para registrar su salida</p>
                </div>
                <button onClick={() => { clearSession(); setViewModeRaw('HOME'); }} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer">
                  <i className="ri-arrow-left-line"></i>Volver
                </button>
              </div>
            </div>
            <ExitReservationsGrid reservations={exitEligibleReservations} onOpenExit={handleOpenExitForm} isLoading={isLoadingExitReservations} />
          </div>
        )}

        {viewMode === 'SALIDA' && selectedExitReservation && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <ExitForm
              orgId={orgId!} reservation={selectedExitReservation}
              initialFotos={fotosSalida} onFotosChange={setFotosSalida} photoSessionKey={FOTOS_SALIDA_KEY}
              onSubmit={handleSubmitSalida}
              onCancel={() => { setSelectedExitReservation(null); setFotosSalidaRaw([]); clearSession(); setViewModeRaw('SALIDA'); }}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {viewMode === 'DURACION' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Duración en Punto Control</h2>
                  <p className="text-sm text-gray-600 mt-1">Reporte de tiempos de permanencia</p>
                </div>
                <button onClick={() => { clearSession(); setViewModeRaw('HOME'); }} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer">
                  <i className="ri-arrow-left-line"></i>Volver
                </button>
              </div>
            </div>
            <DurationReportGrid orgId={orgId!} allowedWarehouseIds={effectiveWarehouseIds} clientId={selectedClientId} />
          </div>
        )}
      </div>

      <ConfirmModal isOpen={modal.isOpen} type={modal.type} title={modal.title} message={modal.message} showCancel={modal.showCancel} onConfirm={modal.onConfirm} onCancel={modal.onCancel} />
    </div>
  );
}
