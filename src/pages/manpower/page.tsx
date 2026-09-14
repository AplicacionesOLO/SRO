import { useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import CollaboratorsTab from './components/CollaboratorsTab';
import ResourcesTab from './components/ResourcesTab';
import RulesTab from './components/RulesTab';
import ForecastTab from './components/ForecastTab';

type TabId = 'collaborators' | 'resources' | 'rules' | 'forecast';

export default function ManpowerPage() {
  const { can, loading } = usePermissions();

  const canView = can('manpower.view');
  const canManage = can('manpower.manage');

  const [activeTab, setActiveTab] = useState<TabId>('collaborators');
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['collaborators']));

  const switchTab = (tabId: TabId) => {
    setMountedTabs((prev) => (prev.has(tabId) ? prev : new Set([...prev, tabId])));
    setActiveTab(tabId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!canView && !canManage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-lock-line text-3xl text-red-600"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">No tienes permisos para acceder al módulo de Manpower Forecasting.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'collaborators' as TabId, label: 'Colaboradores', icon: 'ri-user-line' },
    { id: 'resources' as TabId, label: 'Recursos', icon: 'ri-stack-line' },
    { id: 'rules' as TabId, label: 'Reglas', icon: 'ri-flow-chart' },
    { id: 'forecast' as TabId, label: 'Pronóstico', icon: 'ri-bar-chart-2-line' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Manpower</h1>
          <p className="text-gray-600 mt-1">Gestión de colaboradores, recursos y pronóstico de operación</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <div className="flex gap-1 p-2 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
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

          <div>
            {mountedTabs.has('collaborators') && (
              <div style={{ display: activeTab === 'collaborators' ? 'block' : 'none' }} className="p-6">
                <CollaboratorsTab />
              </div>
            )}
            {mountedTabs.has('resources') && (
              <div style={{ display: activeTab === 'resources' ? 'block' : 'none' }}>
                <ResourcesTab />
              </div>
            )}
            {mountedTabs.has('rules') && (
              <div style={{ display: activeTab === 'rules' ? 'block' : 'none' }}>
                <RulesTab />
              </div>
            )}
            {mountedTabs.has('forecast') && (
              <div style={{ display: activeTab === 'forecast' ? 'block' : 'none' }}>
                <ForecastTab />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}