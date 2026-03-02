import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import { operationalStatusService } from '../../../services/operationalStatusService';
import type { OperationalStatus } from '../../../types/operationalStatus';
import { ConfirmModal } from '../../../components/base/ConfirmModal';

interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (status: Partial<OperationalStatus>) => void;
  status: OperationalStatus | null;
}

function StatusModal({ isOpen, onClose, onSave, status }: StatusModalProps) {
  const [formData, setFormData] = useState<Partial<OperationalStatus>>({
    name: '',
    code: '',
    color: '#3B82F6',
    order_index: 0,
    is_active: true,
  });

  useEffect(() => {
    if (status) {
      setFormData({
        name: status.name,
        code: status.code,
        color: status.color,
        order_index: status.order_index,
        is_active: status.is_active,
      });
    } else {
      setFormData({
        name: '',
        code: '',
        color: '#3B82F6',
        order_index: 0,
        is_active: true,
      });
    }
  }, [status, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">
          {status ? 'Editar Estado' : 'Nuevo Estado'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Código</label>
            <input
              type="text"
              value={formData.code || ''}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Color</label>
            <input
              type="color"
              value={formData.color || '#3B82F6'}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-full h-10 border rounded-lg cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Orden</label>
            <input
              type="number"
              value={formData.order_index || 0}
              onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active ?? true}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="is_active" className="text-sm font-medium cursor-pointer">
              Activo
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 whitespace-nowrap"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OperationalStatusesTab() {
  const { user } = useAuth();
  const { orgId, can } = usePermissions();

  const [statuses, setStatuses] = useState<OperationalStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusInUseMap, setStatusInUseMap] = useState<Record<string, boolean>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<OperationalStatus | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'success' | 'warning' | 'error' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning',
  });

  const [doubleConfirmModal, setDoubleConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const hasFullAccess = can('admin.matrix.update');

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const loadStatuses = async () => {
    if (!orgId) return;

    try {
      setLoading(true);
      setError(null);

      const data = await operationalStatusService.getStatuses(orgId);
      setStatuses(data);

      const inUseMap: Record<string, boolean> = {};
      await Promise.all(
        data.map(async (status) => {
          const inUse = await operationalStatusService.isStatusInUse(status.id, orgId);
          inUseMap[status.id] = inUse;
        })
      );
      setStatusInUseMap(inUseMap);
    } catch (err: any) {
      console.error('Failed to load statuses', err);
      setError(err?.message ?? 'Error al cargar estados');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (statusData: Partial<OperationalStatus>) => {
    if (!orgId) return;

    try {
      if (editingStatus) {
        await operationalStatusService.updateStatus(editingStatus.id, statusData);
      } else {
        await operationalStatusService.createStatus({ ...statusData, org_id: orgId });
      }
      setIsModalOpen(false);
      setEditingStatus(null);
      loadStatuses();
    } catch (err: any) {
      console.error('Error saving status:', err);
      alert(err?.message ?? 'Error al guardar estado');
    }
  };

  const handleToggleActive = (status: OperationalStatus) => {
    const isInUse = statusInUseMap[status.id];
    const isProtected = ['PENDING', 'DISPATCHED', 'ARRIVED_PENDING_UNLOAD'].includes(status.code);

    if (isInUse && !hasFullAccess) {
      alert('Este estado está en uso por reglas de correspondencia y no puede ser modificado.');
      return;
    }

    if (isInUse && hasFullAccess) {
      setConfirmModal({
        isOpen: true,
        title: 'Estado en uso',
        message: `Este estado está en uso por reglas de correspondencia. ¿Estás seguro de que deseas ${status.is_active ? 'inactivarlo' : 'activarlo'}?`,
        type: 'warning',
        onConfirm: () => {
          setConfirmModal((c) => ({ ...c, isOpen: false }));
          setDoubleConfirmModal({
            isOpen: true,
            title: 'Última advertencia',
            message: 'Esto puede afectar las configuraciones existentes. ¿Confirmar cambio?',
            onConfirm: async () => {
              setDoubleConfirmModal((c) => ({ ...c, isOpen: false }));
              await operationalStatusService.updateStatus(status.id, {
                is_active: !status.is_active,
              });
              loadStatuses();
            },
          });
        },
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: status.is_active ? 'Inactivar estado' : 'Activar estado',
      message: `¿Estás seguro de que deseas ${status.is_active ? 'inactivar' : 'activar'} este estado?`,
      type: 'warning',
      onConfirm: async () => {
        setConfirmModal((c) => ({ ...c, isOpen: false }));
        await operationalStatusService.updateStatus(status.id, {
          is_active: !status.is_active,
        });
        loadStatuses();
      },
    });
  };

  const handleDelete = (status: OperationalStatus) => {
    const isInUse = statusInUseMap[status.id];

    if (isInUse && !hasFullAccess) {
      alert('Este estado está en uso por reglas de correspondencia y no puede ser eliminado.');
      return;
    }

    if (isInUse && hasFullAccess) {
      setConfirmModal({
        isOpen: true,
        title: 'Estado en uso',
        message: 'Este estado está en uso por reglas de correspondencia. ¿Estás seguro de que deseas eliminarlo?',
        type: 'error',
        onConfirm: () => {
          setConfirmModal((c) => ({ ...c, isOpen: false }));
          setDoubleConfirmModal({
            isOpen: true,
            title: 'Última advertencia',
            message: 'Esto puede romper configuraciones existentes. ¿Confirmar eliminación?',
            onConfirm: async () => {
              setDoubleConfirmModal((c) => ({ ...c, isOpen: false }));
              await operationalStatusService.deleteStatus(status.id);
              loadStatuses();
            },
          });
        },
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Eliminar estado',
      message: '¿Estás seguro de que deseas eliminar este estado?',
      type: 'error',
      onConfirm: async () => {
        setConfirmModal((c) => ({ ...c, isOpen: false }));
        await operationalStatusService.deleteStatus(status.id);
        loadStatuses();
      },
    });
  };

  const handleEdit = (status: OperationalStatus) => {
    const isInUse = statusInUseMap[status.id];

    if (isInUse && !hasFullAccess) {
      alert('Este estado está en uso por reglas de correspondencia y no puede ser editado.');
      return;
    }

    setEditingStatus(status);
    setIsModalOpen(true);
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="ri-error-warning-line text-red-600 text-xl"></i>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-1">Error al cargar estados</h3>
              <p className="text-sm text-red-700">{error}</p>
              {orgId && <p className="text-xs text-red-600 mt-2">org_id usado: {orgId}</p>}
            </div>
          </div>
          <button
            onClick={loadStatuses}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="ri-alert-line text-yellow-600 text-xl"></i>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-1">No se pudo resolver org_id</h3>
              <p className="text-sm text-yellow-700">
                El usuario no tiene una organización asignada. Contactá al administrador.
              </p>
              <p className="text-xs text-yellow-600 mt-2">Diagnóstico: org_id = null</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
          <p className="text-sm text-gray-600 mt-2">Cargando estados...</p>
        </div>
      </div>
    );
  }

  if (statuses.length === 0) {
    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Estados Operativos</h3>
          <button
            onClick={() => {
              setEditingStatus(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Nuevo Estado
          </button>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <i className="ri-list-check text-4xl text-gray-400 mb-3"></i>
          <h3 className="font-semibold text-gray-700 mb-1">No hay estados configurados</h3>
          <p className="text-sm text-gray-600">Creá tu primer estado operativo para comenzar.</p>
          <p className="text-xs text-gray-500 mt-2">org_id: {orgId}</p>
        </div>
        <StatusModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingStatus(null);
          }}
          onSave={handleSave}
          status={editingStatus}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Estados Operativos</h3>
        <button
          onClick={() => {
            setEditingStatus(null);
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Nuevo Estado
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Orden</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Color</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Código</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Estado</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {statuses.map((status) => {
              const isInUse = statusInUseMap[status.id];
              const canModify = !isInUse || hasFullAccess;

              return (
                <tr key={status.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{status.order_index ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="w-6 h-6 rounded border" style={{ backgroundColor: status.color }}></div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">{status.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{status.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                          status.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {status.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      {isInUse && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 whitespace-nowrap">
                          En uso
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(status)}
                        disabled={!canModify}
                        title={!canModify ? 'En uso por reglas' : 'Editar'}
                        className={`p-2 rounded hover:bg-gray-100 ${
                          !canModify ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <i className="ri-edit-line text-blue-600"></i>
                      </button>
                      <button
                        onClick={() => handleToggleActive(status)}
                        disabled={!canModify}
                        title={
                          !canModify
                            ? 'En uso por reglas'
                            : status.is_active
                            ? 'Inactivar'
                            : 'Activar'
                        }
                        className={`p-2 rounded hover:bg-gray-100 ${
                          !canModify ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <i
                          className={`${
                            status.is_active ? 'ri-toggle-line' : 'ri-toggle-fill'
                          } text-teal-600`}
                        ></i>
                      </button>
                      <button
                        onClick={() => handleDelete(status)}
                        disabled={!canModify}
                        title={!canModify ? 'En uso por reglas' : 'Eliminar'}
                        className={`p-2 rounded hover:bg-gray-100 ${
                          !canModify ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <i className="ri-delete-bin-line text-red-600"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <StatusModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingStatus(null);
        }}
        onSave={handleSave}
        status={editingStatus}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Confirmar"
        cancelText="Cancelar"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((c) => ({ ...c, isOpen: false }))}
        showCancel={true}
      />

      <ConfirmModal
        isOpen={doubleConfirmModal.isOpen}
        type="error"
        title={doubleConfirmModal.title}
        message={doubleConfirmModal.message}
        confirmText="Sí, confirmar"
        cancelText="Cancelar"
        onConfirm={doubleConfirmModal.onConfirm}
        onCancel={() => setDoubleConfirmModal((c) => ({ ...c, isOpen: false }))}
        showCancel={true}
      />
    </div>
  );
}
