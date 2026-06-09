import { useState, useEffect, useCallback, useRef } from 'react';
import React from 'react';
import ReservationQRModal from '../../../components/feature/ReservationQRModal';
import type { ReservationQRData } from '../../../components/feature/ReservationQRModal';
import SearchSelect from '../../../components/base/SearchSelect';
import { formatProviderLabel } from '../../../utils/providerFormat';
import { Dock } from '../../../types/dock';
import { useAuth } from '../../../contexts/AuthContext';
import { calendarService, regenerateReservationQRAssets, type Reservation } from '../../../services/calendarService';
import { activityLogService } from '../../../services/activityLogService';
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
  onSave: () => void | Promise<void>;
  onCopy?: (reservation: Reservation) => void;
  reservation?: Reservation | null;
  docks: Dock[];
  statuses: any[];
  defaults?: any;
  orgId: string;
  warehouseId?: string | null;
  warehouseTimezone?: string;
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

const MASKED_VALUE = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

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
  const tz = warehouseTimezone || DEFAULT_TIMEZONE;

  const isOwner = reservation ? reservation.created_by === user?.id : true;
  const isPrivileged = canLocal('admin.users.create') || canLocal('admin.matrix.update');

  const { isBlocked: isStatusBlocked } = useReservationBlockedStatus(
    orgId,
    reservation?.id ?? null,
    reservation?.status_id ?? null,
    (reservation as any)?.client_id ?? null
  );

  const [removedExistingFileIds, setRemovedExistingFileIds] = useState<string[]>([]);
  const [savedReservationId, setSavedReservationId] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'documents' | 'activity'>('info');
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
  const [cargoQuantity, setCargoQuantity] = useState<string>('');

  const [allowedProviders, setAllowedProviders] = useState<UserProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providersError, setProvidersError] = useState<string>('');

  const hasSameProvider = reservation && reservation.shipper_provider
    ? allowedProviders.some(p => p.id === reservation.shipper_provider)
    : false;

  const canEditReservation = !reservation || isOwner || isPrivileged || hasSameProvider;
  const canViewSensitive = canEditReservation;
  const isReadOnly = !!reservation && (!canEditReservation || isStatusBlocked);

  const [notifyModal, setNotifyModal] = useState({
    isOpen: false,
    type: 'info' as 'info' | 'warning' | 'error' | 'success',
    title: '',
    message: '',
  });

  const [recurrenceConfig, setRecurrenceConfig] = useState<RecurrenceConfig>(DEFAULT_RECURRENCE_CONFIG);

  const [isConsolidated, setIsConsolidated] = useState(false);
  const [consolidatedProviders, setConsolidatedProviders] = useState<
    Array<{ provider_id: string; provider_name: string; package_quantity: number }>
  >([]);
  const [consolidatedProviderId, setConsolidatedProviderId] = useState('');
  const [consolidatedQuantity, setConsolidatedQuantity] = useState('');
  const [consolidatedError, setConsolidatedError] = useState('');

  // ── Bloques colapsables ──
  const [expandCargoBlock, setExpandCargoBlock] = useState(false);
  const [expandDateTimeBlock, setExpandDateTimeBlock] = useState(false);

  interface RecurringResult {
    created_count: number;
    skipped_count: number;
    skipped_reservations: Array<{ startDatetime: string; reason: string }>;
  }
  const [recurringResult, setRecurringResult] = useState<RecurringResult | null>(null);

  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [draftAgeLabel, setDraftAgeLabel] = useState<string>('');

  const isNewReservation = !reservation;

  const { saveDraft, clearDraft, readDraft } = useReservationDraft({
    orgId,
    isOpen,
    isNewReservation,
  });

  const initSessionRef = useRef<string>('');
  const statusIdPendingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && orgId) loadCatalogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orgId, warehouseId]);

  const initNewForm = useCallback(() => {
    const now = defaults?.start_datetime ? new Date(defaults.start_datetime) : new Date();
    const endDt = defaults?.end_datetime
      ? new Date(defaults.end_datetime)
      : new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const initialStatusId = defaults?.status_id || statuses[0]?.id || '';
    setRecurrenceConfig(DEFAULT_RECURRENCE_CONFIG);
    setFormData({
      dockId: defaults?.dock_id || '',
      startDate: toWarehouseDateString(now, tz),
      startTime: toWarehouseTimeString(now, tz),
      endDate: toWarehouseDateString(endDt, tz),
      endTime: toWarehouseTimeString(endDt, tz),
      purchaseOrder: defaults?.purchase_order || '',
      truckPlate: defaults?.truck_plate || '',
      orderRequestNumber: defaults?.order_request_number || '',
      shipperProvider: defaults?.is_consolidated ? '' : (defaults?.shipper_provider || ''),
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
    setIsImported(defaults?.is_imported != null ? !!defaults.is_imported : !!(defaults?.dua));
    setCancelReason('');
    setManualOverride(false);
    setSuggestedMinutes(null);
    setCargoQuantity(defaults?.quantity_value != null ? String(defaults.quantity_value) : '');
    setShowDraftBanner(false);
    setDraftWarnings([]);
    setDraftAgeLabel('');
    setActiveTab('info');
    const defaultsIsConsolidated = !!defaults?.is_consolidated;
    setIsConsolidated(defaultsIsConsolidated);
    if (defaultsIsConsolidated) {
      const cps = (defaults?.consolidated_providers || []).map((cp: any) => ({
        provider_id: cp.provider_id,
        provider_name: cp.provider_name || '\u2014',
        package_quantity: cp.package_quantity,
      }));
      setConsolidatedProviders(cps);
    } else {
      setConsolidatedProviders([]);
    }
    setConsolidatedProviderId('');
    setConsolidatedQuantity('');
    setConsolidatedError('');
  }, [defaults, statuses, tz]);

  const loadCatalogs = async () => {
    try {
      setLoadingProviders(true);
      setProvidersError('');
      const [allProvidersData, cargoTypesData] = await Promise.all([
        providersService.getByWarehouse(orgId, warehouseId ?? null, true),
        cargoTypesService.getByWarehouse(orgId, warehouseId ?? null, true),
      ]);
      setProviders(allProvidersData);
      setCargoTypes(cargoTypesData);
      let visibleProviders: Provider[] | UserProvider[] = [];
      if (isPrivileged) {
        visibleProviders = allProvidersData;
      } else if (user?.id) {
        try {
          const rawUserProviders = await userProvidersService.getUserProviders(orgId, user.id);
          if (warehouseId) {
            const warehouseProviderIds = new Set(allProvidersData.map((p) => p.id));
            // Proveedores que están tanto en el almacén como asignados al usuario (directa o cluster)
            const warehouseMatched = rawUserProviders.filter((up) => warehouseProviderIds.has(up.id));
            // Proveedores asignados vía cluster que NO están en el warehouse — deben verse igual
            const clusterOnly = rawUserProviders.filter((up) => !warehouseProviderIds.has(up.id));
            visibleProviders = [...warehouseMatched, ...clusterOnly];
          } else {
            visibleProviders = rawUserProviders;
          }
        } catch (error: any) { /* non-blocking */ }
      }
      const preselectedProviderId = defaults?.shipper_provider || reservation?.shipper_provider || '';
      if (preselectedProviderId) {
        const alreadyIncluded = (visibleProviders as UserProvider[]).some(p => p.id === preselectedProviderId);
        if (!alreadyIncluded) {
          const missingProvider = allProvidersData.find(p => p.id === preselectedProviderId);
          if (missingProvider) visibleProviders = [...visibleProviders, missingProvider] as UserProvider[];
        }
      }
      setAllowedProviders(visibleProviders as UserProvider[]);
    } catch (error) { /* non-blocking */ }
    finally { setLoadingProviders(false); }
  };

  useEffect(() => {
    const loadReservationFiles = async () => {
      if (!isOpen || !orgId) return;
      setRemovedExistingFileIds(prev => (prev.length ? [] : prev));
      if (!reservation?.id) { setFiles([]); return; }
      if (!canViewSensitive) { setFiles([]); return; }
      try {
        const rows = await calendarService.getReservationFiles(orgId, reservation.id);
        const mapped: FileItem[] = rows.map((r: any) => ({
          id: r.id, name: r.file_name, size: r.file_size ?? 0, type: r.mime_type ?? '',
          url: r.file_url, uploadedAt: r.uploaded_at, uploadedBy: r.uploaded_by,
          isExisting: true, category: String(r.category || 'otros').toLowerCase()
        }));
        setFiles(mapped);
      } catch (e) { /* non-blocking */ }
    };
    loadReservationFiles();
  }, [isOpen, orgId, reservation?.id, canViewSensitive]);

  useEffect(() => {
    if (!isOpen) {
      initSessionRef.current = '';
      statusIdPendingRef.current = false;
      return;
    }
    const sessionKey = `${reservation?.id ?? 'new'}`;
    if (initSessionRef.current === sessionKey) return;
    initSessionRef.current = sessionKey;
    setSavedReservationId(reservation?.id ?? null);
    setRecurringResult(null);

    if (reservation) {
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
      setIsConsolidated(false);
      setConsolidatedProviders([]);
      setConsolidatedProviderId('');
      setConsolidatedQuantity('');
      setConsolidatedError('');
      if (reservation.id && reservation.is_consolidated) {
        setIsConsolidated(true);
        calendarService.getReservationConsolidatedProviders(orgId, reservation.id).then(rows => {
          setConsolidatedProviders(rows.map(r => ({
            provider_id: r.provider_id,
            provider_name: r.provider_name || providers.find(p => p.id === r.provider_id)?.name || '\u2014',
            package_quantity: r.package_quantity,
          })));
        }).catch(() => { /* non-blocking */ });
      }
    } else {
      const draft = readDraft();
      if (draft) {
        const currentDockIds = docks.map((d) => d.id);
        const { isConsistent, warnings } = checkDraftContext(draft, currentDockIds, defaults);
        setRecurrenceConfig(draft.recurrenceConfig ?? DEFAULT_RECURRENCE_CONFIG);
        setFormData(draft.formData);
        setIsImported(draft.isImported);
        setCancelReason(draft.cancelReason ?? '');
        setManualOverride(false);
        setSuggestedMinutes(null);
        setFiles([]);
        setActiveTab('info');
        setIsConsolidated(draft.isConsolidated ?? false);
        setConsolidatedProviders(draft.consolidatedProviders ?? []);
        setConsolidatedProviderId('');
        setConsolidatedQuantity('');
        setConsolidatedError('');
        setDraftWarnings(isConsistent ? [] : warnings);
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
        statusIdPendingRef.current = false;
        setCargoQuantity(draft.cargoQuantity ?? '');
      } else {
        statusIdPendingRef.current = statuses.length === 0;
        initNewForm();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reservation?.id]);

  useEffect(() => {
    if (!isOpen || !isNewReservation || !statusIdPendingRef.current || statuses.length === 0) return;
    setFormData(prev => {
      if (prev.statusId) return prev;
      const fallbackId = defaults?.status_id || statuses[0]?.id || '';
      if (!fallbackId) return prev;
      statusIdPendingRef.current = false;
      return { ...prev, statusId: fallbackId };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, isOpen, isNewReservation]);

  useEffect(() => {
    if (isOpen && !reservation && allowedProviders.length === 1 && !formData.shipperProvider && !isConsolidated) {
      setFormData(prev => ({ ...prev, shipperProvider: allowedProviders[0].id }));
    }
  }, [isOpen, reservation, allowedProviders, formData.shipperProvider, isConsolidated]);

  useEffect(() => {
    if (!isOpen || !isNewReservation) return;
    saveDraft({ formData, isImported, cancelReason, recurrenceConfig, defaults, cargoQuantity, isConsolidated, consolidatedProviders });
  }, [formData, isImported, cancelReason, recurrenceConfig, isOpen, isNewReservation, cargoQuantity]);

  const isProviderFieldDisabled = allowedProviders.length === 1;
  const hasNoProviders = allowedProviders.length === 0;

  useEffect(() => {
    const hasValidProvider = isConsolidated
      ? consolidatedProviders.length > 0
      : !!formData.shipperProvider;
    if (!manualOverride && hasValidProvider && formData.cargoType && formData.startDate && formData.startTime) {
      updateSuggestedDuration();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.shipperProvider, formData.cargoType, formData.startDate, formData.startTime, manualOverride, cargoQuantity, isConsolidated, consolidatedProviders]);

  const updateSuggestedDuration = async () => {
    const providerId = isConsolidated ? consolidatedProviders[0]?.provider_id : formData.shipperProvider;
    const provider = providers.find(p => p.id === providerId);
    const cargoType = cargoTypes.find(ct => ct.id === formData.cargoType);
    if (!provider || !cargoType) return;
    const startDatetime = `${formData.startDate}T${formData.startTime}:00`;
    let effectiveQuantity: number | null = null;
    if (isConsolidated) {
      const totalPackages = consolidatedProviders.reduce((sum, cp) => sum + cp.package_quantity, 0);
      if (totalPackages > 0) effectiveQuantity = totalPackages;
    } else {
      const parsed = Number(cargoQuantity);
      if (cargoQuantity.trim() !== '' && Number.isFinite(parsed) && parsed > 0) effectiveQuantity = parsed;
    }
    try {
      const profile = await timeProfilesService.getMatchingProfile(orgId, provider.id, cargoType.id, startDatetime, warehouseId);
      if (cargoType.is_dynamic === true && profile && profile.base_minutes != null && profile.minutes_per_unit != null && effectiveQuantity != null) {
        const dynamicMinutes = Math.round(profile.base_minutes + effectiveQuantity * Number(profile.minutes_per_unit));
        setSuggestedMinutes(dynamicMinutes);
        const startDate = fromWarehouseLocalToUtc(formData.startDate, formData.startTime, tz);
        const endDate = new Date(startDate.getTime() + dynamicMinutes * 60 * 1000);
        setFormData(prev => ({ ...prev, endDate: toWarehouseDateString(endDate, tz), endTime: toWarehouseTimeString(endDate, tz) }));
        return;
      }
      if (profile) {
        setSuggestedMinutes(profile.avg_minutes);
        const startDate = fromWarehouseLocalToUtc(formData.startDate, formData.startTime, tz);
        const endDate = new Date(startDate.getTime() + profile.avg_minutes * 60 * 1000);
        setFormData(prev => ({ ...prev, endDate: toWarehouseDateString(endDate, tz), endTime: toWarehouseTimeString(endDate, tz) }));
      } else if (cargoType.default_minutes) {
        setSuggestedMinutes(cargoType.default_minutes);
        const startDate = fromWarehouseLocalToUtc(formData.startDate, formData.startTime, tz);
        const endDate = new Date(startDate.getTime() + cargoType.default_minutes * 60 * 1000);
        setFormData(prev => ({ ...prev, endDate: toWarehouseDateString(endDate, tz), endTime: toWarehouseTimeString(endDate, tz) }));
      } else {
        setSuggestedMinutes(null);
      }
    } catch (error: any) {
      setNotifyModal({ isOpen: true, type: 'error', title: 'Error al cargar', message: 'Error al cargar perfil de tiempo' });
    }
  };

  const totalConsolidatedPackages = consolidatedProviders.reduce((sum, cp) => sum + cp.package_quantity, 0);

  const handleAddConsolidatedProvider = () => {
    setConsolidatedError('');
    if (!consolidatedProviderId) { setConsolidatedError('Seleccioná un proveedor para agregar.'); return; }
    const qty = Number(consolidatedQuantity);
    if (!Number.isFinite(qty) || qty <= 0) { setConsolidatedError('La cantidad de bultos debe ser mayor a 0.'); return; }
    if (consolidatedProviders.some(cp => cp.provider_id === consolidatedProviderId)) { setConsolidatedError('Este proveedor ya fue agregado.'); return; }
    const providerName = providers.find(p => p.id === consolidatedProviderId)?.name || '\u2014';
    setConsolidatedProviders(prev => [...prev, { provider_id: consolidatedProviderId, provider_name: providerName, package_quantity: qty }]);
    setConsolidatedProviderId('');
    setConsolidatedQuantity('');
  };

  const handleRemoveConsolidatedProvider = (providerId: string) => {
    setConsolidatedProviders(prev => prev.filter(cp => cp.provider_id !== providerId));
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
      id: `temp-${Date.now()}-${Math.random()}`, file, name: file.name, size: file.size, type: file.type, category
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => { setIsDragging(false); };
  const handleDrop = (e: React.DragEvent, category: FileCategory) => {
    e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files, category);
  };

  const removeFile = (fileId: string) => {
    const f = files.find(x => x.id === fileId);
    if (f?.isExisting) setRemovedExistingFileIds(prev => (prev.includes(fileId) ? prev : [...prev, fileId]));
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFilesByCategory = (category: FileCategory) => files.filter(f => f.category === category);

  const handleClose = useCallback(() => {
    if (isNewReservation && hasMeaningfulDraftData(formData, defaults)) { setShowDiscardConfirm(true); return; }
    clearDraft(); onClose();
  }, [isNewReservation, formData, defaults, clearDraft, onClose]);

  const handleDiscardAndClose = useCallback(() => { setShowDiscardConfirm(false); clearDraft(); onClose(); }, [clearDraft, onClose]);
  const handleKeepAndClose = useCallback(() => { setShowDiscardConfirm(false); onClose(); }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasLimitedStatus = canLocal('reservations.limit_status_view');
    if (hasLimitedStatus && formData.statusId) {
      const selectedStatus = statuses.find(s => s.id === formData.statusId);
      const allowedCodes = ['PENDING', 'CANCELLED'];
      if (selectedStatus && !allowedCodes.includes(selectedStatus.code || '')) {
        setNotifyModal({ isOpen: true, type: 'warning', title: 'Estado no permitido', message: 'Tu rol solo permite asignar los estados Pendiente o Cancelado.' });
        return;
      }
    }
    if (isConsolidated && consolidatedProviders.length === 0) {
      setNotifyModal({ isOpen: true, type: 'warning', title: 'Proveedores requeridos', message: 'La reserva consolidada debe tener al menos un proveedor con cantidad de bultos.' });
      return;
    }
    if (isReadOnly) {
      setNotifyModal({ isOpen: true, type: 'warning', title: 'Sin permisos para editar', message: 'Esta reserva pertenece a otro proveedor/usuario. Solo el creador, un usuario Admin/Full Access, o un usuario con el mismo proveedor asignado puede modificarla.' });
      return;
    }
    if (isCancelledStatus && !cancelReason.trim()) {
      setNotifyModal({ isOpen: true, type: 'warning', title: 'Razón de cancelación requerida', message: 'Por favor, ingresá una razón para cancelar la reserva.' });
      return;
    }
    const showBLField = formData.operationType === 'zona_franca' && isImported;
    if (showBLField && !formData.blNumber.trim()) {
      setNotifyModal({ isOpen: true, type: 'warning', title: 'Campo requerido', message: 'El campo "BL / Conocimiento del contenedor" es obligatorio para operaciones de Zona Franca con carga importada.' });
      return;
    }
    const startDateTime = fromWarehouseLocalToUtc(formData.startDate, formData.startTime, tz);
    const endDateTime = fromWarehouseLocalToUtc(formData.endDate, formData.endTime, tz);
    if (endDateTime <= startDateTime) {
      setNotifyModal({ isOpen: true, type: 'warning', title: 'Fecha inválida', message: 'La fecha/hora de fin debe ser posterior a la de inicio' });
      return;
    }
    if (!user?.id) {
      setNotifyModal({ isOpen: true, type: 'error', title: 'Error de autenticación', message: 'Usuario no autenticado' });
      return;
    }
    const payload: Partial<Reservation> = {
      org_id: orgId, dock_id: formData.dockId,
      start_datetime: startDateTime.toISOString(), end_datetime: endDateTime.toISOString(),
      purchase_order: formData.purchaseOrder || null, truck_plate: formData.truckPlate || null,
      order_request_number: formData.orderRequestNumber || null,
      shipper_provider: isConsolidated ? (consolidatedProviders[0]?.provider_id || formData.shipperProvider || null) : (formData.shipperProvider || null),
      driver: formData.driver?.trim() || null,
      dua: isImported ? (formData.dua?.trim() || null) : null,
      invoice: formData.invoice || null, status_id: formData.statusId || null,
      notes: formData.notes || null, transport_type: formData.transportType,
      cargo_type: formData.cargoType, operation_type: formData.operationType || null,
      is_imported: isImported, is_cancelled: isCancelledStatus,
      cancel_reason: isCancelledStatus ? cancelReason : null, is_consolidated: isConsolidated,
      ...(defaults?.client_id ? { client_id: defaults.client_id } : {}),
      bl_number: (formData.operationType === 'zona_franca' && isImported) ? (formData.blNumber?.trim() || null) : null,
      quantity_value: (() => {
        const ct = cargoTypes.find(c => c.id === formData.cargoType);
        if (ct?.is_dynamic) {
          if (isConsolidated) { const total = totalConsolidatedPackages; return total > 0 ? total : null; }
          if (cargoQuantity.trim() !== '') { const q = parseInt(cargoQuantity, 10); return Number.isFinite(q) && q > 0 ? q : null; }
        }
        return null;
      })(),
    };
    if (!reservation && defaults?.client_id && warehouseId && user?.id) {
      const todayStr = toWarehouseDateString(new Date(), tz);
      if (formData.startDate === todayStr) {
        try {
          const cutoffCheck = await sameDayCutoffService.checkCutoff(orgId, defaults.client_id, warehouseId, tz, user.id, isPrivileged);
          if (cutoffCheck.blocked) { setNotifyModal({ isOpen: true, type: 'warning', title: 'Fuera del horario de reservas', message: cutoffCheck.message }); return; }
          if (cutoffCheck.verificationFailed) { setNotifyModal({ isOpen: true, type: 'error', title: 'No se pudo verificar el corte del mismo día', message: `${cutoffCheck.message} Por seguridad, la reserva no fue creada.` }); return; }
        } catch (cutoffErr) {
          setNotifyModal({ isOpen: true, type: 'error', title: 'Error al verificar la regla de reservas', message: 'No se pudo verificar la regla de corte del mismo día. Por seguridad, la reserva no fue creada.' });
          return;
        }
      }
    }
    try {
      setSaving(true);
      let saved: Reservation;
      if (reservation) {
        const isStatusOnlyChange =
          formData.statusId !== reservation.status_id &&
          formData.dockId === reservation.dock_id &&
          formData.startDate === toWarehouseDateString(new Date(reservation.start_datetime), tz) &&
          formData.startTime === toWarehouseTimeString(new Date(reservation.start_datetime), tz) &&
          formData.endDate === toWarehouseDateString(new Date(reservation.end_datetime), tz) &&
          formData.endTime === toWarehouseTimeString(new Date(reservation.end_datetime), tz) &&
          formData.purchaseOrder === (reservation.purchase_order || '') &&
          formData.truckPlate === (reservation.truck_plate || '') &&
          formData.orderRequestNumber === (reservation.order_request_number || '') &&
          formData.shipperProvider === (reservation.shipper_provider || '') &&
          formData.driver === (reservation.driver || '') &&
          formData.dua === (reservation.dua || '') &&
          formData.invoice === (reservation.invoice || '') &&
          formData.notes === (reservation.notes || '') &&
          formData.transportType === (reservation.transport_type || 'inbound') &&
          formData.cargoType === (reservation.cargo_type || '') &&
          formData.operationType === (reservation.operation_type || '') &&
          formData.blNumber === ((reservation as any).bl_number || '') &&
          isImported === !!((reservation as any).is_imported ?? !!(reservation.dua)) &&
          cancelReason === (reservation.cancel_reason || '') &&
          isConsolidated === !!reservation.is_consolidated;
        if (isStatusOnlyChange) {
          saved = await calendarService.updateReservationStatus(reservation.id, formData.statusId);
        } else {
          saved = await calendarService.updateReservation(reservation.id, payload);
        }
      } else {
        saved = await calendarService.createReservation(payload);
      }
      if (isConsolidated && saved.id) {
        await calendarService.saveConsolidatedProviders(orgId, saved.id, consolidatedProviders.map(cp => ({ provider_id: cp.provider_id, package_quantity: cp.package_quantity })));
      }
      // Log cambio de is_consolidated (solo en edición y cuando efectivamente cambió)
      if (reservation && saved.id) {
        const prevConsolidated = !!reservation.is_consolidated;
        if (prevConsolidated !== isConsolidated) {
          activityLogService.writeLog({
            orgId,
            entityType: 'reservation',
            entityId: saved.id,
            action: 'updated',
            field: 'is_consolidated',
            oldValue: prevConsolidated ? 'Sí' : 'No',
            newValue: isConsolidated ? 'Sí' : 'No',
          }).catch(() => {});
        }

        // Log cambio de quantity_value
        const prevQuantity = (reservation as any).quantity_value;
        const newQuantity = payload.quantity_value;
        if (prevQuantity !== newQuantity) {
          activityLogService.writeLog({
            orgId,
            entityType: 'reservation',
            entityId: saved.id,
            action: 'updated',
            field: 'quantity_value',
            oldValue: prevQuantity != null ? String(prevQuantity) : '—',
            newValue: newQuantity != null ? String(newQuantity) : '—',
          }).catch(() => {});
        }

        // Log cambio de end_datetime
        const prevEndMs = new Date(reservation.end_datetime).getTime();
        const newEndMs = payload.end_datetime ? new Date(payload.end_datetime).getTime() : null;
        if (newEndMs !== null && Math.abs(prevEndMs - newEndMs) >= 60000) {
          activityLogService.writeLog({
            orgId,
            entityType: 'reservation',
            entityId: saved.id,
            action: 'updated',
            field: 'end_datetime',
            oldValue: reservation.end_datetime,
            newValue: payload.end_datetime ?? '',
          }).catch(() => {});
        }
      }
      // Regenerar QR assets en background después de un UPDATE real (no bloqueante)
      // Solo para edición y cuando hay cambios visuales (no aplica a status-only ni a creaciones)
      if (reservation && saved.id) {
        const isStatusOnlyChangeLocal = reservation &&
          formData.statusId !== reservation.status_id &&
          formData.dockId === reservation.dock_id &&
          formData.startDate === toWarehouseDateString(new Date(reservation.start_datetime), tz) &&
          formData.startTime === toWarehouseTimeString(new Date(reservation.start_datetime), tz) &&
          formData.endDate === toWarehouseDateString(new Date(reservation.end_datetime), tz) &&
          formData.endTime === toWarehouseTimeString(new Date(reservation.end_datetime), tz) &&
          formData.shipperProvider === (reservation.shipper_provider || '') &&
          formData.operationType === (reservation.operation_type || '') &&
          isConsolidated === !!reservation.is_consolidated;

        if (!isStatusOnlyChangeLocal) {
          console.log('[QR] scheduling regeneration after update', { reservationId: saved.id });
          regenerateReservationQRAssets(orgId, saved.id).catch((err: any) => {
            console.error('[QR] regenerate failed silently', saved.id, err?.message);
          });
        }
      }
      setSavedReservationId(saved.id);
      if (removedExistingFileIds.length > 0) {
        for (const fileId of removedExistingFileIds) await calendarService.deleteReservationFile(orgId, fileId);
        setRemovedExistingFileIds(prev => (prev.length ? [] : prev));
      }
      const newFiles = files.filter(f => !!f.file && !f.isExisting);
      for (const f of newFiles) {
        if (!f.file) continue;
        const inserted = await calendarService.uploadReservationFile({ orgId, reservationId: saved.id, category: (f.category || 'otros') as string, file: f.file });
        setFiles(prev => prev.map(x => x.id === f.id ? { id: inserted.id, name: inserted.file_name, size: inserted.file_size ?? f.size, type: inserted.mime_type ?? f.type, url: inserted.file_url, uploadedAt: inserted.uploaded_at, uploadedBy: inserted.uploaded_by, isExisting: true, category: String(inserted.category || 'otros').toLowerCase() } : x));
      }
      if (!reservation && recurrenceConfig.enabled) {
        const startDatetimeISO = `${formData.startDate}T${formData.startTime}:00`;
        const endDatetimeISO = `${formData.endDate}T${formData.endTime}:00`;
        const additionalDates = generateRecurringDates(startDatetimeISO, endDatetimeISO, recurrenceConfig);
        if (additionalDates.length > 0) {
          const recurringPayload: Partial<Reservation> = { ...payload, recurrence: null };
          const result = await calendarService.createRecurringReservations(recurringPayload, additionalDates);
          clearDraft();
          try { await (onSave as (...args: any[]) => any)(); } catch (_refreshErr) { /* refresco no bloqueante */ }
          setRecurringResult({ created_count: result.created_count, skipped_count: result.skipped_count, skipped_reservations: result.skipped_reservations });
          return;
        }
      }
      // Reserva guardada correctamente — llamar onSave para que page.tsx refresque.
      // onSave puede fallar (timeout del calendario) sin afectar al guardado de la reserva.
      clearDraft();
      try {
        await (onSave as (...args: any[]) => any)();
      } catch (_refreshErr) {
        // El refresh falló (timeout u otro error), pero la reserva ya está guardada.
        // page.tsx mostrará el banner de error de refresco por su propia cuenta.
      }
    } catch (error: any) {
      // Solo llega aquí si el GUARDADO falló (no el refresh)
      setNotifyModal({ isOpen: true, type: 'error', title: 'Error al guardar', message: error?.message || 'Error al guardar reserva' });
    } finally { setSaving(false); }
  };

  const openFile = async (file: FileItem) => {
    try {
      setOpenFileError('');
      setOpeningFileId(file.id);
      if (!file.isExisting || !file.url) { setNotifyModal({ isOpen: true, type: 'warning', title: 'Archivo no guardado', message: 'Este archivo todavía no está guardado. Guardá la reserva primero.' }); return; }
      const signedUrl = await calendarService.getReservationFileSignedUrl(file.url);
      if (!signedUrl) { setNotifyModal({ isOpen: true, type: 'error', title: 'Error', message: 'No se pudo generar el enlace del archivo.' }); return; }
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e: any) { /* non-blocking */ }
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

  // Resumen para header del bloque de carga/proveedor
  const getCargoBlockSummary = () => {
    const ct = cargoTypes.find(c => c.id === formData.cargoType);
    const cargoLabel = ct?.name || 'Pendiente';
    let providerLabel: string;
    if (isConsolidated) { providerLabel = 'Consolidado'; }
    else if (formData.shipperProvider) { providerLabel = providers.find(p => p.id === formData.shipperProvider)?.name || 'Pendiente'; }
    else { providerLabel = 'Pendiente'; }
    return `Tipo de carga: ${cargoLabel} · Proveedor: ${providerLabel}`;
  };

  // Resumen para header del bloque de fecha/hora
  const getDateTimeBlockSummary = () => {
    if (formData.startDate && formData.startTime && formData.endTime) {
      return `Fecha y hora: ${formData.startDate} ${formData.startTime} - ${formData.endTime}`;
    }
    return 'Fecha y hora: Pendiente';
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const displaySensitive = (value: string) => { if (canViewSensitive) return value; return value ? MASKED_VALUE : ''; };

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
    cmr: 'CMR', facturas: 'Facturas', otros: 'Otros documentos', internos: 'Documentos internos'
  };

  const inputBase = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white shadow-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';
  const inputReadOnly = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-100 shadow-sm outline-none cursor-not-allowed text-gray-600';
  const inputMasked = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 shadow-sm outline-none cursor-not-allowed text-gray-400 select-none';
  const selectBase = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white shadow-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer';
  const selectReadOnly = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-100 shadow-sm outline-none cursor-not-allowed text-gray-600';
  const labelBase = 'block text-sm font-medium text-gray-800 mb-2';
  const hintBase = 'mt-1 text-xs text-gray-500';

  const inputCls = isReadOnly ? inputReadOnly : inputBase;
  const selectCls = isReadOnly ? selectReadOnly : selectBase;
  const sensitiveInputCls = isReadOnly ? (canViewSensitive ? inputReadOnly : inputMasked) : inputBase;

  const isCancelledStatus = (() => {
    if (!formData.statusId) return false;
    const found = statuses.find(s => s.id === formData.statusId);
    if (!found) return false;
    const code = (found.code || '').toLowerCase().trim();
    const name = (found.name || '').toLowerCase().trim();
    return code === 'cancelado' || code === 'cancelled' || code === 'canceled' || name === 'cancelado' || name === 'cancelled' || name === 'canceled';
  })();

  if (!isOpen) return null;

  const RestrictedBanner = () => (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <i className="ri-eye-off-line text-amber-700 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-amber-900">Solo lectura — Información limitada</h4>
          <p className="text-xs text-amber-800 mt-1">Esta reserva pertenece a otro proveedor/usuario. Solo podés ver la información básica (andén, horario, estado y tipo de carga). Los datos sensibles, documentos y actividad no están disponibles.</p>
        </div>
      </div>
    </div>
  );

  const RestrictedTabContent = ({ label }: { label: string }) => (
    <div className="p-6">
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <i className="ri-lock-line text-2xl text-gray-400 w-6 h-6 flex items-center justify-center"></i>
        </div>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">No disponible</h4>
        <p className="text-xs text-gray-500 max-w-xs mx-auto">No tenés permisos para ver {label} de esta reserva.</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">Reserva #{getReservationId()}</h2>
                {getTimeRange() && (<span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">{getTimeRange()}</span>)}
                {isReadOnly && !canViewSensitive && (<span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200"><i className="ri-eye-off-line mr-1 w-3 h-3 flex items-center justify-center"></i>Lectura limitada</span>)}
                {isReadOnly && canViewSensitive && (<span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200"><i className="ri-lock-line mr-1 w-3 h-3 flex items-center justify-center"></i>Solo lectura</span>)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                {dockName && (<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200"><i className="ri-road-map-line w-4 h-4 inline-flex items-center justify-center text-gray-500"></i>{dockName}</span>)}
                {statusName && (<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200"><i className="ri-flag-line w-4 h-4 inline-flex items-center justify-center text-gray-500"></i>{statusName}</span>)}
                {cargoTypeName && (<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200"><i className="ri-archive-line w-4 h-4 inline-flex items-center justify-center text-gray-500"></i>{cargoTypeName}</span>)}
                {operationTypeInfo && (<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800"><i className={`${operationTypeInfo.icon} w-4 h-4 inline-flex items-center justify-center text-teal-600`}></i>{operationTypeInfo.label}</span>)}
                {providerName && canViewSensitive && (<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200"><i className="ri-truck-line w-4 h-4 inline-flex items-center justify-center text-gray-500"></i>{providerName}</span>)}
                {suggestedMinutes && !isReadOnly && (<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800"><i className="ri-time-line w-4 h-4 inline-flex items-center justify-center text-teal-700"></i>{suggestedMinutes} min sugeridos</span>)}
              </div>
            </div>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
              <i className="ri-close-line text-2xl w-6 h-6 flex items-center justify-center"></i>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white">
          <div className="flex px-6 gap-1">
            <button type="button" onClick={() => setActiveTab('info')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'info' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>{'Información'}</button>
            <button type="button" onClick={() => setActiveTab('documents')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'documents' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
              Documentos{!canViewSensitive && (<i className="ri-lock-line text-xs w-3 h-3 inline-flex items-center justify-center opacity-50"></i>)}
            </button>
            <button type="button" onClick={() => setActiveTab('activity')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'activity' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
              Actividad{!canViewSensitive && (<i className="ri-lock-line text-xs w-3 h-3 inline-flex items-center justify-center opacity-50"></i>)}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'info' && (
              <div className="p-6">
                <div className="max-w-2xl">
                  {copyOfId && (
                    <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-teal-600"><i className="ri-file-copy-line text-lg"></i></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-teal-900">Copia de la reserva #{copyOfId.slice(0, 8)}</p>
                          <p className="text-xs text-teal-700 mt-0.5">Esta es una nueva reserva independiente. Podés cambiar el andén, fecha, hora y cualquier otro campo antes de guardar.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {showDraftBanner && (
                    <div className={`mb-5 rounded-xl border p-4 ${draftWarnings.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 ${draftWarnings.length > 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                          <i className={draftWarnings.length > 0 ? 'ri-alert-line text-lg' : 'ri-save-line text-lg'}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${draftWarnings.length > 0 ? 'text-amber-900' : 'text-teal-900'}`}>Borrador guardado {draftAgeLabel}</p>
                          {draftWarnings.length > 0 ? (
                            <ul className="mt-1 space-y-0.5">{draftWarnings.map((w, i) => (<li key={i} className="text-xs text-amber-800">\u2022 {w}</li>))}</ul>
                          ) : (
                            <p className="text-xs text-teal-700 mt-0.5">Se restauraron los datos que ingresaste anteriormente.</p>
                          )}
                          <div className="flex items-center gap-2 mt-3">
                            <button type="button" onClick={() => setShowDraftBanner(false)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${draftWarnings.length > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}>Continuar con el borrador</button>
                            <button type="button" onClick={() => { clearDraft(); initNewForm(); }} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap">Descartar y empezar nuevo</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {isStatusBlocked && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <i className="ri-lock-2-line text-red-600 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-red-900">Esta reserva no puede modificarse en su estado actual</h4>
                          <p className="text-xs text-red-700 mt-1">El estado "<span className="font-semibold">{reservation?.status?.name}</span>" bloquea toda edición.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isReadOnly && !isStatusBlocked && !canViewSensitive && <RestrictedBanner />}
                  {isReadOnly && !isStatusBlocked && canViewSensitive && (
                    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <i className="ri-lock-line text-amber-700 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-amber-900">Sin permisos para editar</h4>
                          <p className="text-xs text-amber-800 mt-1">Esta reserva pertenece a otro proveedor/usuario.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900">Datos principales</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {isReadOnly && !canViewSensitive ? 'Estás viendo información básica. Los datos sensibles están ocultos.'
                        : isReadOnly ? 'Estás viendo esta reserva en modo solo lectura.'
                        : 'Completa primero la carga y proveedor para sugerir duración automáticamente (si aplica).'}
                    </p>
                  </div>

                  <div className="space-y-5">
                    {!isReadOnly && hasNoProviders && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <i className="ri-alert-line text-yellow-700 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-yellow-900">No tenés proveedores asignados</h4>
                            <p className="text-xs text-yellow-800 mt-1">Contactá a un administrador para que te asigne proveedores antes de crear reservas.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {!isReadOnly && allowedProviders.length === 1 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <i className="ri-information-line text-blue-700 text-xl w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-blue-900">Proveedor preseleccionado</h4>
                            <p className="text-xs text-blue-800 mt-1">Tenés asignado un único proveedor: <span className="font-semibold">{allowedProviders[0].name}</span></p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── BLOQUE 1: Tipo de Carga / Proveedor (colapsable) ── */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandCargoBlock(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-100/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <i className="ri-archive-line text-teal-700 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                          <span className="text-sm font-semibold text-gray-900 truncate">{getCargoBlockSummary()}</span>
                        </div>
                        <i className={`ri-arrow-down-s-line text-gray-500 w-5 h-5 flex items-center justify-center transition-transform duration-200 ${expandCargoBlock ? 'rotate-180' : ''}`}></i>
                      </button>
                      {expandCargoBlock && (
                        <div className="px-4 pb-4 space-y-4">
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

                          {/* ✅ Proveedor: oculto cuando es consolidada */}
                          {!isConsolidated && (
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
                                    options={allowedProviders.map(p => ({ id: p.id, label: formatProviderLabel(p) }))}
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
                          )}

                          {/* ✅ Checkbox Reserva Consolidada */}
                          {!isReadOnly && !hasNoProviders && (
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                type="checkbox"
                                id="consolidated-check"
                                checked={isConsolidated}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setIsConsolidated(checked);
                                  if (checked) {
                                    setFormData(prev => ({ ...prev, shipperProvider: '' }));
                                    setManualOverride(false);
                                  } else {
                                    setConsolidatedProviders([]);
                                    setConsolidatedProviderId('');
                                    setConsolidatedQuantity('');
                                    setConsolidatedError('');
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                              />
                              <label htmlFor="consolidated-check" className="text-sm text-gray-700 cursor-pointer select-none">
                                Reserva consolidada
                              </label>
                            </div>
                          )}

                          {/* ✅ Panel Consolidado: editable */}
                          {isConsolidated && !isReadOnly && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <i className="ri-stack-line text-teal-700 w-4 h-4 flex items-center justify-center"></i>
                                <span className="text-sm font-semibold text-gray-900">Proveedores del consolidado</span>
                              </div>
                              <div className="flex gap-2 items-end">
                                <div className="flex-1 min-w-0">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                                  <SearchSelect
                                    options={allowedProviders
                                      .filter(p => !consolidatedProviders.some(cp => cp.provider_id === p.id))
                                      .map(p => ({ id: p.id, label: formatProviderLabel(p) }))}
                                    value={consolidatedProviderId}
                                    onChange={setConsolidatedProviderId}
                                    placeholder={
                                      allowedProviders.length === 0
                                        ? 'Sin proveedores'
                                        : 'Buscar proveedor...'
                                    }
                                    disabled={hasNoProviders || loadingProviders}
                                  />
                                </div>
                                <div className="w-28 flex-shrink-0">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Bultos</label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={consolidatedQuantity}
                                    onChange={(e) => setConsolidatedQuantity(e.target.value)}
                                    placeholder="0"
                                    className={inputBase}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={handleAddConsolidatedProvider}
                                  className="px-3 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                                >
                                  <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
                                  Agregar
                                </button>
                              </div>

                              {consolidatedError && (
                                <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                                  <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
                                  {consolidatedError}
                                </div>
                              )}

                              {consolidatedProviders.length > 0 && (
                                <div className="mt-3 space-y-1.5">
                                  {consolidatedProviders.map((cp) => (
                                    <div
                                      key={cp.provider_id}
                                      className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-lg"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <i className="ri-truck-line text-teal-600 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-gray-900 truncate">{cp.provider_name}</p>
                                          <p className="text-xs text-gray-500">{cp.package_quantity} bulto{cp.package_quantity !== 1 ? 's' : ''}</p>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveConsolidatedProvider(cp.provider_id)}
                                        className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0"
                                        title="Eliminar proveedor"
                                      >
                                        <i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                                <span className="text-sm font-medium text-gray-700">Total de bultos</span>
                                <span className="text-sm font-bold text-teal-700">
                                  {totalConsolidatedPackages}
                                </span>
                              </div>

                              {consolidatedProviders.length === 0 && (
                                <p className="mt-2 text-xs text-gray-500">
                                  Agregá al menos un proveedor con la cantidad de bultos.
                                </p>
                              )}
                            </div>
                          )}

                          {/* ✅ Mostrar proveedores consolidados en modo edición (read-only) */}
                          {isConsolidated && isReadOnly && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <i className="ri-stack-line text-teal-700 w-4 h-4 flex items-center justify-center"></i>
                                <span className="text-sm font-semibold text-gray-900">Proveedores del consolidado</span>
                              </div>
                              {consolidatedProviders.length > 0 ? (
                                <div className="space-y-1.5">
                                  {consolidatedProviders.map((cp) => (
                                    <div
                                      key={cp.provider_id}
                                      className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-lg"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <i className="ri-truck-line text-teal-600 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-gray-900 truncate">{cp.provider_name}</p>
                                          <p className="text-xs text-gray-500">{cp.package_quantity} bulto{cp.package_quantity !== 1 ? 's' : ''}</p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500">Sin proveedores consolidados registrados.</p>
                              )}
                              {consolidatedProviders.length > 0 && (
                                <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                                  <span className="text-sm font-medium text-gray-700">Total de bultos</span>
                                  <span className="text-sm font-bold text-teal-700">
                                    {totalConsolidatedPackages}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Campo dinámico: solo lectura ── */}
                          {(() => {
                            const selectedCT = cargoTypes.find(ct => ct.id === formData.cargoType);
                            if (!selectedCT?.is_dynamic) return null;
                            const label = selectedCT.unit_label || selectedCT.measurement_key || 'Cantidad';

                            if (isConsolidated) {
                              return (
                                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center gap-2 mb-1">
                                    <i className="ri-flashlight-line text-teal-700 w-4 h-4 flex items-center justify-center"></i>
                                    <span className="text-sm font-semibold text-teal-900">Datos del tipo de carga dinámico</span>
                                  </div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {label}
                                  </label>
                                  <input
                                    type="number"
                                    value={totalConsolidatedPackages}
                                    readOnly
                                    className="w-full px-3 py-2.5 border border-teal-200 rounded-lg text-sm bg-teal-50/80 text-teal-900 cursor-default select-none"
                                  />
                                  <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                                    <i className="ri-lock-line text-xs"></i>
                                    Cantidad total calculada desde los proveedores consolidados.
                                  </p>
                                </div>
                              );
                            }

                            // Edición de reserva existente: campo editable
                            const isEditableQuantity = !!reservation && !isReadOnly;

                            return (
                              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <i className="ri-flashlight-line text-teal-700 w-4 h-4 flex items-center justify-center"></i>
                                  <span className="text-sm font-semibold text-teal-900">Datos del tipo de carga dinámico</span>
                                </div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  {label}
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={cargoQuantity}
                                  readOnly={!isEditableQuantity}
                                  onChange={isEditableQuantity ? (e) => {
                                    setCargoQuantity(e.target.value);
                                    setManualOverride(false);
                                  } : undefined}
                                  className={
                                    isEditableQuantity
                                      ? 'w-full px-3 py-2.5 border border-teal-300 rounded-lg text-sm bg-white text-gray-900 outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent'
                                      : 'w-full px-3 py-2.5 border border-teal-200 rounded-lg text-sm bg-teal-50/80 text-teal-900 cursor-default select-none'
                                  }
                                />
                                {isEditableQuantity ? (
                                  <p className="text-xs text-teal-700 mt-1">
                                    Podés editar la cantidad. El tiempo sugerido se recalculará automáticamente.
                                  </p>
                                ) : (
                                  <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                                    <i className="ri-lock-line text-xs"></i>
                                    Valor capturado en el primer paso. Para modificarlo, cerrá este modal y creá una nueva reserva.
                                  </p>
                                )}
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
                                    {cargoTypes.find(ct => ct.id === formData.cargoType)?.is_dynamic && (
                                      <span className="text-teal-600 ml-1 text-xs">
                                        {isConsolidated
                                          ? `(calculado por ${totalConsolidatedPackages} bultos en total)`
                                          : cargoQuantity
                                          ? '(calculado por cantidad)'
                                          : ''}
                                      </span>
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
                      )}
                    </div>

                    {/* ✅ Tipo de operación */}
                    <div className={`bg-white border rounded-xl p-4 ${!formData.operationType && !isReadOnly ? 'border-red-300' : 'border-gray-200'}`}>
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Tipo de operación *</h4>
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
                        <p className="mt-2 text-xs text-gray-500">
                          Seleccioná el tipo de operación que clasifica esta reserva. Este campo es obligatorio.
                        </p>
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
                            {statuses.filter(s => s.is_active === true).map(status => (
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

                    {/* ── BLOQUE 2: Fecha y hora (colapsable) ── */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandDateTimeBlock(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <i className="ri-calendar-line text-teal-700 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                          <span className="text-sm font-semibold text-gray-900 truncate">{getDateTimeBlockSummary()}</span>
                        </div>
                        <i className={`ri-arrow-down-s-line text-gray-500 w-5 h-5 flex items-center justify-center transition-transform duration-200 ${expandDateTimeBlock ? 'rotate-180' : ''}`}></i>
                      </button>
                      {expandDateTimeBlock && (
                        <div className="px-4 pb-4 space-y-4">
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
                      )}
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
              {/* Botón Ver QR — solo visible cuando hay reserva existente con ID válido */}
              {(reservation?.id || savedReservationId) && (
                <button
                  type="button"
                  onClick={() => setShowQRModal(true)}
                  disabled={saving}
                  className="px-4 py-2.5 text-sm font-medium text-teal-700 hover:bg-teal-50 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 border border-teal-200 flex items-center gap-2 cursor-pointer"
                  title="Ver código QR de esta reserva"
                >
                  <i className="ri-qr-code-line w-4 h-4 flex items-center justify-center"></i>
                  Ver QR
                </button>
              )}
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
                  disabled={saving || hasNoProviders || !formData.operationType || (isConsolidated && consolidatedProviders.length === 0)}
                  className="px-4 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap disabled:opacity-50 shadow-sm"
                  title={hasNoProviders ? 'No podés crear reservas sin proveedores asignados' : !formData.operationType ? 'Seleccioná un tipo de operación para guardar' : (isConsolidated && consolidatedProviders.length === 0) ? 'Agregá al menos un proveedor consolidado' : ''}
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

        {/* ── Modal QR ─────────────────────────────────────────────────── */}
        {showQRModal && (reservation?.id || savedReservationId) && (() => {
          const resId = reservation?.id || savedReservationId!;
          const qrData: ReservationQRData = {
            id: resId,
            providerName: providerName || '—',
            startDatetime: reservation?.start_datetime ||
              (formData.startDate && formData.startTime
                ? `${formData.startDate}T${formData.startTime}:00`
                : new Date().toISOString()),
            endDatetime: reservation?.end_datetime ||
              (formData.endDate && formData.endTime
                ? `${formData.endDate}T${formData.endTime}:00`
                : new Date().toISOString()),
            operationType: formData.operationType || reservation?.operation_type || null,
            warehouseTimezone: tz,
          };
          return (
            <ReservationQRModal
              isOpen={showQRModal}
              onClose={() => setShowQRModal(false)}
              reservation={qrData}
            />
          );
        })()}

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