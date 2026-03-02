
import { useState, useEffect } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';
import ProvidersTab from './components/ProvidersTab';
import CargoTypesTab from './components/CargoTypesTab';
import TimeProfilesTab from './components/TimeProfilesTab';

export default function CatalogosPage() {
  const { orgId, can, loading } = usePermissions();
  const [activeTab, setActiveTab] = useState<'providers' | 'cargo_types' | 'time_profiles'>('providers');

  useEffect(() => {
    console.log('[CatalogosPage] mounted', {
      orgId,
      loading,
      typeof_orgId: typeof orgId,
      typeof_loading: typeof loading
    });
  }, [orgId, loading]);

  // ✅ Guard 1: Verificar loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
            <p className="text-gray-600">Cargando permisos...</p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Guard 2: Verificar orgId
  if (!orgId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-alert-line text-6xl text-amber-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Organización no encontrada</h2>
            <p className="text-gray-600 mb-6">No tienes una organización asignada. Contacta al administrador.</p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              Volver
            </button>
          </div>
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Catálogos</h1>
          <p className="text-gray-600">Gestiona proveedores, tipos de carga y tiempos de operación</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <div className="flex gap-1 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-teal-50 text-teal-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <i className={`${tab.icon} text-lg w-5 h-5 flex items-center justify-center`}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'providers' && <ProvidersTab orgId={orgId} />}
            {activeTab === 'cargo_types' && <CargoTypesTab orgId={orgId} />}
            {activeTab === 'time_profiles' && <TimeProfilesTab orgId={orgId} />}
          </div>
        </div>
      </div>
    </div>
  );
}
