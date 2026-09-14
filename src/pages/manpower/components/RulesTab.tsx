import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { manpowerRulesService } from '@/services/manpowerRulesService';
import { manpowerResourcesService } from '@/services/manpowerResourcesService';
import { countriesService } from '@/services/countriesService';
import { warehousesService } from '@/services/warehousesService';
import { cargoTypesService } from '@/services/cargoTypesService';
import { providersService } from '@/services/providersService';
import { RuleModal } from './RuleModal';
import { ConfirmModal } from '@/components/base/ConfirmModal';
import type { ManpowerRule, ManpowerRuleFormData } from '@/types/manpowerRule';
import type { ResourceCategory } from '@/types/manpowerResource';
import type { Country, Warehouse } from '@/types/warehouse';
import type { Provider, CargoType } from '@/types/catalog';

export default function RulesTab() {
  const { orgId, userId, can } = usePermissions();
  const canManage = can('manpower.manage');

  const [rules, setRules] = useState<ManpowerRule[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filterCountry, setFilterCountry] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterCargoType, setFilterCargoType] = useState('');

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ManpowerRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManpowerRule | null>(null);

  const loadAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [countriesData, warehousesData, cargoTypesData, categoriesData, providersData] =
        await Promise.all([
          countriesService.getAll(orgId),
          warehousesService.getAll(orgId),
          cargoTypesService.getActive(orgId),
          manpowerResourcesService.getCategories(orgId, true),
          providersService.getActive(orgId),
        ]);
      setCountries(Array.isArray(countriesData) ? countriesData : []);
      setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
      setCargoTypes(Array.isArray(cargoTypesData) ? cargoTypesData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setProviders(Array.isArray(providersData) ? providersData : []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadRules = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await manpowerRulesService.getRules(orgId, {
        countryId: filterCountry,
        warehouseId: filterWarehouse,
        cargoTypeId: filterCargoType,
      });
      setRules(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar las reglas');
      setRules([]);
    }
  }, [orgId, filterCountry, filterWarehouse, filterCargoType]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const filteredWarehouses = useMemo(() => {
    if (!filterCountry) return warehouses;
    return warehouses.filter((w) => w.country_id === filterCountry);
  }, [warehouses, filterCountry]);

  const handleCountryFilter = (id: string) => {
    setFilterCountry(id);
    setFilterWarehouse('');
  };

  const openCreate = () => {
    setEditingRule(null);
    setIsModalOpen(true);
  };

  const openEdit = (rule: ManpowerRule) => {
    setEditingRule(rule);
    setIsModalOpen(true);
  };

  const handleSave = async (data: ManpowerRuleFormData) => {
    if (!orgId || !userId) return;
    if (editingRule) {
      await manpowerRulesService.updateRule(orgId, userId, editingRule.id, data);
    } else {
      await manpowerRulesService.createRule(orgId, userId, data);
    }
    await loadRules();
  };

  const handleDelete = async () => {
    if (!orgId || !deleteTarget) return;
    try {
      await manpowerRulesService.deleteRule(orgId, deleteTarget.id);
      await loadRules();
    } catch (err: any) {
      alert(err?.message || 'Error al eliminar');
    } finally {
      setDeleteTarget(null);
    }
  };

  const rangeLabel = (rule: ManpowerRule) => {
    if (rule.min_bultos != null && rule.max_bultos != null) {
      return `${rule.min_bultos} - ${rule.max_bultos} bultos`;
    }
    if (rule.min_bultos != null) return `Desde ${rule.min_bultos} bultos`;
    if (rule.max_bultos != null) return `Hasta ${rule.max_bultos} bultos`;
    return 'Sin rango';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Reglas de pronóstico</h3>
          <p className="text-sm text-gray-500">
            Tipo de carga + rango de bultos (+ proveedor opcional) → recursos asignados
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-add-line text-base w-4 h-4 flex items-center justify-center"></i>
            Nueva regla
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <select
          value={filterCountry}
          onChange={(e) => handleCountryFilter(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
        >
          <option value="">Todos los países</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filterWarehouse}
          onChange={(e) => setFilterWarehouse(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
        >
          <option value="">Todos los almacenes</option>
          {filteredWarehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={filterCargoType}
          onChange={(e) => setFilterCargoType(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
        >
          <option value="">Todos los tipos de carga</option>
          {cargoTypes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <i className="ri-error-warning-line text-red-600 text-lg w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Lista de reglas */}
      {rules.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg py-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <i className="ri-flow-chart text-2xl text-gray-400"></i>
          </div>
          <p className="text-gray-600 mb-4">Aún no hay reglas de pronóstico</p>
          {canManage && (
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Crear primera regla
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo de carga</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rango bultos</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">País · Almacén</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recursos asignados</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridad</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  {canManage && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rules.map((rule) => (
                  <tr key={rule.id} className={`hover:bg-gray-50 transition-colors ${rule.is_active ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                        {rule.cargo_type?.name || 'Sin tipo de carga'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{rangeLabel(rule)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {rule.provider ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <i className="ri-truck-line text-sm w-4 h-4 flex items-center justify-center mr-1"></i>
                          {rule.provider.name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Todos</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {rule.country?.name || '—'} · {rule.warehouse?.name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {rule.items && rule.items.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {rule.items.map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200"
                            >
                              {item.quantity}× {item.category?.name || 'Recurso'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Sin recursos</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-600">{rule.priority}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {rule.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Activa</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Inactiva</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(rule)}
                            className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <i className="ri-edit-line text-base"></i>
                          </button>
                          <button
                            onClick={() => setDeleteTarget(rule)}
                            className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <i className="ri-delete-bin-line text-base"></i>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de regla */}
      <RuleModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingRule(null);
        }}
        onSave={handleSave}
        countries={countries}
        warehouses={warehouses}
        cargoTypes={cargoTypes}
        categories={categories}
        providers={providers}
        canManage={canManage}
        initialData={editingRule}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        type="error"
        title="Eliminar regla"
        message={`¿Eliminar la regla de "${deleteTarget?.cargo_type?.name || 'este tipo de carga'}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        showCancel
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}