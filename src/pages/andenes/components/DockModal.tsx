import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useFormDraft, getDraftAge } from '../../../hooks/useReservationDraft';
import { ConfirmModal } from '../../../components/base/ConfirmModal';
import {
  getOrgUsersForPicker,
  getOrgRolesForPicker,
  OrgUserOption,
  OrgRoleOption,
} from '@/services/orgUsersService';
import {
  DockVisibility,
  DockVisibilityMode,
  getDockVisibility,
  saveDockVisibility,
} from '@/services/dockVisibilityService';

interface DockCategory {
  id: string;
  name: string;
  code: string;
  color: string;
}

interface DockStatus {
  id: string;
  name: string;
  code: string;
  color: string;
  is_blocking: boolean;
}

interface Dock {
  id: string;
  name: string;
  reference?: string | null;
  header_color?: string | null;
  category_id: string;
  status_id: string;
  is_active: boolean;
  warehouse_id?: string | null;
  visible_user_id?: string | null;
  visibility_mode?: 'all' | 'users' | 'roles' | null;
}

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

interface DockModalProps {
  dock: Dock | null;
  categories: DockCategory[];
  statuses: DockStatus[];
  orgId: string;
  onClose: () => void;
  onSave: () => void;
}

/** Calcula si el texto sobre un fondo hex debe ser claro u oscuro */
function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#111827' : '#FFFFFF';
}

/** Valida que un string sea un color hex válido tipo #RRGGBB */
function isValidHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export default function DockModal({ dock, categories, statuses, orgId, onClose, onSave }: DockModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    reference: '',
    header_color: '',
    category_id: '',
    status_id: '',
    warehouse_id: '',
    is_active: true
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [orgUsers, setOrgUsers] = useState<OrgUserOption[]>([]);
  const [orgRoles, setOrgRoles] = useState<OrgRoleOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // ── Visibilidad del andén ────────────────────────────────────────────────
  const [visibilityMode, setVisibilityMode] = useState<DockVisibilityMode>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loadingVisibility, setLoadingVisibility] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hexInputValue, setHexInputValue] = useState('');

  // ── Draft persistence ─────────────────────────────────────────────────────
  const isNewRecord = !dock;
  const DRAFT_KEY = `draft_dock_${orgId}_new`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [draftAgeLabel, setDraftAgeLabel] = useState('');
  const { saveDraft, clearDraft, readDraft } = useFormDraft<typeof formData>({ storageKey: DRAFT_KEY, isNewRecord });

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        setLoadingWarehouses(true);
        const { data, error } = await supabase
          .from('warehouses')
          .select('id, name, location')
          .eq('org_id', orgId)
          .order('name');

        if (error) throw error;
        setWarehouses(data || []);
      } catch (error: any) {
        setErrors({ general: 'Error al cargar almacenes' });
      } finally {
        setLoadingWarehouses(false);
      }
    };

    if (orgId) {
      loadWarehouses();
    }
  }, [orgId]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        const [users, roles] = await Promise.all([
          getOrgUsersForPicker(orgId),
          getOrgRolesForPicker(orgId),
        ]);
        setOrgUsers(users);
        setOrgRoles(roles);
      } catch {
        setOrgUsers([]);
        setOrgRoles([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    if (orgId) {
      loadUsers();
    }
  }, [orgId]);

  // Carga la visibilidad configurada del andén (usuarios / roles)
  useEffect(() => {
    const loadVisibility = async () => {
      if (!dock?.id) {
        setVisibilityMode('all');
        setSelectedUserIds([]);
        setSelectedRoleIds([]);
        return;
      }
      try {
        setLoadingVisibility(true);
        const visibility = await getDockVisibility(dock.id);
        setVisibilityMode(visibility.mode);
        setSelectedUserIds(visibility.userIds);
        setSelectedRoleIds(visibility.roleIds);
      } catch {
        setVisibilityMode(dock.visibility_mode === 'roles' ? 'roles' : dock.visible_user_id ? 'users' : 'all');
        setSelectedUserIds(dock.visible_user_id ? [dock.visible_user_id] : []);
        setSelectedRoleIds([]);
      } finally {
        setLoadingVisibility(false);
      }
    };

    loadVisibility();
  }, [dock?.id]);

  useEffect(() => {
    if (dock) {
      const color = dock.header_color || '';
      setFormData({
        name: dock.name,
        reference: dock.reference || '',
        header_color: color,
        category_id: dock.category_id,
        status_id: dock.status_id,
        warehouse_id: dock.warehouse_id || '',
        is_active: dock.is_active
      });
      setHexInputValue(color);
      setShowDraftBanner(false);
    } else {
      const draft = readDraft();
      if (draft) {
        const { visible_user_id: _legacy, ...draftRest } = draft.formData as any;
        setFormData(draftRest);
        setHexInputValue(draft.formData.header_color || '');
        setDraftAgeLabel(getDraftAge(draft.savedAt));
        setShowDraftBanner(true);
      } else {
        setFormData({
          name: '',
          reference: '',
          header_color: '',
          category_id: categories[0]?.id || '',
          status_id: statuses[0]?.id || '',
          warehouse_id: '',
          is_active: true
        });
        setHexInputValue('');
        setShowDraftBanner(false);
      }
    }
  }, [dock, categories, statuses]);

  // Auto-save borrador
  useEffect(() => {
    if (!isNewRecord) return;
    saveDraft(formData);
  }, [formData, isNewRecord]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }
    if (!formData.category_id) {
      newErrors.category_id = 'La categoría es requerida';
    }
    if (!formData.status_id) {
      newErrors.status_id = 'El estado es requerido';
    }
    if (formData.header_color && !isValidHex(formData.header_color)) {
      newErrors.header_color = 'Color inválido. Usa formato #RRGGBB';
    }
    if (visibilityMode === 'users' && selectedUserIds.length === 0) {
      newErrors.visibility = 'Seleccioná al menos un usuario (o volvé a "Todos")';
    }
    if (visibilityMode === 'roles' && selectedRoleIds.length === 0) {
      newErrors.visibility = 'Seleccioná al menos un rol (o volvé a "Todos")';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleHexInputChange = (value: string) => {
    setHexInputValue(value);
    // Normalizar: asegurar que empiece con #
    const normalized = value.startsWith('#') ? value : `#${value}`;
    if (isValidHex(normalized)) {
      setFormData(prev => ({ ...prev, header_color: normalized }));
      setErrors(prev => ({ ...prev, header_color: '' }));
    } else {
      setFormData(prev => ({ ...prev, header_color: value }));
    }
  };

  const handleColorPickerChange = (value: string) => {
    setFormData(prev => ({ ...prev, header_color: value }));
    setHexInputValue(value);
    setErrors(prev => ({ ...prev, header_color: '' }));
  };

  const handleClearColor = () => {
    setFormData(prev => ({ ...prev, header_color: '' }));
    setHexInputValue('');
    setErrors(prev => ({ ...prev, header_color: '' }));
  };

  const handleClose = useCallback(() => {
    if (isNewRecord && formData.name.trim()) {
      setShowDiscardConfirm(true);
      return;
    }
    clearDraft();
    onClose();
  }, [isNewRecord, formData.name, clearDraft, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    clearDraft();
    onClose();
  }, [clearDraft, onClose]);

  const handleKeepAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      setSaving(true);

      const dataToSave = {
        name: formData.name.trim(),
        reference: formData.reference.trim() || null,
        header_color: formData.header_color.trim() || null,
        category_id: formData.category_id,
        status_id: formData.status_id,
        warehouse_id: formData.warehouse_id || null,
        is_active: formData.is_active,
        updated_at: new Date().toISOString()
      };

      let savedDockId = dock?.id ?? '';

      if (dock) {
        const { error } = await supabase
          .from('docks')
          .update(dataToSave)
          .eq('id', dock.id);

        if (error) throw error;
      } else {
        const { data: createdDock, error } = await supabase
          .from('docks')
          .insert({
            org_id: orgId,
            ...dataToSave
          })
          .select('id')
          .single();

        if (error) throw error;
        savedDockId = createdDock?.id ?? '';
      }

      if (savedDockId) {
        const visibility: DockVisibility = {
          mode: visibilityMode,
          userIds: selectedUserIds,
          roleIds: selectedRoleIds,
        };
        await saveDockVisibility(savedDockId, visibility);
      }

      clearDraft();
      onSave();
    } catch (error: any) {
      setErrors({ general: error?.message || 'Error al guardar andén' });
    } finally {
      setSaving(false);
    }
  };

  const previewColor = isValidHex(formData.header_color) ? formData.header_color : null;

  const filteredUsers = orgUsers.filter((u) => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return true;
    return u.name.toLowerCase().includes(term) || (u.email ?? '').toLowerCase().includes(term);
  });

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setErrors((prev) => ({ ...prev, visibility: '' }));
  };

  const toggleRole = (id: string) => {
    setSelectedRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setErrors((prev) => ({ ...prev, visibility: '' }));
  };

  const visibilityIsPrivate = visibilityMode !== 'all';

  const selectedUserNames = selectedUserIds
    .map((id) => orgUsers.find((u) => u.id === id)?.name || 'Usuario')
    .slice(0, 4);
  const selectedRoleNames = selectedRoleIds
    .map((id) => orgRoles.find((r) => r.id === id)?.name || 'Rol')
    .slice(0, 4);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {dock ? 'Editar Andén' : 'Nuevo Andén'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Banner de borrador */}
          {showDraftBanner && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <i className="ri-save-line text-teal-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900">Borrador guardado {draftAgeLabel}</p>
                  <p className="text-xs text-teal-700 mt-0.5">Se restauraron los datos que ingresaste anteriormente.</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setShowDraftBanner(false)}
                      className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap">
                      Continuar con el borrador
                    </button>
                    <button type="button" onClick={() => { clearDraft(); setFormData({ name: '', reference: '', header_color: '', category_id: categories[0]?.id || '', status_id: statuses[0]?.id || '', warehouse_id: '', is_active: true }); setHexInputValue(''); setShowDraftBanner(false); setVisibilityMode('all'); setSelectedUserIds([]); setSelectedRoleIds([]); }}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                      Descartar y empezar nuevo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {errors.general && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {errors.general}
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Ej: 1012"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Referencia */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Referencia
            </label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              maxLength={120}
              className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Ej: El coco"
            />
            <p className="mt-1 text-xs text-gray-500">
              Opcional: descripción o referencia adicional del andén
            </p>
          </div>

          {/* Color del encabezado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color del encabezado
            </label>

            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <input
                  type="color"
                  value={previewColor || '#6366f1'}
                  onChange={(e) => handleColorPickerChange(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                  title="Seleccionar color"
                />
              </div>
              <input
                type="text"
                value={hexInputValue}
                onChange={(e) => handleHexInputChange(e.target.value)}
                maxLength={7}
                placeholder="#RRGGBB"
                className={`flex-1 px-4 py-2 text-sm font-mono border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                  errors.header_color ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {formData.header_color && (
                <button
                  type="button"
                  onClick={handleClearColor}
                  className="flex-shrink-0 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  title="Sin color"
                >
                  <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
                </button>
              )}
            </div>

            {errors.header_color && (
              <p className="mt-1 text-sm text-red-500">{errors.header_color}</p>
            )}

            {previewColor ? (
              <div
                className="mt-2 rounded-lg px-3 py-2 flex flex-col items-center justify-center gap-0.5"
                style={{ backgroundColor: previewColor }}
              >
                <span
                  className="text-sm font-semibold leading-tight"
                  style={{ color: getContrastColor(previewColor) }}
                >
                  {formData.name || 'Andén'}
                </span>
                {formData.reference && (
                  <span
                    className="text-[10px] leading-tight"
                    style={{ color: getContrastColor(previewColor), opacity: 0.8 }}
                  >
                    {formData.reference}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Opcional. Si no se asigna, se usa el color de la categoría del andén.
              </p>
            )}
          </div>

          {/* Almacén */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Almacén
            </label>
            {loadingWarehouses ? (
              <div className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                Cargando almacenes...
              </div>
            ) : warehouses.length === 0 ? (
              <div className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                No hay almacenes disponibles
              </div>
            ) : (
              <select
                value={formData.warehouse_id}
                onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="">Sin almacén</option>
                {warehouses.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}{warehouse.location ? ` - ${warehouse.location}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Visibilidad del andén */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visibilidad del andén
            </label>

            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
              {([
                { key: 'all', label: 'Todos', icon: 'ri-earth-line' },
                { key: 'users', label: 'Usuarios', icon: 'ri-user-line' },
                { key: 'roles', label: 'Roles', icon: 'ri-shield-user-line' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setVisibilityMode(opt.key);
                    setErrors((prev) => ({ ...prev, visibility: '' }));
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    visibilityMode === opt.key
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <i className={`${opt.icon} w-4 h-4 flex items-center justify-center`}></i>
                  {opt.label}
                </button>
              ))}
            </div>

            {visibilityMode === 'all' && (
              <p className="mt-2 text-xs text-gray-500">
                Andén normal: lo ve cualquiera que tenga acceso al almacén, según su rol.
              </p>
            )}

            {visibilityMode === 'users' && (
              <div className="mt-3">
                {loadingUsers || loadingVisibility ? (
                  <div className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-center">
                    Cargando usuarios...
                  </div>
                ) : orgUsers.length === 0 ? (
                  <div className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-center">
                    No hay usuarios disponibles en la organización
                  </div>
                ) : (
                  <>
                    <div className="relative mb-2">
                      <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Buscar usuario..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto border border-gray-300 rounded-lg divide-y divide-gray-100">
                      {filteredUsers.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-gray-500 text-center">Sin resultados</p>
                      ) : (
                        filteredUsers.map((u) => (
                          <label
                            key={u.id}
                            className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(u.id)}
                              onChange={() => toggleUser(u.id)}
                              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-gray-900 truncate">{u.name}</span>
                              {u.email && (
                                <span className="block text-[11px] text-gray-500 truncate">{u.email}</span>
                              )}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {visibilityMode === 'roles' && (
              <div className="mt-3">
                {loadingUsers ? (
                  <div className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-center">
                    Cargando roles...
                  </div>
                ) : orgRoles.length === 0 ? (
                  <div className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-center">
                    No hay roles asignados en la organización
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto border border-gray-300 rounded-lg divide-y divide-gray-100">
                    {orgRoles.map((r) => (
                      <label
                        key={r.id}
                        className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRoleIds.includes(r.id)}
                          onChange={() => toggleRole(r.id)}
                          className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                        <span className="text-sm text-gray-900 truncate">{r.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {errors.visibility && (
              <p className="mt-1 text-xs text-red-500">{errors.visibility}</p>
            )}

            {(selectedUserNames.length > 0 || selectedRoleNames.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {visibilityMode === 'users'
                  ? selectedUserNames.map((name, idx) => (
                      <span
                        key={`${name}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-[11px] font-medium"
                      >
                        {name}
                      </span>
                    ))
                  : selectedRoleNames.map((name, idx) => (
                      <span
                        key={`${name}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-[11px] font-medium"
                      >
                        {name}
                      </span>
                    ))}
                {(visibilityMode === 'users' ? selectedUserIds.length : selectedRoleIds.length) > 4 && (
                  <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] font-medium">
                    +{(visibilityMode === 'users' ? selectedUserIds.length : selectedRoleIds.length) - 4} más
                  </span>
                )}
              </div>
            )}

            {visibilityIsPrivate && (
              <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <i className="ri-lock-line text-amber-600 text-base w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
                <p className="text-xs text-amber-800">
                  Andén privado: solo lo verán {visibilityMode === 'users' ? 'los usuarios seleccionados' : 'los usuarios con los roles seleccionados'}. Nadie más lo verá, ni otros administradores.
                </p>
              </div>
            )}
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                errors.category_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Seleccionar categoría</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.category_id && (
              <p className="mt-1 text-sm text-red-500">{errors.category_id}</p>
            )}
          </div>

          {/* Estado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estado <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.status_id}
              onChange={(e) => setFormData({ ...formData, status_id: e.target.value })}
              className={`w-full px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                errors.status_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Seleccionar estado</option>
              {statuses.map(status => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
            {errors.status_id && (
              <p className="mt-1 text-sm text-red-500">{errors.status_id}</p>
            )}
          </div>

          {/* Activo */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-gray-700">Andén activo</span>
            </label>
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              {saving ? (
                <>
                  <i className="ri-loader-4-line animate-spin text-lg w-5 h-5 flex items-center justify-center"></i>
                  Guardando...
                </>
              ) : (
                <>
                  <i className="ri-save-line text-lg w-5 h-5 flex items-center justify-center"></i>
                  {dock ? 'Actualizar' : 'Crear'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Confirm: conservar o descartar borrador */}
      <ConfirmModal
        isOpen={showDiscardConfirm}
        type="warning"
        title="Tenés un borrador sin guardar"
        message="¿Qué hacemos con los datos del andén que ingresaste?"
        confirmText="Descartar y cerrar"
        cancelText="Conservar borrador"
        showCancel
        onConfirm={handleDiscardAndClose}
        onCancel={handleKeepAndClose}
      />
    </div>
  );
}
