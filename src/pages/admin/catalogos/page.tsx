import { useState, useEffect, useRef } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';
import { useActiveWarehouse } from '../../../contexts/ActiveWarehouseContext';
import ProvidersTab from './components/ProvidersTab';
import CargoTypesTab from './components/CargoTypesTab';
import TimeProfilesTab from './components/TimeProfilesTab';
import WarehouseSelectorDropdown from '../../../components/feature/WarehouseSelector';

export default function CatalogosPage() {
  const { orgId, can, loading } = usePermissions();
  const {
    activeWarehouseId,
    activeWarehouse,
    allowedWarehouses,
    hasMultipleWarehouses,
    setActiveWarehouseId,
    loading: whLoading,
  } = useActiveWarehouse();

  const [activeTab, setActiveTab] = useState<'providers' | 'cargo_types' | 'time_profiles'>('providers');
  const warehouseInitDoneRef = useRef(false);

  // Auto-seleccionar si hay 1 solo almacén
  useEffect(() => {
    if (whLoading || warehouseInitDoneRef.current) return;
    if (allowedWarehouses.length === 0) return;
    warehouseInitDoneRef.current = true;
    if (allowedWarehouses.length === 1 && !activeWarehouseId) {
      setActiveWarehouseId(allowedWarehouses[0].id);
    }
  }, [whLoading, allowedWarehouses, activeWarehouseId, setActiveWarehouseId]);

  if (loading || whLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <i className="ri-alert-line text-6xl text-amber-500 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Organización no encontrada</h2>
          <p className="text-gray-600 mb-6">No tienes una organización asignada.</p>
          <button onClick={() => window.history.back()} className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">Volver</button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'providers' as const, label: 'Proveedores', icon: 'ri-truck-line' },
    { id: 'cargo_types' as const, label: 'Tipos de carga', icon: 'ri-box-3-line' },
    { id: 'time_profiles' as const, label: 'Tiempos (Proveedor x Tipo de carga)', icon: 'ri-time-line' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Catálogos</h1>
            <p className="text-gray-600 text-sm">Gestiona proveedores, tipos de carga y tiempos de operación</p>
          </div>
          {hasMultipleWarehouses && (
            <WarehouseSelectorDropdown variant="dropdown" />
          )}
          {!hasMultipleWarehouses && activeWarehouse && (
            <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5">
              <i className="ri-building-2-line text-teal-600 text-lg w-5 h-5 flex items-center justify-center"></i>
              <div>
                <p className="text-xs text-teal-600 font-medium uppercase tracking-wide">Almacén activo</p>
                <p className="text-sm font-semibold text-teal-900">{activeWarehouse.name}</p>
              </div>
            </div>
          )}
        </div>

        {!activeWarehouseId && hasMultipleWarehouses && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
            <i className="ri-alert-line text-amber-500 text-xl w-6 h-6 flex items-center justify-center"></i>
            <p className="text-sm font-medium text-amber-800">Selecciona un almacén en el selector de arriba para filtrar los catálogos</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <div className="flex gap-1 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id ? 'bg-teal-50 text-teal-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <i className={`${tab.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'providers' && <ProvidersTab orgId={orgId} warehouseId={activeWarehouseId} />}
            {activeTab === 'cargo_types' && <CargoTypesTab orgId={orgId} warehouseId={activeWarehouseId} />}
            {activeTab === 'time_profiles' && <TimeProfilesTab orgId={orgId} warehouseId={activeWarehouseId} />}
          </div>
        </div>
      </div>


    </div>
  );
}
