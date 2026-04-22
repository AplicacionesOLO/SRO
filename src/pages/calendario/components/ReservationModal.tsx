import { useState, useEffect, useCallback, useRef } from 'react';
import React from 'react';
import SearchSelect from '../../../components/base/SearchSelect';
import { Dock } from '../../../types/dock';
import { useAuth } from '../../../contexts/AuthContext';
import { calendarService, type Reservation } from '../../../services/calendarService';
import { ActivityTab } from './ActivityTab';
import { providersService } from '../../../services/providersService';
import { cargoTypesService } from '../../../services/cargoTypesService';
import { timeProfilesService } from '../../../services/timeProfilesService';
import { userProvidersService, type UserProvider } from '../../../services/userProvidersService';
import type { Provider, CargoType } from '../../../types/catalog';
import { ConfirmModal } from '../../../components/base/ConfirmModal';
import { RecurrenceForm } from './RecurrenceForm';
import {
  RecurrenceConfig,
  DEFAULT_RECURRENCE_CONFIG,
  generateRecurringDates,
} from '../../../utils/recurrenceUtils';
import {
  useReservationDraft,
  checkDraftContext,
  hasMeaningfulDraftData,
  getDraftAge,
} from '../../../hooks/useReservationDraft';
import { useReservationBlockedStatus } from '../../../hooks/useBlockedStatuses';
import {
  toWarehouseDateString,
  toWarehouseTimeString,
  fromWarehouseLocalToUtc,
  DEFAULT_TIMEZONE,
} from '../../../utils/timezoneUtils';
import { sameDayCutoffService } from '../../../services/sameDayCutoffService';

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  /** Callback cuando el usuario hace click en "Copiar reserva" */
  onCopy?: (reservation: Reservation) => void;
  reservation?: Reservation | null;
  docks: Dock[];
  statuses: any[];
  defaults?: any;
  orgId: string;
  /** ID del almacén activo — se usa para filtrar proveedores */
  warehouseId?: string | null;
  /** Timezone del almacén activo — si no se pasa, usa America/Costa_Rica */
  warehouseTimezone?: string;
  /** Si esta instancia del modal es una copia de otra reserva, indica el ID original */
  copyOfId?: string | null;
}

interface FileItem {
  id: string;
  file?: File;
  name: string;
  size: number;
  type: string;
  url?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  isExisting?: boolean;
  category?: string;
}

type FileCategory = 'cmr' | 'facturas' | 'otros' | 'internos';

const MASKED_VALUE = '•••••••';

export default function ReservationModal({
  isOpen,
  onClose,
  onSave,
  onCopy,
  reservation,
  docks,
  statuses,
  defaults,
  orgId,
  warehouseId,
  warehouseTimezone = DEFAULT_TIMEZONE,
  copyOfId,
}: ReservationModalProps) {
  const { user, canLocal } = useAuth();
  // Timezone activo del almacén — fuente de verdad para mostrar y guardar fechas
  const tz = warehouseTimezone || DEFAULT_TIMEZONE;

  // ✅ Niveles de permisos: owner, privilegiado, o mismo proveedor asignado
  const isOwner = reservation ? reservation.created_by === user?.id : true;
  const isPrivileged = canLocal('admin.users.create') || canLocal('admin.matrix.update');

  // ✅ Bloqueo por estado — regla por cliente
  // Usa client_id DIRECTO de la reserva (columna real en BD)
  const { isBlocked: isStatusBlocked } = useReservationBlockedStatus(
    orgId,
    reservation?.id ?? null,
    reservation?.status_id ?? null,
    (reservation as any)?.client_id ?? null
  );

  const [removedExistingFileIds, setRemovedExistingFileIds] = useState<string[]>([]);
  const [savedReservationId, setSavedReservationId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'info' | 'documents' | 'activity'>('info');
  
  // ✅ Nuevo estado para la razón de cancelación
  const [cancelReason, setCancelReason] = useState<string>('');

  const [formData, setFormData] = useState({
    dockId: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    purchaseOrder: '',
    truckPlate: '',
    orderRequestNumber: '',
    shipperProvider: '',
    driver: '',
    dua: '',
    invoice: '',
    statusId: '',
    notes: '',
    transportType: 'inbound',
    cargoType: '',
    operationType: '' as string,
    blNumber: '',
  });

  const [isImported, setIsImported] = useState(false);

  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [openFileError, setOpenFileError] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [suggestedMinutes, setSuggestedMinutes] = useState<number | null>(null);
  const [manualOverride, setManualOverride] = useState(false);
  /** Cantidad capturada para tipos de carga dinámicos */
  const [cargoQuantity, setCargoQuantity] = useState<string>('');

  const [allowedProviders, setAllowedProviders] = useState<UserProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providersError, setProvidersError] = useState<string>('');

  // Verificar si el usuario tiene asignado el mismo proveedor que la reserva
  const hasSameProvider = reservation && reservation.shipper_provider
    ? allowedProviders.some(p => p.id === reservation.shipper_provider)
    : false;

  const canEditReservation = !reservation || isOwner || isPrivileged || hasSameProvider;
  const canViewSensitive = canEditReservation;
  // isReadOnly: sin permisos de edición O reserva bloqueada por estado (y no es privilegiado)
  const isReadOnly = !!reservation && (!canEditReservation || isStatusBlocked);

  const [notifyModal, setNotifyModal] = useState({
    isOpen: false,
    type: 'info' as 'info' | 'warning' | 'error' | 'success',
    title: '',
    message: '',
  });

  const [recurrenceConfig, setRecurrenceConfig] = useState<RecurrenceConfig>(DEFAULT_RECURRENCE_CONFIG);

  interface RecurringResult {
    created_count: number;
    skipped_count: number;
    skipped_reservations: Array<{ startDatetime: string; reason: string }>;
  }
  const [recurringResult, setRecurringResult] = useState<RecurringResult | null>(null);

  // ── Draft persistence states ──────────────────────────────────────────────
  /** Muestra el banner de borrador dentro del modal */
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  /** Muestra el confirm modal al intentar cerrar con datos sin guardar */
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  /** Advertencias de inconsistencia de contexto */
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  /** Timestamp legible del borrador ("hace 5 min") */
  const [draftAgeLabel, setDraftAgeLabel] = useState<string>('');

  const isNewReservation = !reservation;

  const { saveDraft, clearDraft, readDraft } = useReservationDraft({
    orgId,
    isOpen,
    isNewReservation,
  });

  // ── Guard de sesión de inicialización ────────────────────────────────────
  // Registra la "firma" de la última sesión inicializada: `${isOpen}_${reservation?.id ?? 'new'}`
  // Evita re-inicializar cuando defaults/statuses cambian mientras el modal ya está abierto con datos.
  const initSessionRef = useRef<string>('');
  // Flag: si el form se inicializó pero statuses estaban vacíos, pendiente de backfill del statusId
  const statusIdPendingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && orgId) {
      loadCatalogs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orgId, warehouseId]);

  // ── Helper: inicializa el formulario limpio para nueva reserva ───────────
  const initNewForm = useCallback(() => {
    const now = defaults?.start_datetime ? new Date(defaults.start_datetime) : new Date();
    const endDt = defaults?.end_datetime
      ? new Date(defaults.end_datetime)
      : new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // ✅ Si viene de una copia (_copyOfId), usar estado seguro del defaults o el primero
    const initialStatusId = defaults?.status_id || statuses[0]?.id || '';

    setRecurrenceConfig(DEFAULT_RECURRENCE_CONFIG);
    setFormData({
      dockId: defaults?.dock_id || '',
      startDate: toWarehouseDateString(now, tz),
      startTime: toWarehouseTimeString(now, tz),
      endDate: toWarehouseDateString(endDt, tz),
      endTime: toWarehouseTimeString(endDt, tz),
      // ✅ Campos copiables desde la reserva original
      purchaseOrder: defaults?.purchase_order || '',
      truckPlate: defaults?.truck_plate || '',
      orderRequestNumber: defaults?.order_request_number || '',
      shipperProvider: defaults?.shipper_provider || '',
      driver: defaults?.driver || '',
      dua: defaults?.dua || '',
      invoice: defaults?.invoice || '',
      statusId: initialStatusId,
      notes: defaults?.notes || '',
      transportType: defaults?.transport_type || 'inbound',
      cargoType: defaults?.cargo_type || '',
      operationType: defaults?.operation_type || '',
      blNumber: defaults?.bl_number || '',
    });
    setFiles([]);
    // ✅ Si tiene DUA, marcar como importado
    setIsImported(!!(defaults?.dua));
    setCancelReason('');
    setManualOverride(false);
    setSuggestedMinutes(null);
    // Recibir quantity_value desde el pre-modal si ya viene pre-calculado
    setCargoQuantity(defaults?.quantity_value != null ? String(defaults.quantity_value) : '');
    setShowDraftBanner(false);
    setDraftWarnings([]);
    setDraftAgeLabel('');
    setActiveTab('info');
  }, [defaults, statuses, tz]);

  const loadCatalogs = async () => {
    try {
      setLoadingProviders(true);
      setProvidersError('');

      // ── Cargar proveedores del almacén activo (para resolución de nombres) ──
      // Si hay warehouseId → filtrar por almacén; si no → todos los activos
      const [allProvidersData, cargoTypesData] = await Promise.all([
        providersService.getByWarehouse(orgId, warehouseId ?? null, true),
        cargoTypesService.getByWarehouse(orgId, warehouseId ?? null, true),
      ]);

      setProviders(allProvidersData);
      setCargoTypes(cargoTypesData);

      // ── Cargar proveedores permitidos para el usuario ──────────────────────
      // Para usuarios con proveedores asignados: intersectar con los del almacén activo
      let userProviders: UserProvider[] = [];

      if (user?.id) {
        try {
          const rawUserProviders = await userProvidersService.getUserProviders(orgId, user.id);

          if (warehouseId) {
            // Filtrar: solo los que también están en el almacén activo
            const warehouseProviderIds = new Set(allProvidersData.map((p) => p.id));
            userProviders = rawUserProviders.filter((up) => warehouseProviderIds.has(up.id));
          } else {
            // Sin almacén activo: mostrar todos los del usuario
            userProviders = rawUserProviders;
          }
        } catch (error: any) {
          // non-blocking
        }
      }

      setAllowedProviders(userProviders);
    } catch (error) {
      // non-blocking
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    const loadReservationFiles = async () => {
      if (!isOpen) return;
      if (!orgId) return;

      setRemovedExistingFileIds(prev => (prev.length ? [] : prev));

      if (!reservation?.id) {
        setFiles([]);
        return;
      }

      // ✅ No cargar archivos si no puede ver datos sensibles
      if (!canViewSensitive) {
        setFiles([]);
        return;
      }

      try {
        const rows = await calendarService.getReservationFiles(orgId, reservation.id);

        const mapped: FileItem[] = rows.map((r: any) => ({
          id: r.id,
          name: r.file_name,
          size: r.file_size ?? 0,
          type: r.mime_type ?? '',
          url: r.file_url,
          uploadedAt: r.uploaded_at,
          uploadedBy: r.uploaded_by,
          isExisting: true,
          category: String(r.category || 'otros').toLowerCase()
        }));

        setFiles(mapped);
      } catch (e) {
        // non-blocking file load
      }
    };

    loadReservationFiles();
  }, [isOpen, orgId, reservation?.id, canViewSensitive]);

  useEffect(() => {
    if (!isOpen) {
      // Al cerrar, limpiar la sesión para que la próxima apertura re-inicialice
      initSessionRef.current = '';
      statusIdPendingRef.current = false;
      return;
    }

    // ── Calcular firma de la sesión actual ───────────────────────────────────
    // Cambia cuando: se abre/cierra el modal, o se cambia de reserva (edit target)
    const sessionKey = `${reservation?.id ?? 'new'}`;

    // Si ya inicializamos para esta sesión, no repetir (guard principal)
    if (initSessionRef.current === sessionKey) return;

    // Marcar como inicializada ANTES de ejecutar para evitar doble ejecución en StrictMode
    initSessionRef.current = sessionKey;

    setSavedReservationId(reservation?.id ?? null);
    setRecurringResult(null);

    if (reservation) {
      // ── MODO EDICIÓN: siempre carga desde BD, ignora localStorage ──────────
      setRecurrenceConfig(DEFAULT_RECURRENCE_CONFIG);
      const start = new Date(reservation.start_datetime);
      const end = new Date(reservation.end_datetime);

      setFormData({
        dockId: reservation.dock_id,
        startDate: toWarehouseDateString(start, tz),
        startTime: toWarehouseTimeString(start, tz),
        endDate: toWarehouseDateString(end, tz),
        endTime: toWarehouseTimeString(end, tz),
        purchaseOrder: reservation.purchase_order || '',
        truckPlate: reservation.truck_plate || '',
        orderRequestNumber: reservation.order_request_number || '',
        shipperProvider: reservation.shipper_provider || '',
        driver: reservation.driver || '',
        dua: reservation.dua || '',
        invoice: reservation.invoice || '',
        statusId: reservation.status_id || '',
        notes: reservation.notes || '',
        transportType: reservation.transport_type || 'inbound',
        cargoType: reservation.cargo_type || '',
        operationType: reservation.operation_type || '',
        blNumber: (reservation as any).bl_number || '',
      });
      // ✅ Fuente de verdad: columna is_imported de BD; fallback a presencia de DUA
      const reservationIsImported = (reservation as any).is_imported;
      setIsImported(reservationIsImported != null ? !!reservationIsImported : !!(reservation.dua));
      setCancelReason(reservation.cancel_reason || '');
      setManualOverride(false);
      setSuggestedMinutes(null);
      setCargoQuantity((reservation as any).quantity_value != null ? String((reservation as any).quantity_value) : '');
      setShowDraftBanner(false);
      setDraftWarnings([]);
      setDraftAgeLabel('');
      setActiveTab('info');

    } else {
      // ── MODO NUEVA RESERVA: intentar restaurar borrador ──────────────────
      const draft = readDraft();

      if (draft) {
        // Draft encontrado: verificar consistencia de contexto
        const currentDockIds = docks.map((d) => d.id);
        const { isConsistent, warnings } = checkDraftContext(draft, currentDockIds, defaults);

        // Restaurar datos del borrador en el formulario
        setRecurrenceConfig(draft.recurrenceConfig ?? DEFAULT_RECURRENCE_CONFIG);
        setFormData(draft.formData);
        setIsImported(draft.isImported);
        setCancelReason(draft.cancelReason ?? '');
        setManualOverride(false);
        setSuggestedMinutes(null);
        setFiles([]);
        setActiveTab('info');

        // Mostrar banner (con advertencias de contexto si las hay)
        setDraftWarnings(isConsistent ? [] : warnings);
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
        // El draft tiene sus propios valores; no necesitamos backfill de statusId
        statusIdPendingRef.current = false;
      } else {
        // Sin borrador: inicialización normal
        // Si statuses aún están vacíos, el statusId quedará '' y se backfilleará después
        statusIdPendingRef.current = statuses.length === 0;
        initNewForm();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reservation?.id]);

  // ── Backfill de statusId cuando statuses llegan async ────────────────────
  // Solo aplica si: modal abierto, nueva reserva, statuses recién llegaron, y statusId estaba vacío
  useEffect(() => {
    if (
      !isOpen ||
      !isNewReservation ||
      !statusIdPendingRef.current ||
      statuses.length === 0
    ) return;

    // statuses ya llegaron — aplicar solo el statusId si sigue vacío
    setFormData(prev => {
      if (prev.statusId) return prev; // ya tiene valor, no pisar
      const fallbackId = defaults?.status_id || statuses[0]?.id || '';
      if (!fallbackId) return prev;
      statusIdPendingRef.current = false;
      return { ...prev, statusId: fallbackId };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, isOpen, isNewReservation]);

  useEffect(() => {
    if (isOpen && !reservation && allowedProviders.length === 1 && !formData.shipperProvider) {
      const singleProvider = allowedProviders[0];
      setFormData(prev => ({
        ...prev,
        shipperProvider: singleProvider.id
      }));
    }
  }, [isOpen, reservation, allowedProviders, formData.shipperProvider]);

  // ── Auto-save del borrador (500 ms debounce, solo nueva reserva) ──────────
  useEffect(() => {
    if (!isOpen || !isNewReservation) return;
    saveDraft({ formData, isImported, cancelReason, recurrenceConfig, defaults });
  }, [formData, isImported, cancelReason, recurrenceConfig, isOpen, isNewReservation]);

  const isProviderFieldDisabled = allowedProviders.length === 1;
  const hasNoProviders = allowedProviders.length === 0;

  useEffect(() => {
    if (
      !manualOverride &&
      formData.shipperProvider &&
      formData.cargoType &&
      formData.startDate &&
      formData.startTime
    ) {
      updateSuggestedDuration();
    }
  // cargoQuantity añadido: recalcula cuando cambia la cantidad en tipos dinámicos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.shipperProvider, formData.cargoType, formData.startDate, formData.startTime, manualOverride, cargoQuantity]);

  const updateSuggestedDuration = async () => {
    const provider = providers.find(p => p.id === formData.shipperProvider);
    const cargoType = cargoTypes.find(ct => ct.id === formData.cargoType);
    if (!provider || !cargoType) return;

    const startDatetime = `${formData.startDate}T${formData.startTime}:00`;

    try {
      const profile = await timeProfilesService.getMatchingProfile(orgId, provider.id, cargoType.id, startDatetime, warehouseId);

      // ── TIPO DINÁMICO ─────────────────────────────────────────────────────
      // Gate: is_dynamic === true Y hay perfil con base_minutes + minutes_per_unit Y hay cantidad capturada
      if (
        cargoType.is_dynamic === true &&
        profile &&
        profile.base_minutes != null &&
        profile.minutes_per_unit != null &&
        cargoQuantity.trim() !== ''
      ) {
        const qty = Number(cargoQuantity);
        if (Number.isFinite(qty) && qty > 0) {
          const dynamicMinutes = Math.round(profile.base_minutes + qty * Number(profile.minutes_per_unit));
          setSuggestedMinutes(dynamicMinutes);
          const startDate = fromWarehouseLocalToUtc(formData.startDate, formData.startTime, tz);
          const endDate = new Date(startDate.getTime() + dynamicMinutes * 60 * 1000);
          setFormData(prev => ({
            ...prev,
            endDate: toWarehouseDateString(endDate, tz),
            endTime: toWarehouseTimeString(endDate, tz),
          }));
          return;
        }
      }

      // ── TIPO FIJO (comportamiento actual intacto) ─────────────────────────
      if (profile) {
        setSuggestedMinutes(profile.avg_minutes);
        const startDate = fromWarehouseLocalToUtc(formData.startDate, formData.startTime, tz);
        const endDate = new Date(startDate.getTime() + profile.avg_minutes * 60 * 1000);

        setFormData(prev => ({
          ...prev,
          endDate: toWarehouseDateString(endDate, tz),
          endTime: toWarehouseTimeString(endDate, tz),
        }));
      } else if (cargoType.default_minutes) {
        setSuggestedMinutes(cargoType.default_minutes);
        const startDate = fromWarehouseLocalToUtc(formData.startDate, formData.startTime, tz);
        const endDate = new Date(startDate.getTime() + cargoType.default_minutes * 60 * 1000);

        setFormData(prev => ({
          ...prev,
          endDate: toWarehouseDateString(endDate, tz),
          endTime: toWarehouseTimeString(endDate, tz),
        }));
      } else {
        setSuggestedMinutes(null);
      }
    } catch (error: any) {
      setNotifyModal({
        isOpen: true,
        type: 'error',
        title: 'Error al cargar',
        message: 'Error al cargar perfil de tiempo',
      });
    }
  };

  const handleEndTimeChange = (field: 'endDate' | 'endTime', value: string) => {
    setManualOverride(true);
    setSuggestedMinutes(null);
    setFormData({ ...formData, [field]: value });
  };

  const handleProviderOrCargoTypeChange = (field: 'shipperProvider' | 'cargoType', value: string) => {
    setManualOverride(false);
    setSuggestedMinutes(null);
    setFormData({ ...formData, [field]: value });
  };

  const handleFileSelect = (selectedFiles: FileList | null, category: FileCategory) => {
    if (!selectedFiles) return;

    const newFiles: FileItem[] = Array.from(selectedFiles).map(file => ({
      id: `temp-${Date.now()}-${Math.random()}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      category
    }));

    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent, category: FileCategory) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files, category);
  };

  const removeFile = (fileId: string) => {
    const f = files.find(x => x.id === fileId);

    if (f?.isExisting) {
      setRemovedExistingFileIds(prev => (prev.includes(fileId) ? prev : [...prev, fileId]));
    }

    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFilesByCategory = (category: FileCategory) => {
    return files.filter(f => f.category === category);
  };

  // ── Cierre con verificación de borrador ──────────────────────────────────
  const handleClose = useCallback(() => {
    // Solo preguntar en modo nueva reserva y si hay datos significativos
    if (isNewReservation && hasMeaningfulDraftData(formData, defaults)) {
      setShowDiscardConfirm(true);
      return;
    }
    // Sin datos relevantes: cerrar directamente y limpiar
    clearDraft();
    onClose();
  }, [isNewReservation, formData, defaults, clearDraft, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    clearDraft();
    onClose();
  }, [clearDraft, onClose]);

  const handleKeepAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    // El borrador ya está en localStorage — solo cerrar el modal
    onClose();
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validación extra: si el rol tiene restricción de status, bloquear status no permitidos
    const hasLimitedStatus = canLocal('reservations.limit_status_view');
    if (hasLimitedStatus && formData.statusId) {
      const selectedStatus = statuses.find(s => s.id === formData.statusId);
      const allowedCodes = ['PENDING', 'CANCELLED'];
      if (selectedStatus && !allowedCodes.includes(selectedStatus.code || '')) {
        setNotifyModal({
          isOpen: true,
          type: 'warning',
          title: 'Estado no permitido',
          message: 'Tu rol solo permite asignar los estados Pendiente o Cancelado.'
        });
        return;
      }
    }

    if (isReadOnly) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'Sin permisos para editar',
        message: 'Esta reserva pertenece a otro proveedor/usuario. Solo el creador, un usuario Admin/Full Access, o un usuario con el mismo proveedor asignado puede modificarla.'
      });
      return;
    }

    // ✅ Validación: razón de cancelación obligatoria cuando el estado es "Cancelado"
    if (isCancelledStatus && !cancelReason.trim()) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'Razón de cancelación requerida',
        message: 'Por favor, ingresá una razón para cancelar la reserva.'
      });
      return;
    }

    // ✅ Validación: BL obligatorio cuando operationType=zona_franca + isImported
    const showBLField = formData.operationType === 'zona_franca' && isImported;
    if (showBLField && !formData.blNumber.trim()) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'Campo requerido',
        message: 'El campo "BL / Conocimiento del contenedor" es obligatorio para operaciones de Zona Franca con carga importada.',
      });
      return;
    }

    // ✅ Convertir hora local del almacén → UTC para persistir correctamente
    const startDateTime = fromWarehouseLocalToUtc(formData.startDate, formData.startTime, tz);
    const endDateTime = fromWarehouseLocalToUtc(formData.endDate, formData.endTime, tz);

    if (endDateTime <= startDateTime) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'Fecha inválida',
        message: 'La fecha/hora de fin debe ser posterior a la de inicio'
      });
      return;
    }

    if (!user?.id) {
      setNotifyModal({
        isOpen: true,
        type: 'error',
        title: 'Error de autenticación',
        message: 'Usuario no autenticado'
      });
      return;
    }

    const payload: Partial<Reservation> = {
      org_id: orgId,
      dock_id: formData.dockId,
      start_datetime: startDateTime.toISOString(),
      end_datetime: endDateTime.toISOString(),
      purchase_order: formData.purchaseOrder || null,
      truck_plate: formData.truckPlate || null,
      order_request_number: formData.orderRequestNumber || null,
      shipper_provider: formData.shipperProvider || null,
      driver: formData.driver?.trim() || null,
      // ✅ DUA: solo si es importado; si es nacional se guarda null
      dua: isImported ? (formData.dua?.trim() || null) : null,
      invoice: formData.invoice || null,
      status_id: formData.statusId || null,
      notes: formData.notes || null,
      transport_type: formData.transportType,
      cargo_type: formData.cargoType,
      operation_type: formData.operationType || null,
      // ✅ Persistir el toggle Nacional/Importado como campo real en BD
      is_imported: isImported,
      // ✅ Usar isCancelledStatus en lugar de comparar con string literal
      is_cancelled: isCancelledStatus,
      cancel_reason: isCancelledStatus ? cancelReason : null,
      // ✅ Preservar client_id cuando viene de una copia
      ...(defaults?.client_id ? { client_id: defaults.client_id } : {}),
      // ✅ BL: solo guardar cuando aplica (zona_franca + importado); en otro caso null
      bl_number: (formData.operationType === 'zona_franca' && isImported)
        ? (formData.blNumber?.trim() || null)
        : null,
      // Cantidad dinámica: viene del pre-modal (solo lectura en este modal)
      quantity_value: (() => {
        const ct = cargoTypes.find(c => c.id === formData.cargoType);
        if (ct?.is_dynamic && cargoQuantity.trim()) {
          const q = parseInt(cargoQuantity, 10);
          return Number.isFinite(q) && q > 0 ? q : null;
        }
        return null;
      })(),
    };

    // ── Validación: corte de reservas del mismo día ──────────────────────
    // Solo aplica a NUEVAS reservas, cuando se conoce el cliente y el almacén.
    // POLÍTICA: nunca falla abierto — cualquier error de verificación bloquea
    // la creación y muestra un aviso explícito al usuario.
    if (!reservation && defaults?.client_id && warehouseId && user?.id) {
      const todayStr = toWarehouseDateString(new Date(), tz);
      if (formData.startDate === todayStr) {
        try {
          const cutoffCheck = await sameDayCutoffService.checkCutoff(
            orgId,
            defaults.client_id,
            warehouseId,
            tz,
            user.id,
            isPrivileged
          );

          if (cutoffCheck.blocked) {
            setNotifyModal({
              isOpen: true,
              type: 'warning',
              title: 'Fuera del horario de reservas',
              message: cutoffCheck.message,
            });
            return;
          }

          if (cutoffCheck.verificationFailed) {
            setNotifyModal({
              isOpen: true,
              type: 'error',
              title: 'No se pudo verificar el corte del mismo día',
              message: `${cutoffCheck.message} Por seguridad, la reserva no fue creada. Intentá de nuevo o contactá a un administrador si el problema persiste.`,
            });
            return;
          }
        } catch (cutoffErr) {

          setNotifyModal({
            isOpen: true,
            type: 'error',
            title: 'Error al verificar la regla de reservas',
            message: 'No se pudo verificar la regla de corte del mismo día. Por seguridad, la reserva no fue creada. Intentá de nuevo o contactá a un administrador.',
          });
          return;
        }
      }
    }

    try {
      setSaving(true);

      let saved: Reservation;

      if (reservation) {
        saved = await calendarService.updateReservation(reservation.id, payload);
      } else {
        saved = await calendarService.createReservation(payload);
      }

      setSavedReservationId(saved.id);

      if (removedExistingFileIds.length > 0) {
        for (const fileId of removedExistingFileIds) {
          await calendarService.deleteReservationFile(orgId, fileId);
        }
        setRemovedExistingFileIds(prev => (prev.length ? [] : prev));
      }

      const newFiles = files.filter(f => !!f.file && !f.isExisting);

      for (const f of newFiles) {
        if (!f.file) continue;

        const inserted = await calendarService.uploadReservationFile({
          orgId,
          reservationId: saved.id,
          category: (f.category || 'otros') as string,
          file: f.file
        });

        setFiles(prev =>
          prev.map(x =>
            x.id === f.id
              ? {
                  id: inserted.id,
                  name: inserted.file_name,
                  size: inserted.file_size ?? f.size,
                  type: inserted.mime_type ?? f.type,
                  url: inserted.file_url,
                  uploadedAt: inserted.uploaded_at,
                  uploadedBy: inserted.uploaded_by,
                  isExisting: true,
                  category: String(inserted.category || 'otros').toLowerCase()
                }
              : x
          )
        );
      }

      // ── RECURRENCIA ────────────────────────────────────────────────
      if (!reservation && recurrenceConfig.enabled) {
        const startDatetimeISO = `${formData.startDate}T${formData.startTime}:00`;
        const endDatetimeISO = `${formData.endDate}T${formData.endTime}:00`;

        const additionalDates = generateRecurringDates(startDatetimeISO, endDatetimeISO, recurrenceConfig);

        if (additionalDates.length > 0) {
          const recurringPayload: Partial<Reservation> = {
            ...payload,
            // recurrence field no se copia a las ocurrencias hijas
            recurrence: null,
          };

          const result = await calendarService.createRecurringReservations(recurringPayload, additionalDates);

          // ✅ Borrador limpiado al guardar con éxito
          clearDraft();
          onSave(); // refrescar calendario

          setRecurringResult({
            created_count: result.created_count,
            skipped_count: result.skipped_count,
            skipped_reservations: result.skipped_reservations,
          });

          return; // mantener modal abierto para mostrar resultado
        }
      }
      // ──────────────────────────────────────────────────────────────

      // ✅ Borrador limpiado al guardar con éxito
      clearDraft();
      onSave();
    } catch (error: any) {
      setNotifyModal({
        isOpen: true,
        type: 'error',
        title: 'Error al guardar',
        message: error?.message || 'Error al guardar reserva',
      });
    } finally {
      setSaving(false);
    }
  };

  const openFile = async (file: FileItem) => {
    try {
      setOpenFileError('');
      setOpeningFileId(file.id);

      if (!file.isExisting || !file.url) {
        setNotifyModal({
          isOpen: true,
          type: 'warning',
          title: 'Archivo no guardado',
          message: 'Este archivo todavía no está guardado. Guardá la reserva primero.'
        });
        return;
      }

      const signedUrl = await calendarService.getReservationFileSignedUrl(file.url);

      if (!signedUrl) {
        setNotifyModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: 'No se pudo generar el enlace del archivo.'
        });
        return;
      }

      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      // non-blocking file open
    }
  };

  const getReservationId = () => {
    if (reservation?.id) return reservation.id.slice(0, 8);
    if (savedReservationId) return savedReservationId.slice(0, 8);
    return 'NUEVA';
  };

  const getTimeRange = () => {
    if (formData.startTime && formData.endTime) return `${formData.startTime} - ${formData.endTime}`;
    return '';
  };

  // ✅ Helper para mostrar valor enmascarado o real
  const displaySensitive = (value: string) => {
    if (canViewSensitive) return value;
    return value ? MASKED_VALUE : '';
  };

  const dockName = docks.find(d => d.id === formData.dockId)?.name || '';
  const statusName = statuses.find(s => s.id === formData.statusId)?.name || '';
  const providerName = providers.find(p => p.id === formData.shipperProvider)?.name || '';
  const cargoTypeName = cargoTypes.find(ct => ct.id === formData.cargoType)?.name || '';

  const OPERATION_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
    distribucion: { label: 'Distribución', icon: 'ri-truck-line' },
    almacen: { label: 'Almacén', icon: 'ri-store-2-line' },
    zona_franca: { label: 'Zona Franca', icon: 'ri-global-line' },
  };
  const operationTypeInfo = formData.operationType ? OPERATION_TYPE_LABELS[formData.operationType] : null;

  const categoryLabels: Record<FileCategory, string> = {
    cmr: 'CMR',
    facturas: 'Facturas',
    otros: 'Otros documentos',
    internos: 'Documentos internos'
  };

  const inputBase =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white shadow-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';
  const inputReadOnly =
    'w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-100 shadow-sm outline-none cursor-not-allowed text-gray-600';
  const inputMasked =
    'w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 shadow-sm outline-none cursor-not-allowed text-gray-400 select-none';
  const selectBase =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white shadow-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer';
  const selectReadOnly =
    'w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-100 shadow-sm outline-none cursor-not-allowed text-gray-600';
  const labelBase = 'block text-sm font-medium text-gray-800 mb-2';
  const hintBase = 'mt-1 text-xs text-gray-500';

  const inputCls = isReadOnly ? inputReadOnly : inputBase;
  const selectCls = isReadOnly ? selectReadOnly : selectBase;
  const sensitiveInputCls = isReadOnly ? (canViewSensitive ? inputReadOnly : inputMasked) : inputBase;

  // ✅ Helper: detecta si el estado seleccionado es "cancelado" por code o name (no por ID)
  const isCancelledStatus = (() => {
    if (!formData.statusId) return false;
    const found = statuses.find(s => s.id === formData.statusId);
    if (!found) return false;
    const code = (found.code || '').toLowerCase().trim();
    const name = (found.name || '').toLowerCase().trim();
    return (
      code === 'cancelado' ||
      code === 'cancelled' ||
      code === 'canceled' ||
      name === 'cancelado' ||
      name === 'cancelled' ||
      name === 'canceled'
    );
  })();

  if (!isOpen) return null;

  // ✅ Componente inline para el banner de lectura limitada
  const RestrictedBanner = () => (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <i className="ri-eye-off-line text-amber-700 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-amber-900">
            Solo lectura — Información limitada
          </h4>
          <p className="text-xs text-amber-800 mt-1">
            Esta reserva pertenece a otro proveedor/usuario. Solo podés ver la información básica (andén, horario, estado y tipo de carga). Los datos sensibles, documentos y actividad no están disponibles. Si necesitás acceso completo, contactá a un administrador para que te asigne el proveedor correspondiente.
          </p>
        </div>
      </div>
    </div>
  );

  // ✅ Componente para tab restringido
  const RestrictedTabContent = ({ label }: { label: string }) => (
    <div className="p-6">
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <i className="ri-lock-line text-2xl text-gray-400 w-6 h-6 flex items-center justify-center"></i>
        </div>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">No disponible</h4>
        <p className="text-xs text-gray-500 max-w-xs mx-auto">
          No tenés permisos para ver {label} de esta reserva. Solo el creador, un usuario Admin/Full Access, o un usuario con el mismo proveedor asignado puede acceder.
        </p>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">Reserva #{getReservationId()}</h2>
                {getTimeRange() && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                    {getTimeRange()}
                  </span>
                )}
                {isReadOnly && !canViewSensitive && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    <i className="ri-eye-off-line mr-1 w-3 h-3 flex items-center justify-center"></i>
                    Lectura limitada
                  </span>
                )}
                {isReadOnly && canViewSensitive && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    <i className="ri-lock-line mr-1 w-3 h-3 flex items-center justify-center"></i>
                    Solo lectura
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                {dockName && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200">
                    <i className="ri-road-map-line w-4 h-4 inline-flex items-center justify-center text-gray-500"></i>
                    {dockName}
                  </span>
                )}
                {statusName && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200">
                    <i className="ri-flag-line w-4 h-4 inline-flex items-center justify-center text-gray-500"></i>
                    {statusName}
                  </span>
                )}
                {cargoTypeName && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200">
                    <i className="ri-archive-line w-4 h-4 inline-flex items-center justify-center text-gray-500"></i>
                    {cargoTypeName}
                  </span>
                )}
                {operationTypeInfo && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800">
                    <i className={`${operationTypeInfo.icon} w-4 h-4 inline-flex items-center justify-center text-teal-600`}></i>
                    {operationTypeInfo.label}
                  </span>
                )}
                {providerName && canViewSensitive && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200">
                    <i className="ri-truck-line w-4 h-4 inline-flex items-center justify-center text-gray-500"></i>
                    {providerName}
                  </span>
                )}
                {suggestedMinutes && !isReadOnly && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800">
                    <i className="ri-time-line w-4 h-4 inline-flex items-center justify-center text-teal-700"></i>
                    {suggestedMinutes} min sugeridos
                  </span>
                )}
              </div>
            </div>

            <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
              <i className="ri-close-line text-2xl w-6 h-6 flex items-center justify-center"></i>
            </button>
          </div>
        </div>

        <div className="border-b border-gray-200 bg-white">
          <div className="flex px-6 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'info'
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Información
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('documents')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'documents'
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Documentos
              {!canViewSensitive && (
                <i className="ri-lock-line text-xs w-3 h-3 inline-flex items-center justify-center opacity-50"></i>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'activity'
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Actividad
              {!canViewSensitive && (
                <i className="ri-lock-line text-xs w-3 h-3 inline-flex items-center justify-center opacity-50"></i>
              )}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'info' && (
              <div className="p-6">
                <div className="max-w-2xl">
                  {/* ── Banner de copia ───────────────────────────────────────── */}
                  {copyOfId && (
                    <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-teal-600">
                          <i className="ri-file-copy-line text-lg"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-teal-900">
                            Copia de la reserva #{copyOfId.slice(0, 8)}
                          </p>
                          <p className="text-xs text-teal-700 mt-0.5">
                            Esta es una nueva reserva independiente. Podés cambiar el andén, fecha, hora y cualquier otro campo antes de guardar. La reserva original no se modifica.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Banner de borrador ─────────────────────────────────────── */}
                  {showDraftBanner && (
                    <div className={`mb-5 rounded-xl border p-4 ${draftWarnings.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 ${draftWarnings.length > 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                          <i className={draftWarnings.length > 0 ? 'ri-alert-line text-lg' : 'ri-save-line text-lg'}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${draftWarnings.length > 0 ? 'text-amber-900' : 'text-teal-900'}`}>
                            Borrador guardado {draftAgeLabel}
                          </p>
                          {draftWarnings.length > 0 ? (
                            <ul className="mt-1 space-y-0.5">
                              {draftWarnings.map((w, i) => (
                                <li key={i} className="text-xs text-amber-800">• {w}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-teal-700 mt-0.5">
                              Se restauraron los datos que ingresaste anteriormente.
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() => setShowDraftBanner(false)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${draftWarnings.length > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
                            >
                              Continuar con el borrador
                            </button>
                            <button
                              type="button"
                              onClick={() => { clearDraft(); initNewForm(); }}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
                            >
                              Descartar y empezar nuevo
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ✅ Banner: reserva bloqueada por estado */}
                  {isStatusBlocked && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <i className="ri-lock-2-line text-red-600 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-red-900">
                            Esta reserva no puede modificarse en su estado actual
                          </h4>
                          <p className="text-xs text-red-700 mt-1">
                            El estado "<span className="font-semibold">{reservation?.status?.name}</span>" bloquea toda edición. Solo un usuario con rol <span className="font-semibold">ADMIN</span> o <span className="font-semibold">Full Access</span> puede modificarla.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ✅ Banner según nivel de acceso */}
                  {isReadOnly && !isStatusBlocked && !canViewSensitive && <RestrictedBanner />}
                  {isReadOnly && !isStatusBlocked && canViewSensitive && (
                    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <i className="ri-lock-line text-amber-700 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-amber-900">
                            Sin permisos para editar
                          </h4>
                          <p className="text-xs text-amber-800 mt-1">
                            Esta reserva pertenece a otro proveedor/usuario. Solo el creador, un usuario Admin/Full Access, o un usuario con el mismo proveedor asignado puede modificarla.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900">Datos principales</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {isReadOnly && !canViewSensitive
                        ? 'Estás viendo información básica. Los datos sensibles están ocultos.'
                        : isReadOnly
                        ? 'Estás viendo esta reserva en modo solo lectura.'
                        : 'Completa primero la carga y proveedor para sugerir duración automáticamente (si aplica).'}
                    </p>
                  </div>

                  <div className="space-y-5">
                    {/* Warning si no hay proveedores asignados */}
                    {!isReadOnly && hasNoProviders && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <i className="ri-alert-line text-yellow-700 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-yellow-900">
                              No tenés proveedores asignados
                            </h4>
                            <p className="text-xs text-yellow-800 mt-1">
                              Contactá a un administrador para que te asigne proveedores antes de crear reservas.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Info si hay 1 solo proveedor */}
                    {!isReadOnly && allowedProviders.length === 1 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <i className="ri-information-line text-blue-700 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-blue-900">
                              Proveedor preseleccionado
                            </h4>
                            <p className="text-xs text-blue-800 mt-1">
                              Tenés asignado un único proveedor: <span className="font-semibold">{allowedProviders[0].name}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <div className="space-y-4">
                        <div>
                          <label className={labelBase}>Tipo de Carga *</label>
                          <select
                            value={formData.cargoType}
                            onChange={(e) => handleProviderOrCargoTypeChange('cargoType', e.target.value)}
                            className={selectCls}
                            required
                            disabled={isReadOnly || hasNoProviders}
                          >
                            <option value="">Seleccionar tipo de carga</option>
                            {cargoTypes.map(cargoType => (
                              <option key={cargoType.id} value={cargoType.id}>
                                {cargoType.name}
                              </option>
                            ))}
                          </select>
                          {!isReadOnly && <div className={hintBase}>Este campo se usará para automatizaciones futuras del tiempo.</div>}
                        </div>

                        {/* ✅ Proveedor: enmascarar si no puede ver sensible */}
                        <div>
                          <label className={labelBase}>
                            Expedidor / Proveedor *
                            {!isReadOnly && loadingProviders && (
                              <span className="ml-2 text-xs text-gray-500">(Cargando...)</span>
                            )}
                          </label>
                          
                          {isReadOnly && !canViewSensitive ? (
                            <div className={inputMasked}>
                              <span className="text-gray-400 select-none">Reservado</span>
                            </div>
                          ) : isReadOnly ? (
                            <div className={inputReadOnly}>
                              {providers.find(p => p.id === formData.shipperProvider)?.name || '—'}
                            </div>
                          ) : (
                            <>
                              <SearchSelect
                                options={allowedProviders.map(p => ({ id: p.id, label: p.name }))}
                                value={formData.shipperProvider}
                                onChange={(id) => handleProviderOrCargoTypeChange('shipperProvider', id)}
                                placeholder={
                                  hasNoProviders
                                    ? 'Sin proveedores asignados'
                                    : loadingProviders
                                    ? 'Cargando proveedores...'
                                    : 'Buscar proveedor...'
                                }
                                disabled={isProviderFieldDisabled || hasNoProviders || loadingProviders}
                              />
                              {/* Campo oculto para mantener validación HTML5 required */}
                              <input
                                type="text"
                                required
                                value={formData.shipperProvider}
                                onChange={() => {}}
                                className="sr-only"
                                tabIndex={-1}
                                aria-hidden="true"
                              />

                              {!isReadOnly && (
                                <div className={hintBase}>
                                  {hasNoProviders
                                    ? 'No tenés proveedores asignados. Contactá a un administrador.'
                                    : allowedProviders.length === 1
                                    ? 'Este es tu único proveedor asignado.'
                                    : `${allowedProviders.length} proveedores disponibles — escribí para filtrar.`}
                                </div>
                              )}

                              {!isReadOnly && providersError && (
                                <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                                  <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
                                  {providersError}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* ── Campo dinámico: solo lectura (la cantidad se capturó en el primer modal) ── */}
                        {(() => {
                          const selectedCT = cargoTypes.find(ct => ct.id === formData.cargoType);
                          if (!selectedCT?.is_dynamic) return null;
                          const label = selectedCT.unit_label || selectedCT.measurement_key || 'Cantidad';
                          return (
                            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <i className="ri-flashlight-line text-teal-700 w-4 h-4 flex items-center justify-center"></i>
                                <span className="text-sm font-semibold text-teal-900">Datos del tipo de carga dinámico</span>
                              </div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                {label}
                              </label>
                              <input
                                type="number"
                                value={cargoQuantity}
                                readOnly
                                className="w-full px-3 py-2.5 border border-teal-200 rounded-lg text-sm bg-teal-50/80 text-teal-900 cursor-default select-none"
                              />
                              <p className="text-xs text-teal-600 mt-1.5 flex items-center gap-1">
                                <i className="ri-lock-line text-xs"></i>
                                Valor capturado en el primer paso. Para modificarlo, cerrá este modal y creá una nueva reserva.
                              </p>
                            </div>
                          );
                        })()}

                        {!isReadOnly && suggestedMinutes && (
                          <div className="bg-white border border-teal-200 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <i className="ri-time-line text-teal-700 w-5 h-5 flex items-center justify-center mt-0.5"></i>
                              <div className="min-w-0">
                                <p className="text-sm text-teal-900">
                                  <span className="font-semibold">Tiempo sugerido:</span> {suggestedMinutes} minutos
                                  {cargoTypes.find(ct => ct.id === formData.cargoType)?.is_dynamic && cargoQuantity && (
                                    <span className="text-teal-600 ml-1 text-xs">(calculado por cantidad)</span>
                                  )}
                                </p>
                                <p className="text-xs text-teal-700 mt-0.5">
                                  Si editás manualmente la hora fin, se desactiva la sugerencia.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ✅ Tipo de operación */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Tipo de operación</h4>
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { value: 'distribucion', label: 'Distribución', icon: 'ri-truck-line' },
                          { value: 'almacen', label: 'Almacén', icon: 'ri-store-2-line' },
                          { value: 'zona_franca', label: 'Zona Franca', icon: 'ri-global-line' },
                        ].map(({ value, label, icon }) => {
                          const selected = formData.operationType === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => setFormData(prev => ({
                                ...prev,
                                operationType: selected ? '' : value,
                              }))}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                selected
                                  ? 'bg-teal-600 border-teal-600 text-white'
                                  : 'bg-white border-gray-300 text-gray-700 hover:border-teal-400 hover:text-teal-700'
                              } ${isReadOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                            >
                              <i className={`${icon} w-4 h-4 flex items-center justify-center`}></i>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      {!isReadOnly && (
                        <p className="mt-2 text-xs text-gray-500">Seleccioná el tipo de operación que clasifica esta reserva.</p>
                      )}
                    </div>

                    {/* ✅ Ubicación y estado */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Ubicación y estado</h4>
                      <div className="space-y-4">
                        <div>
                          <label className={labelBase}>Andén / Rampa *</label>
                          <select
                            value={formData.dockId}
                            onChange={(e) => setFormData({ ...formData, dockId: e.target.value })}
                            className={selectCls}
                            required
                            disabled={isReadOnly}
                          >
                            <option value="">Seleccionar andén</option>
                            {docks.map(dock => (
                              <option key={dock.id} value={dock.id}>
                                {dock.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={labelBase}>Estado *</label>
                          <select
                            value={formData.statusId}
                            onChange={(e) => setFormData({ ...formData, statusId: e.target.value })}
                            className={selectCls}
                            required
                            disabled={isReadOnly}
                          >
                            <option value="">Seleccionar estado</option>
                            {statuses.map(status => (
                              <option key={status.id} value={status.id}>
                                {status.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* ✅ Campo para la razón de cancelación, solo se muestra cuando el estado es "Cancelado" */}
                        {isCancelledStatus && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <label className="block text-sm font-medium text-gray-900 mb-2">
                              Razón de la cancelación *
                            </label>
                            <textarea
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                              className={`w-full p-2.5 border ${
                                isReadOnly 
                                  ? 'border-gray-200 bg-gray-100 cursor-not-allowed text-gray-600' 
                                  : 'border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent'
                              } rounded-lg outline-none resize-none`}
                              placeholder={isReadOnly ? '' : 'Escriba el motivo de la cancelación...'}
                              rows={3}
                              required
                              disabled={isReadOnly}
                            />
                            {!isReadOnly && (
                              <p className="text-xs text-amber-700 mt-2">
                                Este campo es obligatorio cuando el estado es "Cancelado"
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ✅ Fecha y hora: SIEMPRE visible */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Fecha y hora</h4>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelBase}>Fecha Inicio *</label>
                            <input
                              type="date"
                              value={formData.startDate}
                              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                              className={inputCls}
                              required
                              disabled={isReadOnly}
                            />
                          </div>
                          <div>
                            <label className={labelBase}>Hora Inicio *</label>
                            <input
                              type="time"
                              value={formData.startTime}
                              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                              className={inputCls}
                              required
                              disabled={isReadOnly}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelBase}>Fecha Fin *</label>
                            <input
                              type="date"
                              value={formData.endDate}
                              onChange={(e) => handleEndTimeChange('endDate', e.target.value)}
                              className={inputCls}
                              required
                              disabled={isReadOnly}
                            />
                          </div>
                          <div>
                            <label className={labelBase}>Hora Fin *</label>
                            <input
                              type="time"
                              value={formData.endTime}
                              onChange={(e) => handleEndTimeChange('endTime', e.target.value)}
                              className={inputCls}
                              required
                              disabled={isReadOnly}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelBase}>Tipo de Transporte</label>
                            <select
                              value={formData.transportType}
                              onChange={(e) => setFormData({ ...formData, transportType: e.target.value })}
                              className={selectCls}
                              disabled={isReadOnly}
                            >
                              <option value="inbound">Inbound</option>
                              <option value="outbound">Outbound</option>
                            </select>
                          </div>

                          <div>
                            <label className={labelBase}>Recurrencia</label>
                            <RecurrenceForm
                              value={recurrenceConfig}
                              onChange={setRecurrenceConfig}
                              startDatetime={
                                formData.startDate && formData.startTime
                                  ? `${formData.startDate}T${formData.startTime}:00`
                                  : ''
                              }
                              endDatetime={
                                formData.endDate && formData.endTime
                                  ? `${formData.endDate}T${formData.endTime}:00`
                                  : ''
                              }
                              disabled={isReadOnly || !!reservation}
                            />
                            {!!reservation && (
                              <p className="mt-1.5 text-xs text-gray-500">
                                La recurrencia solo se puede configurar al crear una reserva nueva.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ✅ Datos del transporte: ENMASCARAR si no puede ver sensible */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-gray-900">Datos del transporte</h4>
                        {!canViewSensitive && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <i className="ri-eye-off-line w-3 h-3 flex items-center justify-center"></i>
                            Información reservada
                          </span>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelBase}>Chofer</label>
                            {canViewSensitive ? (
                              <input
                                type="text"
                                value={formData.driver}
                                onChange={(e) => setFormData({ ...formData, driver: e.target.value })}
                                className={sensitiveInputCls}
                                placeholder="Nombre del chofer"
                                disabled={isReadOnly}
                              />
                            ) : (
                              <div className={inputMasked}>
                                <span className="select-none">Reservado</span>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className={labelBase}>Número de matrícula del camión</label>
                            {canViewSensitive ? (
                              <input
                                type="text"
                                value={formData.truckPlate}
                                onChange={(e) => setFormData({ ...formData, truckPlate: e.target.value })}
                                className={sensitiveInputCls}
                                placeholder="ABC-1234"
                                disabled={isReadOnly}
                              />
                            ) : (
                              <div className={inputMasked}>
                                <span className="select-none">Reservado</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            {/* Toggle Nacional / Importado + campo DUA condicional */}
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-sm font-medium text-gray-800">
                                Origen de la carga
                              </label>
                            </div>
                            {canViewSensitive ? (
                              <>
                                <div className="flex rounded-lg border border-gray-300 overflow-hidden mb-3">
                                  <button
                                    type="button"
                                    disabled={isReadOnly}
                                    onClick={() => {
                                      setIsImported(false);
                                      setFormData(prev => ({ ...prev, dua: '' }));
                                    }}
                                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                                      !isImported
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                    } ${isReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                                  >
                                    <i className="ri-home-line mr-1.5 w-4 h-4 inline-flex items-center justify-center"></i>
                                    Nacional
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isReadOnly}
                                    onClick={() => setIsImported(true)}
                                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                                      isImported
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                    } ${isReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                                  >
                                    <i className="ri-ship-line mr-1.5 w-4 h-4 inline-flex items-center justify-center"></i>
                                    Importado
                                  </button>
                                </div>
                                {isImported && (
                                  <div>
                                    <label className="block text-sm font-medium text-gray-800 mb-2">
                                      DUA *
                                    </label>
                                    <input
                                      type="text"
                                      value={formData.dua}
                                      onChange={(e) => setFormData({ ...formData, dua: e.target.value })}
                                      className={sensitiveInputCls}
                                      placeholder="DUA-2024-001"
                                      required={!isReadOnly}
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className={inputMasked}>
                                <span className="select-none">Reservado</span>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className={labelBase}>Factura</label>
                            {canViewSensitive ? (
                              <input
                                type="text"
                                value={formData.invoice}
                                onChange={(e) => setFormData({ ...formData, invoice: e.target.value })}
                                className={sensitiveInputCls}
                                placeholder="FAC-001"
                                disabled={isReadOnly}
                              />
                            ) : (
                              <div className={inputMasked}>
                                <span className="select-none">Reservado</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelBase}>Orden de Compra *</label>
                            {canViewSensitive ? (
                              <input
                                type="text"
                                value={formData.purchaseOrder}
                                onChange={(e) => setFormData({ ...formData, purchaseOrder: e.target.value })}
                                className={sensitiveInputCls}
                                placeholder="OC-2024-001"
                                required={!isReadOnly}
                                disabled={isReadOnly}
                              />
                            ) : (
                              <div className={inputMasked}>
                                <span className="select-none">Reservado</span>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className={labelBase}>Número de pedido</label>
                            {canViewSensitive ? (
                              <textarea
                                value={formData.orderRequestNumber}
                                onChange={(e) => setFormData({ ...formData, orderRequestNumber: e.target.value })}
                                className={`${sensitiveInputCls} resize-none`}
                                rows={2}
                                placeholder="Número de pedido o solicitud"
                                disabled={isReadOnly}
                              />
                            ) : (
                              <div className={`${inputMasked} h-[68px]`}>
                                <span className="select-none">Reservado</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ✅ Campo BL / Conocimiento del contenedor — condicional: zona_franca + importado */}
                    {formData.operationType === 'zona_franca' && isImported && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-4">
                          Documentos de importación
                        </h4>
                        <div>
                          <label className={labelBase}>
                            BL / Conocimiento del contenedor *
                          </label>
                          {canViewSensitive ? (
                            <input
                              type="text"
                              value={formData.blNumber}
                              onChange={(e) => setFormData({ ...formData, blNumber: e.target.value })}
                              className={sensitiveInputCls}
                              placeholder="BL-2024-001"
                              disabled={isReadOnly}
                            />
                          ) : (
                            <div className={inputMasked}>
                              <span className="select-none">Reservado</span>
                            </div>
                          )}
                          {!isReadOnly && (
                            <p className={hintBase}>
                              Obligatorio para operaciones de Zona Franca con carga importada.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ✅ Observaciones: ENMASCARAR si no puede ver sensible */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-gray-900">Observaciones</h4>
                        {!canViewSensitive && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <i className="ri-eye-off-line w-3 h-3 flex items-center justify-center"></i>
                            Información reservada
                          </span>
                        )}
                      </div>
                      {canViewSensitive ? (
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          className={`${sensitiveInputCls} resize-none`}
                          rows={4}
                          placeholder={isReadOnly ? '' : 'Notas adicionales...'}
                          disabled={isReadOnly}
                        />
                      ) : (
                        <div className={`${inputMasked} h-[110px]`}>
                          <span className="select-none">Reservado</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ✅ Tab Documentos: restringido si no puede ver sensible */}
            {activeTab === 'documents' && !canViewSensitive && (
              <RestrictedTabContent label="los documentos" />
            )}

            {activeTab === 'documents' && canViewSensitive && (
              <div className="p-6 space-y-6">
                {(['cmr', 'facturas', 'otros', 'internos'] as FileCategory[]).map(category => (
                  <div key={category} className="border border-gray-200 rounded-xl p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">{categoryLabels[category]}</h3>
                      <span className="text-xs text-gray-500">
                        {getFilesByCategory(category).length} archivo(s)
                      </span>
                    </div>

                    {!isReadOnly && (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, category)}
                        className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors mb-3 ${
                          isDragging ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <input
                          type="file"
                          multiple
                          onChange={(e) => handleFileSelect(e.target.files, category)}
                          className="hidden"
                          id={`file-upload-${category}`}
                        />
                        <div className="flex flex-col items-center gap-2">
                          <i className="ri-upload-cloud-2-line text-2xl text-gray-400 w-8 h-8 flex items-center justify-center"></i>
                          <p className="text-sm text-gray-600">
                            Arrastrá archivos aquí o{' '}
                            <label
                              htmlFor={`file-upload-${category}`}
                              className="text-teal-700 font-semibold hover:text-teal-800 cursor-pointer"
                            >
                              seleccioná desde tu equipo
                            </label>
                          </p>
                          <p className="text-xs text-gray-500">PDF, imágenes u otros documentos</p>
                        </div>
                      </div>
                    )}

                    {getFilesByCategory(category).length > 0 ? (
                      <div className="space-y-2">
                        {getFilesByCategory(category).map(file => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <i className="ri-file-line text-xl text-gray-400 w-5 h-5 flex items-center justify-center flex-shrink-0"></i>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => openFile(file)}
                                disabled={!file.isExisting || !file.url || openingFileId === file.id}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                title="Ver / Descargar"
                              >
                                {openingFileId === file.id ? 'Abriendo...' : 'Ver'}
                              </button>

                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => removeFile(file.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors"
                                  title="Eliminar"
                                >
                                  <i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">Aún no hay documentos cargados</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ✅ Tab Actividad: restringido si no puede ver sensible */}
            {activeTab === 'activity' && !canViewSensitive && (
              <RestrictedTabContent label="la actividad" />
            )}

            {activeTab === 'activity' && canViewSensitive && (savedReservationId || reservation?.id) && (
              <ActivityTab
                orgId={orgId}
                reservationId={(savedReservationId || reservation!.id)}
                docks={docks}
                statuses={statuses}
              />
            )}

            {activeTab === 'activity' && canViewSensitive && !(savedReservationId || reservation?.id) && (
              <div className="p-6">
                <div className="text-center py-12">
                  <i className="ri-information-line text-4xl text-gray-300 mb-3 w-10 h-10 flex items-center justify-center mx-auto"></i>
                  <p className="text-sm text-gray-500">El historial de actividad estará disponible después de crear la reserva</p>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3 bg-white sticky bottom-0">
            <div className="text-xs text-gray-500">
              {isReadOnly && !canViewSensitive
                ? 'Lectura limitada — algunos datos están ocultos'
                : isReadOnly
                ? 'Modo solo lectura — no podés modificar esta reserva'
                : copyOfId
                ? <span className="inline-flex items-center gap-1.5 text-teal-700 font-medium"><i className="ri-file-copy-line w-3.5 h-3.5 flex items-center justify-center"></i>Copia de #{copyOfId.slice(0, 8)} — nueva reserva independiente</span>
                : <>Los campos con <span className="text-gray-800 font-semibold">*</span> son obligatorios</>}
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Copiar reserva — solo visible cuando hay reserva existente y el usuario puede verla */}
              {reservation && canViewSensitive && onCopy && (
                <button
                  type="button"
                  onClick={() => onCopy(reservation)}
                  disabled={saving}
                  className="px-4 py-2.5 text-sm font-medium text-teal-700 hover:bg-teal-50 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 border border-teal-200 flex items-center gap-2"
                  title="Crear una copia editable de esta reserva"
                >
                  <i className="ri-file-copy-line w-4 h-4 flex items-center justify-center"></i>
                  Copiar reserva
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 border border-gray-200"
              >
                {isReadOnly ? 'Cerrar' : 'Cancelar'}
              </button>
              {!isReadOnly && (
                <button
                  type="submit"
                  disabled={saving || hasNoProviders}
                  className="px-4 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap disabled:opacity-50 shadow-sm"
                  title={hasNoProviders ? 'No podés crear reservas sin proveedores asignados' : ''}
                >
                  {saving ? 'Guardando...' : reservation ? 'Guardar Cambios' : 'Crear Reserva'}
                </button>
              )}
            </div>
          </div>
        </form>

        <ConfirmModal
          isOpen={notifyModal.isOpen}
          type={notifyModal.type}
          title={notifyModal.title}
          message={notifyModal.message}
          onConfirm={() => setNotifyModal({ ...notifyModal, isOpen: false })}
          onCancel={() => setNotifyModal({ ...notifyModal, isOpen: false })}
        />

        {/* ── Confirm: conservar o descartar borrador al cerrar ──────────── */}
        <ConfirmModal
          isOpen={showDiscardConfirm}
          type="warning"
          title="Tenés un borrador sin guardar"
          message="¿Qué hacemos con los datos que ingresaste? Podés conservarlos para continuar después, o descartarlos definitivamente."
          confirmText="Descartar y cerrar"
          cancelText="Conservar borrador"
          onConfirm={handleDiscardAndClose}
          onCancel={handleKeepAndClose}
        />

        {/* ── Panel de resultado de recurrencia ───────────────────────── */}
        {recurringResult !== null && (
          <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center z-20 rounded-2xl p-8">
            {/* Icono */}
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 ${
                recurringResult.skipped_count === 0
                  ? 'bg-teal-100'
                  : recurringResult.created_count === 0
                  ? 'bg-red-100'
                  : 'bg-amber-100'
              }`}
            >
              <i
                className={`text-3xl w-8 h-8 flex items-center justify-center ${
                  recurringResult.skipped_count === 0
                    ? 'ri-checkbox-circle-line text-teal-700'
                    : recurringResult.created_count === 0
                    ? 'ri-close-circle-line text-red-600'
                    : 'ri-error-warning-line text-amber-600'
                }`}
              ></i>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-1 text-center">
              {recurringResult.skipped_count === 0
                ? 'Reservas creadas exitosamente'
                : recurringResult.created_count === 0
                ? 'No se pudieron crear las reservas'
                : 'Reservas creadas con advertencias'}
            </h3>

            {/* Resumen de números */}
            <div className="flex items-center gap-6 mt-4 mb-5">
              <div className="text-center">
                <p className="text-2xl font-bold text-teal-700">
                  {/* +1 por la reserva original */}
                  {recurringResult.created_count + 1}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">Creadas</p>
              </div>
              {recurringResult.skipped_count > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">{recurringResult.skipped_count}</p>
                  <p className="text-xs text-gray-600 mt-0.5">No creadas</p>
                </div>
              )}
            </div>

            {/* Detalle de omitidas */}
            {recurringResult.skipped_reservations.length > 0 && (
              <div className="w-full max-w-md bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-amber-900 mb-2">Reservas no creadas:</p>
                <div className="space-y-2">
                  {recurringResult.skipped_reservations.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <i className="ri-close-circle-line text-amber-600 text-sm w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                      <div className="min-w-0">
                        <p className="text-xs text-amber-800 font-medium">
                          {new Date(s.startDatetime).toLocaleString('es-ES', {
                            timeZone: tz,
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </p>
                        <p className="text-xs text-amber-700">{s.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
