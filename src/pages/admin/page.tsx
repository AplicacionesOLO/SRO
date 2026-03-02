import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Navigate } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import RolesTab from './components/RolesTab';
import PermissionsTab from './components/PermissionsTab';
import PermissionMatrixTab from './components/PermissionMatrixTab';
import UsersTab from './components/UsersTab';

export default function AdminPage() {
  const { user, permissionsLoading } = useAuth();
  const { orgId, can, hasRole, loading } = usePermissions();
  const [activeTab, setActiveTab] = useState<'roles' | 'permissions' | 'matrix' | 'users'>('matrix');

  // ✅ Guard 1: Mostrar loader mientras se cargan permisos
  if (permissionsLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-4"></div>
            <p className="text-gray-600">Verificando permisos...</p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Guard 2: Verificar orgId
  if (!orgId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
            <p className="text-gray-600 mb-6">No tienes una organización asignada.</p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Guard 3: Verificar permisos (sin pasar orgId como parámetro)
  const hasAccess = hasRole('ADMIN') || can('admin.roles.manage');

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="text-center">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
            <p className="text-gray-600 mb-6">No tienes permisos para acceder a esta sección.</p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'matrix' as const, label: 'Matriz de Permisos', icon: 'ri-grid-line' },
    { id: 'roles' as const, label: 'Roles', icon: 'ri-shield-user-line' },
    { id: 'permissions' as const, label: 'Permisos', icon: 'ri-key-line' },
    { id: 'users' as const, label: 'Usuarios', icon: 'ri-team-line' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Administración de Permisos</h1>
          <p className="text-gray-600">Gestiona roles, permisos y asignaciones de usuarios</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <div className="flex gap-1 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
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
            {activeTab === 'roles' && <RolesTab />}
            {activeTab === 'permissions' && <PermissionsTab />}
            {activeTab === 'matrix' && <PermissionMatrixTab />}
            {activeTab === 'users' && <UsersTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
