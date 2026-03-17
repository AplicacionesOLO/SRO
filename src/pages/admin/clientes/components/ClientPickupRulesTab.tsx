import { useState, useEffect } from 'react';
import type { ClientPickupRule, ClientPickupRuleFormData } from '../../../../types/client';
import type { Dock } from '../../../../types/dock';
import * as clientPickupRulesService from '../../../../services/clientPickupRulesService';
import { useClientPickupRulesContext } from '../../../../contexts/ClientPickupRulesContext';

interface ClientPickupRulesTabProps {
  orgId: string;
  clientId: string;
  docks: Dock[];
  canManage: boolean;
}

interface RuleModalState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  rule: ClientPickupRule | null;
}

export default function ClientPickupRulesTab({
  orgId,
  clientId,
  docks,
  canManage
}: ClientPickupRulesTabProps) {
  const [rules, setRules] = useState<ClientPickupRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<RuleModalState>({ isOpen: false, mode: 'create', rule: null });
  const [formData, setFormData] = useState<ClientPickupRuleFormData>({
    dock_id: '',
    block_minutes: 120,
    reblock_before_minutes: 10,
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { notifyRuleChanged } = useClientPickupRulesContext();

  useEffect(() => {
    loadData();
  }, [orgId, clientId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clientPickupRulesService.listByClient(orgId, clientId);
      setRules(data);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar reglas');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setFormData({
      dock_id: '',
      block_minutes: 120,
      reblock_before_minutes: 10,
      is_active: true
    });
    setFormError(null);
    setModal({ isOpen: true, mode: 'create', rule: null });
  };

  const openEditModal = (rule: ClientPickupRule) => {
    setFormData({
      dock_id: rule.dock_id,
      block_minutes: rule.block_minutes,
      reblock_before_minutes: rule.reblock_before_minutes,
      is_active: rule.is_active
    });
    setFormError(null);
    setModal({ isOpen: true, mode: 'edit', rule });
  };

  const closeModal = () => {
    setModal({ isOpen: false, mode: 'create', rule: null });
    setFormError(null);
  };

  const handleSave = async () => {
    if (!formData.dock_id) {
      setFormError('Debe seleccionar un andén');
      return;
    }

    if (formData.block_minutes <= 0) {
      setFormError('Los minutos de bloqueo deben ser mayores a 0');
      return;
    }

    if (formData.reblock_before_minutes < 0) {
      setFormError('Los minutos de renovación no pueden ser negativos');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      if (modal.mode === 'create') {
        await clientPickupRulesService.create(orgId, clientId, formData);
      } else if (modal.rule) {
        await clientPickupRulesService.update(orgId, modal.rule.id, formData);
      }

      // Intentar regenerar bloques — si falla no bloqueamos el flujo principal
      try {
        await clientPickupRulesService.regenerateBlocks(orgId, formData.dock_id);
      } catch (blockErr) {
        console.warn('[ClientPickupRulesTab] regenerateBlocks failed, calendar will still be notified', blockErr);
      }

      await loadData();

      // Señalizar al calendario que los bloques de este andén cambiaron
      // Se llama siempre, independientemente de si regenerateBlocks tuvo éxito
      notifyRuleChanged([formData.dock_id]);

      closeModal();
    } catch (err: any) {
      setFormError(err?.message || 'Error al guardar regla');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rule: ClientPickupRule) => {
    try {
      if (rule.is_active) {
        await clientPickupRulesService.deactivate(orgId, rule.id);
        await clientPickupRulesService.deleteBlocksForRule(orgId, rule.id);
      } else {
        await clientPickupRulesService.activate(orgId, rule.id);
      }
      await loadData();

      // Señalizar al calendario que los bloques de este andén cambiaron
      notifyRuleChanged([rule.dock_id]);
    } catch (err: any) {
      setError(err?.message || 'Error al cambiar estado');
    }
  };

  const handleDelete = async (rule: ClientPickupRule) => {
    if (!confirm('¿Está seguro de eliminar esta regla? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await clientPickupRulesService.deleteBlocksForRule(orgId, rule.id);
      await clientPickupRulesService.deleteRule(orgId, rule.id);
      await loadData();

      // Señalizar al calendario que los bloques de este andén cambiaron
      notifyRuleChanged([rule.dock_id]);
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar regla');
    }
  };

  const getDockName = (dockId: string): string => {
    const dock = docks.find(d => d.id === dockId);
    return dock?.name || dockId;
  };

  const availableDocks = docks.filter(dock => {
    if (modal.mode === 'edit' && modal.rule?.dock_id === dock.id) {
      return true;
    }

    return !rules.some(r => r.dock_id === dock.id && r.is_active);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <i className="ri-information-line text-blue-600 text-lg mt-0.5"></i>
          <div className="flex-1">
            <p className="text-sm text-blue-900 font-medium mb-1">
              Cliente Retira
            </p>
            <p className="text-xs text-blue-800">
              Configura bloqueos automáticos en andenes específicos para este cliente. Los bloques se crean desde el inicio del horario del almacén y se renuevan automáticamente.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="ri-error-warning-line text-red-600 text-lg mt-0.5"></i>
            <div className="flex-1">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        </div>
      )}

      {canManage && (
        <button
          onClick={openCreateModal}
          className="w-full px-4 py-3 text-sm font-medium text-teal-600 bg-white border-2 border-dashed border-teal-300 rounded-lg hover:bg-teal-50 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <i className="ri-add-line text-lg"></i>
          Agregar otro andén
        </button>
      )}

      {rules.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <i className="ri-inbox-line text-4xl text-gray-400 mb-3"></i>
          <p className="text-sm text-gray-600 font-medium mb-1">
            No hay reglas configuradas
          </p>
          <p className="text-xs text-gray-500">
            Agrega una regla para bloquear andenes automáticamente
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`p-4 border rounded-lg transition-colors ${
                rule.is_active
                  ? 'bg-white border-gray-200'
                  : 'bg-gray-50 border-gray-300 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-gray-900">
                      {getDockName(rule.dock_id)}
                    </span>
                    {rule.is_active ? (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                        Activa
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-full">
                        Inactiva
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">Bloquear:</span> {rule.block_minutes} minutos desde el inicio del horario
                    </p>
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">Renovar cuando falten:</span> {rule.reblock_before_minutes} minutos
                    </p>
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                      title={rule.is_active ? 'Desactivar' : 'Activar'}
                    >
                      <i className={`${rule.is_active ? 'ri-toggle-line' : 'ri-toggle-fill'} text-lg w-5 h-5 flex items-center justify-center`}></i>
                    </button>
                    <button
                      onClick={() => openEditModal(rule)}
                      className="p-2 text-gray-400 hover:text-teal-600 rounded-lg hover:bg-teal-50 transition-colors"
                      title="Editar"
                    >
                      <i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(rule)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.isOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={closeModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">
                  {modal.mode === 'create' ? 'Agregar Regla Cliente Retira' : 'Editar Regla Cliente Retira'}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
                </button>
              </div>

              <div className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <i className="ri-error-warning-line text-red-600 text-lg mt-0.5"></i>
                      <p className="text-sm text-red-800">{formError}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Andén <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.dock_id}
                    onChange={(e) => setFormData({ ...formData, dock_id: e.target.value })}
                    disabled={saving || modal.mode === 'edit'}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                  >
                    <option value="">Seleccionar andén</option>
                    {availableDocks.map((dock) => (
                      <option key={dock.id} value={dock.id}>
                        {dock.name}
                      </option>
                    ))}
                  </select>
                  {modal.mode === 'edit' && (
                    <p className="text-xs text-gray-500 mt-1">
                      No se puede cambiar el andén en una regla existente
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bloquear (minutos) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.block_minutes}
                    onChange={(e) => setFormData({ ...formData, block_minutes: parseInt(e.target.value) || 0 })}
                    disabled={saving}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Duración del bloqueo desde el inicio del horario del almacén
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Renovar cuando falten (minutos) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.reblock_before_minutes}
                    onChange={(e) => setFormData({ ...formData, reblock_before_minutes: parseInt(e.target.value) || 0 })}
                    disabled={saving}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Minutos antes del fin del bloqueo para renovarlo automáticamente
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active_modal"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    disabled={saving}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 disabled:opacity-50"
                  />
                  <label htmlFor="is_active_modal" className="text-sm font-medium text-gray-700">
                    Regla activa
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {saving && <i className="ri-loader-4-line animate-spin"></i>}
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}