import { useState, useEffect } from 'react';
import { timeProfilesService } from '../../../../services/timeProfilesService';
import { useActiveWarehouse } from '../../../../contexts/ActiveWarehouseContext';
import type { ProviderCargoTimeProfile, Provider, CargoType } from '../../../../types/catalog';

interface TimeProfileModalProps {
  orgId: string;
  profile: ProviderCargoTimeProfile | null;
  providers: Provider[];
  cargoTypes: CargoType[];
  onClose: () => void;
  onSave: () => void;
}

export default function TimeProfileModal({
  orgId,
  profile,
  providers,
  cargoTypes,
  onClose,
  onSave,
}: TimeProfileModalProps) {
  const { activeWarehouseId, activeWarehouse } = useActiveWarehouse();

  const [providerId, setProviderId] = useState('');
  const [cargoTypeId, setCargoTypeId] = useState('');
  const [avgMinutes, setAvgMinutes] = useState('30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!profile;

  useEffect(() => {
    if (profile) {
      setProviderId(profile.provider_id);
      setCargoTypeId(profile.cargo_type_id);
      setAvgMinutes(String(profile.avg_minutes));
    } else {
      setProviderId('');
      setCargoTypeId('');
      setAvgMinutes('30');
    }
    setError(null);
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!activeWarehouseId) {
      setError('Seleccioná un almacén activo antes de crear un perfil de tiempo.');
      return;
    }

    const minutes = Number(avgMinutes);

    if (!providerId || !cargoTypeId) {
      setError('Seleccioná proveedor y tipo de carga.');
      return;
    }

    if (!Number.isFinite(minutes) || minutes < 5) {
      setError('El tiempo promedio debe ser mínimo 5 minutos.');
      return;
    }

    try {
      setSaving(true);

      if (profile) {
        await timeProfilesService.update(orgId, profile.id, {
          provider_id: providerId,
          cargo_type_id: cargoTypeId,
          avg_minutes: minutes,
        });
      } else {
        await timeProfilesService.create(orgId, providerId, cargoTypeId, minutes, activeWarehouseId);
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {profile ? 'Editar Perfil de Tiempo' : 'Nuevo Perfil de Tiempo'}
            </h2>
            {activeWarehouse && (
              <div className="flex items-center gap-1.5 mt-1">
                <i className="ri-store-2-line text-teal-600 text-xs w-4 h-4 flex items-center justify-center"></i>
                <span className="text-xs text-teal-700 font-medium">{activeWarehouse.name}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            type="button"
          >
            <i className="ri-close-line text-2xl w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Aviso si no hay almacén activo */}
          {!activeWarehouseId && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <i className="ri-alert-line text-amber-500 mt-0.5 w-4 h-4 flex items-center justify-center"></i>
              <p className="text-sm text-amber-800">
                No hay almacén activo seleccionado. Seleccioná un almacén para poder crear perfiles de tiempo.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {isEditing && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              En edición, Proveedor y Tipo de carga se mantienen para evitar duplicados.
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Proveedor <span className="text-red-500">*</span>
            </label>
            {providers.length === 0 && activeWarehouseId ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                No hay proveedores asignados a {activeWarehouse?.name}. Asigná proveedores en Catálogos → Proveedores.
              </div>
            ) : (
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                disabled={saving || isEditing || !activeWarehouseId}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
              >
                <option value="">Seleccionar proveedor</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de carga <span className="text-red-500">*</span>
            </label>
            {cargoTypes.length === 0 && activeWarehouseId ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                No hay tipos de carga asignados a {activeWarehouse?.name}. Asigná tipos en Catálogos → Tipos de carga.
              </div>
            ) : (
              <select
                value={cargoTypeId}
                onChange={(e) => setCargoTypeId(e.target.value)}
                disabled={saving || isEditing || !activeWarehouseId}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
              >
                <option value="">Seleccionar tipo de carga</option>
                {cargoTypes.map((cargoType) => (
                  <option key={cargoType.id} value={cargoType.id}>
                    {cargoType.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minutos promedio <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={avgMinutes}
              onChange={(e) => setAvgMinutes(e.target.value)}
              disabled={saving || !activeWarehouseId}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Ej: 60"
              min="5"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !activeWarehouseId}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
