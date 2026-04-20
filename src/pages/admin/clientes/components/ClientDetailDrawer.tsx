import { useState, useEffect, useMemo } from 'react';
import type { Client, ClientRules, ClientRulesFormData, ClientProviderPayload } from '../../../../types/client';
import type { Dock } from '../../../../types/dock';
import type { Provider } from '../../../../types/catalog';
import ClientPickupRulesTab from './ClientPickupRulesTab';
import BlockedStatusesConfig from '../../../calendario/components/BlockedStatusesConfig';
import RuleBlock from './RuleBlock';
import SameDayCutoffRuleBlock from './SameDayCutoffRuleBlock';

interface ClientDetailDrawerProps {
  isOpen: boolean;
  client: Client | null;
  rules: ClientRules | null;
  docks: Dock[];
  clientDockIds: string[];
  providers: Provider[];
  clientProviders: { provider_id: string; is_default: boolean }[];
  canUpdate: boolean;
  canAssignDocks: boolean;
  canUpdateRules: boolean;
  canViewProviders: boolean;
  canManageProviders: boolean;
  onClose: () => void;
  onUpdateClient: (data: { name: string; legal_id?: string; email?: string; phone?: string; address?: string; notes?: string; is_active: boolean }) => Promise<void>;
  onUpdateRules: (data: ClientRulesFormData) => Promise<void>;
  onUpdateDocks: (dockIds: string[]) => Promise<void>;
  onUpdateProviders: (providers: ClientProviderPayload[]) => Promise<void>;
}

type TabType = 'info' | 'docks' | 'rules' | 'providers';

export default function ClientDetailDrawer({
  isOpen,
  client,
  rules,
  docks,
  clientDockIds,
  providers,
  clientProviders,
  canUpdate,
  canAssignDocks,
  canUpdateRules,
  canViewProviders,
  canManageProviders,
  onClose,
  onUpdateClient,
  onUpdateRules,
  onUpdateDocks,
  onUpdateProviders
}: ClientDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accordion: solo un bloque abierto a la vez (null = todos cerrados)
  const [openRuleId, setOpenRuleId] = useState<string | null>('edit-cutoff');

  const toggleRule = (id: string) => {
    setOpenRuleId((prev) => (prev === id ? null : id));
  };

  // Form data para info
  const [infoForm, setInfoForm] = useState({
    name: '',
    legal_id: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    is_active: true
  });

  // Form data para rules
  const [rulesForm, setRulesForm] = useState({
    edit_cutoff_hours: 0,
    allow_all_docks: false,
    dock_allocation_mode: 'SEQUENTIAL'
  });

  // Form data para docks
  const [selectedDockIds, setSelectedDockIds] = useState<string[]>([]);
  const [dockSearch, setDockSearch] = useState('');
  const [expandedWarehouses, setExpandedWarehouses] = useState<Set<string>>(new Set());

  // Form data para providers
  const [selectedProviders, setSelectedProviders] = useState<Map<string, boolean>>(new Map());
  const [providerSearch, setProviderSearch] = useState('');

  useEffect(() => {
    if (client) {
      setInfoForm({
        name: client.name,
        legal_id: client.legal_id || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        notes: client.notes || '',
        is_active: client.is_active
      });
    }
  }, [client]);

  useEffect(() => {
    if (rules) {
      setRulesForm({
        edit_cutoff_hours: rules.edit_cutoff_hours,
        allow_all_docks: rules.allow_all_docks,
        dock_allocation_mode: (!rules.dock_allocation_mode || rules.dock_allocation_mode === 'NONE') ? 'SEQUENTIAL' : rules.dock_allocation_mode
      });
    }
  }, [rules]);

  useEffect(() => {
    setSelectedDockIds(clientDockIds);
  }, [clientDockIds]);

  // Expandir todos los grupos al cargar docks o al buscar
  useEffect(() => {
    const keys = new Set(docks.map(d => d.warehouse_id ?? '__no_warehouse__'));
    setExpandedWarehouses(keys);
  }, [docks, dockSearch]);

  useEffect(() => {
    const map = new Map<string, boolean>();
    clientProviders.forEach(cp => {
      map.set(cp.provider_id, cp.is_default);
    });
    setSelectedProviders(map);
  }, [clientProviders]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('info');
      setError(null);
      setOpenRuleId('edit-cutoff'); // resetear accordion al abrir drawer
    }
  }, [isOpen]);

  const handleSaveInfo = async () => {
    if (!client || !canUpdate) return;

    if (!infoForm.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onUpdateClient(infoForm);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar información');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRules = async () => {
    if (!client || !canUpdateRules) return;

    if (rulesForm.edit_cutoff_hours < 0 || rulesForm.edit_cutoff_hours > 720) {
      setError('Las horas de cutoff deben estar entre 0 y 720');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onUpdateRules(rulesForm);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar reglas');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDocks = async () => {
    if (!client || !canAssignDocks) return;

    try {
      setSaving(true);
      setError(null);
      await onUpdateDocks(selectedDockIds);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar andenes');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProviders = async () => {
    if (!client || !canManageProviders) return;

    // Validar que solo haya un default
    const defaultCount = Array.from(selectedProviders.values()).filter(isDefault => isDefault).length;
    if (defaultCount > 1) {
      setError('Solo puede haber un proveedor por defecto');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const providersPayload: ClientProviderPayload[] = Array.from(selectedProviders.entries()).map(([provider_id, is_default]) => ({
        provider_id,
        is_default
      }));

      await onUpdateProviders(providersPayload);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar proveedores');
    } finally {
      setSaving(false);
    }
  };

  const toggleDock = (dockId: string) => {
    if (selectedDockIds.includes(dockId)) {
      setSelectedDockIds(selectedDockIds.filter(id => id !== dockId));
    } else {
      setSelectedDockIds([...selectedDockIds, dockId]);
    }
  };

  const toggleProvider = (providerId: string) => {
    const newMap = new Map(selectedProviders);
    if (newMap.has(providerId)) {
      newMap.delete(providerId);
    } else {
      newMap.set(providerId, false);
    }
    setSelectedProviders(newMap);
  };

  const toggleProviderDefault = (providerId: string) => {
    const newMap = new Map(selectedProviders);
    const currentDefault = newMap.get(providerId) || false;
    
    // Si se está marcando como default, desmarcar todos los demás
    if (!currentDefault) {
      newMap.forEach((_, key) => {
        newMap.set(key, false);
      });
    }
    
    newMap.set(providerId, !currentDefault);
    setSelectedProviders(newMap);
  };

  const filteredDocks = docks.filter(dock =>
    dock.name.toLowerCase().includes(dockSearch.toLowerCase())
  );

  // Agrupar andenes por almacén
  const docksGroupedByWarehouse = useMemo(() => {
    const groups = new Map<string, { warehouseName: string; warehouseId: string | null; docks: typeof filteredDocks }>();
    filteredDocks.forEach(dock => {
      const key = dock.warehouse_id ?? '__no_warehouse__';
      const label = dock.warehouse_name ?? 'Sin almacén';
      if (!groups.has(key)) {
        groups.set(key, { warehouseName: label, warehouseId: dock.warehouse_id ?? null, docks: [] });
      }
      groups.get(key)!.docks.push(dock);
    });
    return Array.from(groups.values()).sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
  }, [filteredDocks]);

  const filteredProviders = providers.filter(provider =>
    provider.name.toLowerCase().includes(providerSearch.toLowerCase())
  );

  if (!isOpen || !client) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{client.name}</h2>
            <p className="text-sm text-gray-500">
              {client.is_active ? (
                <span className="text-green-600">Activo</span>
              ) : (
                <span className="text-red-600">Inactivo</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'info'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <i className="ri-information-line mr-2"></i>
              Información
            </button>
            <button
              onClick={() => setActiveTab('docks')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'docks'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <i className="ri-truck-line mr-2"></i>
              Andenes
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'rules'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <i className="ri-settings-3-line mr-2"></i>
              Reglas
            </button>
            {canViewProviders && (
              <button
                onClick={() => setActiveTab('providers')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'providers'
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <i className="ri-building-line mr-2"></i>
                Proveedores
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <i className="ri-error-warning-line text-red-600 text-lg mt-0.5"></i>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Tab: Información */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={infoForm.name}
                  onChange={(e) => setInfoForm({ ...infoForm, name: e.target.value })}
                  disabled={!canUpdate || saving}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RUT / ID Legal
                </label>
                <input
                  type="text"
                  value={infoForm.legal_id}
                  onChange={(e) => setInfoForm({ ...infoForm, legal_id: e.target.value })}
                  disabled={!canUpdate || saving}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={infoForm.email}
                    onChange={(e) => setInfoForm({ ...infoForm, email: e.target.value })}
                    disabled={!canUpdate || saving}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={infoForm.phone}
                    onChange={(e) => setInfoForm({ ...infoForm, phone: e.target.value })}
                    disabled={!canUpdate || saving}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  value={infoForm.address}
                  onChange={(e) => setInfoForm({ ...infoForm, address: e.target.value })}
                  disabled={!canUpdate || saving}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={infoForm.notes}
                  onChange={(e) => setInfoForm({ ...infoForm, notes: e.target.value })}
                  rows={3}
                  disabled={!canUpdate || saving}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none disabled:bg-gray-100"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active_drawer"
                  checked={infoForm.is_active}
                  onChange={(e) => setInfoForm({ ...infoForm, is_active: e.target.checked })}
                  disabled={!canUpdate || saving}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 disabled:opacity-50"
                />
                <label htmlFor="is_active_drawer" className="text-sm font-medium text-gray-700">
                  Cliente activo
                </label>
              </div>

              {canUpdate && (
                <div className="pt-4">
                  <button
                    onClick={handleSaveInfo}
                    disabled={saving}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {saving && <i className="ri-loader-4-line animate-spin"></i>}
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab: Andenes */}
          {activeTab === 'docks' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-blue-600 text-lg mt-0.5"></i>
                  <div className="flex-1">
                    <p className="text-sm text-blue-900 font-medium mb-1">
                      Andenes permitidos para este cliente
                    </p>
                    <p className="text-xs text-blue-800">
                      Si "Permitir todos los andenes" está activado en Reglas, esta configuración no aplica.
                    </p>
                  </div>
                </div>
              </div>

              {rules?.allow_all_docks && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <i className="ri-alert-line text-yellow-600 text-lg mt-0.5"></i>
                    <p className="text-sm text-yellow-900">
                      Este cliente tiene acceso a todos los andenes. Desactiva "Permitir todos los andenes" en la pestaña Reglas para gestionar andenes específicos.
                    </p>
                  </div>
                </div>
              )}

              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  type="text"
                  value={dockSearch}
                  onChange={(e) => setDockSearch(e.target.value)}
                  placeholder="Buscar andén..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {canAssignDocks && !rules?.allow_all_docks && filteredDocks.length > 0 && (
                <div className="flex items-center gap-2 justify-end">
                  {filteredDocks.some(d => !selectedDockIds.includes(d.id)) && (
                    <button
                      onClick={() => {
                        const newIds = [...selectedDockIds];
                        filteredDocks.forEach(d => {
                          if (!newIds.includes(d.id)) newIds.push(d.id);
                        });
                        setSelectedDockIds(newIds);
                      }}
                      disabled={saving}
                      className="px-3 py-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-300 rounded-md hover:bg-teal-100 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <i className="ri-checkbox-multiple-line mr-1"></i>
                      Seleccionar todo
                    </button>
                  )}
                  {filteredDocks.some(d => selectedDockIds.includes(d.id)) && (
                    <button
                      onClick={() => {
                        const filteredIds = filteredDocks.map(d => d.id);
                        setSelectedDockIds(selectedDockIds.filter(id => !filteredIds.includes(id)));
                      }}
                      disabled={saving}
                      className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <i className="ri-checkbox-blank-line mr-1"></i>
                      Limpiar selección
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-0.5">
                {filteredDocks.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="ri-inbox-line text-4xl mb-2"></i>
                    <p className="text-sm">No hay andenes disponibles</p>
                  </div>
                ) : (
                  docksGroupedByWarehouse.map((group) => {
                    const groupKey = group.warehouseId ?? '__no_warehouse__';
                    const isExpanded = expandedWarehouses.has(groupKey);
                    const selectedInGroup = group.docks.filter(d => selectedDockIds.includes(d.id)).length;
                    const allInGroupSelected = group.docks.every(d => selectedDockIds.includes(d.id));

                    return (
                      <div key={groupKey} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Header del grupo / almacén */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(expandedWarehouses);
                            if (next.has(groupKey)) next.delete(groupKey);
                            else next.add(groupKey);
                            setExpandedWarehouses(next);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <i className="ri-building-2-line text-gray-500 text-sm w-4 h-4 flex items-center justify-center"></i>
                            <span className="text-sm font-semibold text-gray-800">{group.warehouseName}</span>
                            <span className="text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                              {selectedInGroup}/{group.docks.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {canAssignDocks && !rules?.allow_all_docks && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (allInGroupSelected) {
                                    setSelectedDockIds(prev => prev.filter(id => !group.docks.some(d => d.id === id)));
                                  } else {
                                    const toAdd = group.docks.map(d => d.id).filter(id => !selectedDockIds.includes(id));
                                    setSelectedDockIds(prev => [...prev, ...toAdd]);
                                  }
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
                                className="text-xs text-teal-600 hover:text-teal-800 font-medium px-2 py-0.5 rounded hover:bg-teal-50 transition-colors whitespace-nowrap"
                              >
                                {allInGroupSelected ? 'Quitar todos' : 'Seleccionar todos'}
                              </span>
                            )}
                            {isExpanded
                              ? <i className="ri-arrow-up-s-line text-gray-400 text-base w-4 h-4 flex items-center justify-center"></i>
                              : <i className="ri-arrow-down-s-line text-gray-400 text-base w-4 h-4 flex items-center justify-center"></i>
                            }
                          </div>
                        </button>

                        {/* Andenes del grupo */}
                        {isExpanded && (
                          <div className="divide-y divide-gray-100">
                            {group.docks.map((dock) => (
                              <label
                                key={dock.id}
                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                                  selectedDockIds.includes(dock.id)
                                    ? 'bg-teal-50'
                                    : 'bg-white hover:bg-gray-50'
                                } ${!canAssignDocks || rules?.allow_all_docks ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedDockIds.includes(dock.id)}
                                  onChange={() => toggleDock(dock.id)}
                                  disabled={!canAssignDocks || saving || rules?.allow_all_docks}
                                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{dock.name}</p>
                                  {dock.reference && (
                                    <p className="text-xs text-gray-400 truncate">{dock.reference}</p>
                                  )}
                                </div>
                                {selectedDockIds.includes(dock.id) && (
                                  <i className="ri-checkbox-circle-fill text-teal-500 text-base w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {canAssignDocks && !rules?.allow_all_docks && (
                <div className="pt-4">
                  <button
                    onClick={handleSaveDocks}
                    disabled={saving}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {saving && <i className="ri-loader-4-line animate-spin"></i>}
                    {saving ? 'Guardando...' : 'Guardar Andenes'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab: Reglas */}
          {activeTab === 'rules' && (
            <div className="space-y-3">

              {/* ── BLOQUE 1: Restricción de edición ── */}
              <RuleBlock
                icon="ri-time-line"
                iconBg="bg-teal-100"
                iconColor="text-teal-600"
                title="Restricción de edición"
                description="Define cuántas horas antes de la reserva se bloquea la edición para este cliente."
                badge="Por cliente"
                badgeColor="bg-teal-100 text-teal-700"
                scope="client"
                summary={
                  rulesForm.edit_cutoff_hours === 0
                    ? 'Sin restricción'
                    : `${rulesForm.edit_cutoff_hours}h antes`
                }
                isOpen={openRuleId === 'edit-cutoff'}
                onToggle={() => toggleRule('edit-cutoff')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Cutoff de edición (horas)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="720"
                        value={rulesForm.edit_cutoff_hours}
                        onChange={(e) => setRulesForm({ ...rulesForm, edit_cutoff_hours: parseInt(e.target.value) || 0 })}
                        disabled={!canUpdateRules || saving}
                        className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                      />
                      <span className="text-xs text-gray-500">
                        {rulesForm.edit_cutoff_hours === 0
                          ? 'Sin restricción de tiempo'
                          : `Bloquea ${rulesForm.edit_cutoff_hours}h antes de la reserva`}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Rango: 0–720 horas. 0 = sin restricción.</p>
                  </div>

                  {canUpdateRules && (
                    <div className="pt-1">
                      <button
                        onClick={handleSaveRules}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                      >
                        {saving && <i className="ri-loader-4-line animate-spin"></i>}
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  )}
                </div>
              </RuleBlock>

              {/* ── BLOQUE 2: Asignación de andenes ── */}
              <RuleBlock
                icon="ri-layout-grid-line"
                iconBg="bg-indigo-100"
                iconColor="text-indigo-600"
                title="Asignación de andenes"
                description="Controla si el cliente puede usar todos los andenes o solo los asignados, y el orden de asignación."
                badge="Por cliente"
                badgeColor="bg-indigo-100 text-indigo-700"
                scope="client"
                summary={
                  rulesForm.allow_all_docks
                    ? 'Todos los andenes'
                    : rulesForm.dock_allocation_mode === 'SEQUENTIAL'
                      ? 'Secuencial'
                      : 'Intercalado'
                }
                isOpen={openRuleId === 'dock-alloc'}
                onToggle={() => toggleRule('dock-alloc')}
              >
                <div className="space-y-3">
                  <label className={`flex items-start gap-3 p-3 border rounded-lg transition-colors cursor-pointer ${
                    rulesForm.allow_all_docks ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-200'
                  } ${!canUpdateRules || saving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="checkbox"
                      id="allow_all_docks_drawer"
                      checked={rulesForm.allow_all_docks}
                      onChange={(e) => setRulesForm({ ...rulesForm, allow_all_docks: e.target.checked })}
                      disabled={!canUpdateRules || saving}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:opacity-50 mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 block">Permitir todos los andenes</span>
                      <span className="text-xs text-gray-500">Si está activo, ignora la lista de andenes asignados en la pestaña Andenes.</span>
                    </div>
                  </label>

                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Modo de asignación</p>
                    <div className="space-y-2">
                      {[
                        { value: 'SEQUENTIAL', label: 'Secuencial', desc: 'Orden: 1, 2, 3, 4, 5, 6…' },
                        { value: 'ODD_FIRST', label: 'Intercalado', desc: 'Impares primero: 1, 3, 5… luego 2, 4, 6…' },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3 border rounded-lg transition-colors cursor-pointer ${
                            rulesForm.dock_allocation_mode === opt.value
                              ? 'bg-indigo-50 border-indigo-300'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          } ${!canUpdateRules || saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="radio"
                            name="dock_allocation_mode"
                            value={opt.value}
                            checked={rulesForm.dock_allocation_mode === opt.value}
                            onChange={() => setRulesForm({ ...rulesForm, dock_allocation_mode: opt.value })}
                            disabled={!canUpdateRules || saving}
                            className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 disabled:opacity-50 mt-0.5"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-900 block">{opt.label}</span>
                            <span className="text-xs text-gray-500">{opt.desc}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {canUpdateRules && (
                    <div className="pt-1">
                      <button
                        onClick={handleSaveRules}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                      >
                        {saving && <i className="ri-loader-4-line animate-spin"></i>}
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  )}
                </div>
              </RuleBlock>

              {/* ── BLOQUE 3: Cliente Retira ── */}
              <RuleBlock
                icon="ri-truck-line"
                iconBg="bg-emerald-100"
                iconColor="text-emerald-600"
                title="Cliente Retira"
                description="Bloqueos automáticos en andenes específicos para este cliente. Los bloques se crean desde el inicio del horario del almacén."
                badge="Por cliente"
                badgeColor="bg-emerald-100 text-emerald-700"
                scope="client"
                isOpen={openRuleId === 'client-pickup'}
                onToggle={() => toggleRule('client-pickup')}
              >
                <ClientPickupRulesTab
                  orgId={client.org_id}
                  clientId={client.id}
                  docks={docks}
                  canManage={canUpdateRules}
                />
              </RuleBlock>

              {/* ── BLOQUE 4: Bloqueo por estados ── */}
              <RuleBlock
                icon="ri-lock-2-line"
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                title="Bloqueo por estados"
                description="Si una reserva de este cliente cae en cualquiera de los estados seleccionados, no podrá modificarse por usuarios normales. Solo ADMIN y Full Access podrán hacerlo."
                badge="Por cliente"
                badgeColor="bg-amber-100 text-amber-700"
                scope="client"
                isOpen={openRuleId === 'blocked-statuses'}
                onToggle={() => toggleRule('blocked-statuses')}
              >
                <BlockedStatusesConfig orgId={client.org_id} clientId={client.id} />
              </RuleBlock>

              {/* ── BLOQUE 5: Corte de reservas del mismo día ── */}
              <RuleBlock
                icon="ri-calendar-close-line"
                iconBg="bg-orange-100"
                iconColor="text-orange-600"
                title="Cutoff de reservas del mismo día"
                description="Bloquea la creación de reservas para hoy después de un número de horas antes del cierre del almacén. Admin y Full Access siempre pueden crear sin restricción."
                badge="Por cliente"
                badgeColor="bg-orange-100 text-orange-700"
                scope="client"
                isOpen={openRuleId === 'same-day-cutoff'}
                onToggle={() => toggleRule('same-day-cutoff')}
              >
                <SameDayCutoffRuleBlock
                  orgId={client.org_id}
                  clientId={client.id}
                  canManage={canUpdateRules}
                />
              </RuleBlock>

            </div>
          )}

          {/* Tab: Proveedores */}
          {activeTab === 'providers' && canViewProviders && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-blue-600 text-lg mt-0.5"></i>
                  <div className="flex-1">
                    <p className="text-sm text-blue-900 font-medium mb-1">
                      Proveedores asignados a este cliente
                    </p>
                    <p className="text-xs text-blue-800">
                      Selecciona los proveedores que pertenecen a este cliente. Puedes marcar uno como predeterminado.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  type="text"
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  placeholder="Buscar proveedor..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {canManageProviders && filteredProviders.length > 0 && (
                <div className="flex items-center gap-2 justify-end">
                  {filteredProviders.some(p => !selectedProviders.has(p.id)) && (
                    <button
                      onClick={() => {
                        const newMap = new Map(selectedProviders);
                        filteredProviders.forEach(p => {
                          if (!newMap.has(p.id)) newMap.set(p.id, false);
                        });
                        setSelectedProviders(newMap);
                      }}
                      disabled={saving}
                      className="px-3 py-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-300 rounded-md hover:bg-teal-100 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <i className="ri-checkbox-multiple-line mr-1"></i>
                      Seleccionar todo
                    </button>
                  )}
                  {filteredProviders.some(p => selectedProviders.has(p.id)) && (
                    <button
                      onClick={() => {
                        const newMap = new Map(selectedProviders);
                        filteredProviders.forEach(p => newMap.delete(p.id));
                        setSelectedProviders(newMap);
                      }}
                      disabled={saving}
                      className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <i className="ri-checkbox-blank-line mr-1"></i>
                      Limpiar selección
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredProviders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="ri-inbox-line text-4xl mb-2"></i>
                    <p className="text-sm">No hay proveedores disponibles</p>
                  </div>
                ) : (
                  filteredProviders.map((provider) => {
                    const isSelected = selectedProviders.has(provider.id);
                    const isDefault = selectedProviders.get(provider.id) || false;

                    return (
                      <div
                        key={provider.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-teal-50 border-teal-300'
                            : 'bg-white border-gray-200'
                        } ${!canManageProviders ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleProvider(provider.id)}
                          disabled={!canManageProviders || saving}
                          className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{provider.name}</p>
                          {provider.contact_email && (
                            <p className="text-xs text-gray-500">{provider.contact_email}</p>
                          )}
                        </div>
                        {isSelected && (
                          <button
                            onClick={() => toggleProviderDefault(provider.id)}
                            disabled={!canManageProviders || saving}
                            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
                              isDefault
                                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                            } disabled:opacity-50`}
                          >
                            {isDefault ? (
                              <>
                                <i className="ri-star-fill mr-1"></i>
                                Predeterminado
                              </>
                            ) : (
                              <>
                                <i className="ri-star-line mr-1"></i>
                                Marcar como predeterminado
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {canManageProviders && (
                <div className="pt-4">
                  <button
                    onClick={handleSaveProviders}
                    disabled={saving}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {saving && <i className="ri-loader-4-line animate-spin"></i>}
                    {saving ? 'Guardando...' : 'Guardar Proveedores'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
