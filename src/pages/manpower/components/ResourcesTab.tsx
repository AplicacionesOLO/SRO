import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { manpowerResourcesService } from '@/services/manpowerResourcesService';
import { countriesService } from '@/services/countriesService';
import { warehousesService } from '@/services/warehousesService';
import { ResourceCategoryModal } from './ResourceCategoryModal';
import { ResourceModal, type ResourceFormData } from './ResourceModal';
import { ConfirmModal } from '@/components/base/ConfirmModal';
import type {
  ResourceCategory,
  ResourceCategoryFormData,
  ManpowerResource,
} from '@/types/manpowerResource';
import type { Country, Warehouse } from '@/types/warehouse';

export default function ResourcesTab() {
  const { orgId, userId, can } = usePermissions();
  const canManage = can('manpower.manage');

  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [resources, setResources] = useState<ManpowerResource[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de recursos
  const [filterCountry, setFilterCountry] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Modales
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ResourceCategory | null>(null);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<ManpowerResource | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'category' | 'resource'; item: ResourceCategory | ManpowerResource } | null
  >(null);

  const loadAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [cats, countriesData, warehousesData] = await Promise.all([
        manpowerResourcesService.getCategories(orgId, true),
        countriesService.getAll(orgId),
        warehousesService.getAll(orgId),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setCountries(Array.isArray(countriesData) ? countriesData : []);
      setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar los recursos');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadResources = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await manpowerResourcesService.getResources(orgId, {
        categoryId: filterCategory,
        countryId: filterCountry,
        warehouseId: filterWarehouse,
      });
      setResources(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar el stock de recursos');
      setResources([]);
    }
  }, [orgId, filterCategory, filterCountry, filterWarehouse]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const filteredWarehouses = useMemo(() => {
    if (!filterCountry) return warehouses;
    return warehouses.filter((w) => w.country_id === filterCountry);
  }, [warehouses, filterCountry]);

  // ========================= Handlers =========================
  const handleCountryFilter = (id: string) => {
    setFilterCountry(id);
    setFilterWarehouse('');
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setIsCategoryModalOpen(true);
  };

  const openEditCategory = (c: ResourceCategory) => {
    setEditingCategory(c);
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (data: ResourceCategoryFormData) => {
    if (!orgId || !userId) return;
    if (editingCategory) {
      await manpowerResourcesService.updateCategory(orgId, userId, editingCategory.id, data);
    } else {
      await manpowerResourcesService.createCategory(orgId, userId, data);
    }
    await loadAll();
    await loadResources();
  };

  const handleSeedDefaults = async () => {
    if (!orgId || !userId) return;
    setSeeding(true);
    try {
      await manpowerResourcesService.seedDefaultCategories(orgId, userId);
      await loadAll();
    } catch (err: any) {
      alert(err?.message || 'Error al cargar categorías estándar');
    } finally {
      setSeeding(false);
    }
  };

  const openCreateResource = () => {
    setEditingResource(null);
    setIsResourceModalOpen(true);
  };

  const openEditResource = (r: ManpowerResource) => {
    setEditingResource(r);
    setIsResourceModalOpen(true);
  };

  const handleSaveResource = async (data: ResourceFormData) => {
    if (!orgId || !userId) return;
    if (editingResource) {
      await manpowerResourcesService.updateResource(orgId, userId, editingResource.id, data);
    } else {
      await manpowerResourcesService.createResource(orgId, userId, data);
    }
    await loadResources();
  };

  const handleDelete = async () => {
    if (!orgId || !deleteTarget) return;
    try {
      if (deleteTarget.kind === 'category') {
        await manpowerResourcesService.deleteCategory(orgId, deleteTarget.item.id);
        await loadAll();
      } else {
        await manpowerResourcesService.deleteResource(orgId, deleteTarget.item.id);
      }
      await loadResources();
    } catch (err: any) {
      alert(err?.message || 'Error al eliminar');
    } finally {
      setDeleteTarget(null);
    }
  };

  const typeLabel = (type: string) => (type === 'PERSONAL' ? 'Personal' : 'Equipo');
  const typeBadge = (type: string) =>
    type === 'PERSONAL'
      ? 'bg-teal-100 text-teal-800'
      : 'bg-amber-100 text-amber-800';

  const statusBadge = (status: string) => {
    if (status === 'ACTIVO') return 'bg-green-100 text-green-800';
    if (status === 'MANTENIMIENTO') return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-700';
  };
  const statusLabel = (status: string) => {
    if (status === 'ACTIVO') return 'Activo';
    if (status === 'MANTENIMIENTO') return 'Mantenimiento';
    return 'Inactivo';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* ============ SECCIÓN 1: CATEGORÍAS ============ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Categorías de recurso</h3>
            <p className="text-sm text-gray-500">Personal y equipos con su ritmo de trabajo por hora</p>
          </div>
          <div className="flex items-center gap-2">
            {canManage && categories.length === 0 && (
              <button
                onClick={handleSeedDefaults}
                disabled={seeding}
                className="px-3 py-2 text-sm font-medium text-teal-700 border border-teal-300 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
              >
                <i className="ri-magic-line text-base w-4 h-4 flex items-center justify-center"></i>
                {seeding ? 'Cargando...' : 'Cargar estándar'}
              </button>
            )}
            {canManage && (
              <button
                onClick={openCreateCategory}
                className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <i className="ri-add-line text-base w-4 h-4 flex items-center justify-center"></i>
                Nueva categoría
              </button>
            )}
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-lg py-10 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="ri-stack-line text-2xl text-gray-400"></i>
            </div>
            <p className="text-gray-600 mb-4">Aún no hay categorías de recurso</p>
            {canManage && (
              <button
                onClick={handleSeedDefaults}
                disabled={seeding}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {seeding ? 'Cargando...' : 'Cargar categorías estándar'}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidad</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ritmo (u/h)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    {canManage && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {categories.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-teal-50 shrink-0">
                            <i className={`${c.type === 'PERSONAL' ? 'ri-user-star-line' : 'ri-tools-line'} text-lg text-teal-600`}></i>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeBadge(c.type)}`}>
                          {typeLabel(c.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{c.unit_label || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-600">
                        {c.rate_per_hour != null ? c.rate_per_hour : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Activa</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Inactiva</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditCategory(c)}
                              className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <i className="ri-edit-line text-base"></i>
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ kind: 'category', item: c })}
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
      </section>

      {/* ============ SECCIÓN 2: STOCK DE RECURSOS ============ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Stock de recursos</h3>
            <p className="text-sm text-gray-500">Cantidad disponible por país y almacén</p>
          </div>
          {canManage && (
            <button
              onClick={openCreateResource}
              disabled={categories.length === 0}
              className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-add-line text-base w-4 h-4 flex items-center justify-center"></i>
              Agregar recurso
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <i className="ri-error-warning-line text-red-600 text-lg w-5 h-5 flex items-center justify-center"></i>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {resources.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-box-3-line text-2xl text-gray-400"></i>
              </div>
              <p className="text-gray-600">No hay recursos registrados con estos filtros</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">País</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ritmo (u/h)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    {canManage && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {resources.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">{r.category?.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{r.country?.name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{r.warehouse?.name || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-sm font-semibold text-gray-900">{r.quantity}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-600">
                        {r.rate_per_hour ?? r.category?.rate_per_hour ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status)}`}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditResource(r)}
                              className="w-8 h-8 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <i className="ri-edit-line text-base"></i>
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ kind: 'resource', item: r })}
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
          )}
        </div>
      </section>

      {/* Modales */}
      <ResourceCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        onSave={handleSaveCategory}
        category={editingCategory}
        canManage={canManage}
      />

      <ResourceModal
        isOpen={isResourceModalOpen}
        onClose={() => {
          setIsResourceModalOpen(false);
          setEditingResource(null);
        }}
        onSave={handleSaveResource}
        categories={categories}
        countries={countries}
        warehouses={warehouses}
        canManage={canManage}
        initialData={
          editingResource
            ? {
                id: editingResource.id,
                category_id: editingResource.category_id,
                country_id: editingResource.country_id,
                warehouse_id: editingResource.warehouse_id,
                quantity: editingResource.quantity,
                rate_per_hour: editingResource.rate_per_hour ?? null,
                status: editingResource.status,
                notes: editingResource.notes ?? null,
              }
            : null
        }
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        type="error"
        title={deleteTarget?.kind === 'category' ? 'Eliminar categoría' : 'Eliminar recurso'}
        message={
          deleteTarget?.kind === 'category'
            ? `¿Eliminar la categoría "${(deleteTarget.item as ResourceCategory).name}"? Se eliminarán también todos los recursos asociados.`
            : '¿Eliminar este recurso?'
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        showCancel
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}