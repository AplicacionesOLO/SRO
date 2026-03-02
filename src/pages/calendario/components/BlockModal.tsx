
import { useState, useEffect } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';
import { calendarService, type DockTimeBlock, type Dock } from '../../../services/calendarService';
import { ConfirmModal } from '../../../components/base/ConfirmModal';

interface BlockModalProps {
  block: DockTimeBlock | null;
  docks: Dock[];
  onClose: () => void;
  onSave: () => void;
}

export default function BlockModal({ block, docks, onClose, onSave }: BlockModalProps) {
  const { can, orgId } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    dock_id: '',
    start_datetime: '',
    end_datetime: '',
    reason: '',
  });

  // Estado para notificaciones popup
  const [notifyModal, setNotifyModal] = useState({
    isOpen: false,
    type: 'info' as 'info' | 'warning' | 'error' | 'success',
    title: '',
    message: '',
  });

  // Estado para confirmación de eliminación
  const [confirmDeleteModal, setConfirmDeleteModal] = useState(false);

  useEffect(() => {
    if (block) {
      setFormData({
        dock_id: block.dock_id,
        start_datetime: new Date(block.start_datetime).toISOString().slice(0, 16),
        end_datetime: new Date(block.end_datetime).toISOString().slice(0, 16),
        reason: block.reason,
      });
    } else {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      setFormData({
        dock_id: docks[0]?.id || '',
        start_datetime: now.toISOString().slice(0, 16),
        end_datetime: oneHourLater.toISOString().slice(0, 16),
        reason: '',
      });
    }
  }, [block, docks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orgId) {
      setNotifyModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'No se pudo identificar la organización'
      });
      return;
    }

    if (!formData.dock_id || !formData.start_datetime || !formData.end_datetime || !formData.reason) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'Campos incompletos',
        message: 'Por favor completa todos los campos'
      });
      return;
    }

    const start = new Date(formData.start_datetime);
    const end = new Date(formData.end_datetime);

    if (end <= start) {
      setNotifyModal({
        isOpen: true,
        type: 'warning',
        title: 'Fecha inválida',
        message: 'La fecha de fin debe ser posterior a la fecha de inicio'
      });
      return;
    }

    try {
      setLoading(true);

      if (block) {
        // Actualizar no está implementado en el servicio, solo eliminar y crear
        setNotifyModal({
          isOpen: true,
          type: 'info',
          title: 'Función no disponible',
          message: 'La edición de bloqueos no está disponible. Por favor elimina y crea uno nuevo.'
        });
      } else {
        await calendarService.createDockTimeBlock({
          org_id: orgId,
          dock_id: formData.dock_id,
          start_datetime: start.toISOString(),
          end_datetime: end.toISOString(),
          reason: formData.reason,
        });
        onSave();
      }
    } catch (error: any) {
      console.error('Error guardando bloqueo:', error);
      setNotifyModal({
        isOpen: true,
        type: 'error',
        title: 'Error al guardar',
        message: error.message || 'Error al guardar el bloqueo'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
    setConfirmDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!block) return;

    setConfirmDeleteModal(false);

    try {
      setLoading(true);
      await calendarService.deleteDockTimeBlock(block.id);
      onSave();
    } catch (error: any) {
      console.error('Error eliminando bloqueo:', error);
      setNotifyModal({
        isOpen: true,
        type: 'error',
        title: 'Error al eliminar',
        message: error.message || 'Error al eliminar el bloqueo'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {block ? 'Editar Bloqueo' : 'Nuevo Bloqueo de Tiempo'}
            </h2>
            {block && (
              <p className="text-sm text-gray-500 mt-1">
                Creado por {block.creator?.name || 'Usuario'} el{' '}
                {new Date(block.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i className="ri-close-line text-2xl text-gray-500"></i>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* Andén */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Andén *
              </label>
              <select
                value={formData.dock_id}
                onChange={(e) => setFormData({ ...formData, dock_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
                disabled={!!block}
              >
                <option value="">Seleccionar andén</option>
                {docks.map((dock) => (
                  <option key={dock.id} value={dock.id}>
                    {dock.name} {dock.category ? `- ${dock.category.name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha y hora inicio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha y hora de inicio *
              </label>
              <input
                type="datetime-local"
                value={formData.start_datetime}
                onChange={(e) => setFormData({ ...formData, start_datetime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
                disabled={!!block}
              />
            </div>

            {/* Fecha y hora fin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha y hora de fin *
              </label>
              <input
                type="datetime-local"
                value={formData.end_datetime}
                onChange={(e) => setFormData({ ...formData, end_datetime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
                disabled={!!block}
              />
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo del bloqueo *
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                placeholder="Ej: Mantenimiento programado, reparación de equipos..."
                required
                disabled={!!block}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
            <div>
              {block && can('dock_blocks.delete') && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <i className="ri-delete-bin-line mr-2"></i>
                  Eliminar Bloqueo
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Cancelar
              </button>
              {!block && can('dock_blocks.create') && (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {loading ? (
                    <>
                      <i className="ri-loader-4-line animate-spin mr-2"></i>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <i className="ri-save-line mr-2"></i>
                      Crear Bloqueo
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Modal de notificación */}
      <ConfirmModal
        isOpen={notifyModal.isOpen}
        type={notifyModal.type}
        title={notifyModal.title}
        message={notifyModal.message}
        onConfirm={() => setNotifyModal({ ...notifyModal, isOpen: false })}
        onCancel={() => setNotifyModal({ ...notifyModal, isOpen: false })}
      />

      {/* Modal de confirmación de eliminación */}
      <ConfirmModal
        isOpen={confirmDeleteModal}
        type="warning"
        title="Confirmar eliminación"
        message="¿Estás seguro de que deseas eliminar este bloqueo?"
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteModal(false)}
      />
    </div>
  );
}
