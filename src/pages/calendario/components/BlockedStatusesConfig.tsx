import { useState, useEffect, useCallback } from 'react';
import { clientBlockedStatusesService } from '../../../services/clientBlockedStatusesService';
import { calendarService } from '../../../services/calendarService';
import { useAuth } from '../../../contexts/AuthContext';

interface BlockedStatusesConfigProps {
  orgId: string;
  /**
   * ID del cliente para el que se configura la regla.
   * Si se pasa clientId, la regla se guarda en client_rules (por cliente).
   * Si NO se pasa clientId, el componente muestra un mensaje de error.
   */
  clientId?: string;
}

/**
 * Componente de configuración para la regla de bloqueo de edición por estado.
 *
 * La regla es POR CLIENTE: cada cliente tiene su propia lista de estados bloqueados.
 * Si Cofersa bloquea "Confirmada", solo las reservas de Cofersa quedan bloqueadas.
 */
export default function BlockedStatusesConfig({ orgId, clientId }: BlockedStatusesConfigProps) {
  const { canLocal } = useAuth();
  const isPrivileged = canLocal('admin.users.create') || canLocal('admin.matrix.update');

  const [statuses, setStatuses] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setError('');

      const statusesData = await calendarService.getReservationStatuses(orgId);
      setStatuses(statusesData);

      if (clientId) {
        const blockedIds = await clientBlockedStatusesService.getBlockedStatusIds(orgId, clientId);
        setSelectedIds(blockedIds);
        setOriginalIds(blockedIds);
      } else {
        setSelectedIds([]);
        setOriginalIds([]);
      }
    } catch {
      setError('Error al cargar la configuración. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [orgId, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = (statusId: string) => {
    if (!isPrivileged) return;
    setSelectedIds((prev) =>
      prev.includes(statusId) ? prev.filter((id) => id !== statusId) : [...prev, statusId]
    );
    setSaved(false);
  };

  const handleSave = async () => {
    if (!isPrivileged || !clientId) return;
    try {
      setSaving(true);
      setError('');
      await clientBlockedStatusesService.setBlockedStatusIds(orgId, clientId, selectedIds);
      setOriginalIds(selectedIds);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    JSON.stringify([...selectedIds].sort()) !== JSON.stringify([...originalIds].sort());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin w-8 h-8 flex items-center justify-center"></i>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <i className="ri-information-line text-amber-600 text-lg w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">¿Qué se bloquea?</p>
            <ul className="space-y-0.5 text-amber-700">
              <li>• Edición de campos en el modal de reserva</li>
              <li>• Cambio de estado</li>
              <li>• Mover la reserva en el calendario (drag &amp; drop)</li>
              <li>• Cancelar la reserva</li>
              <li>• Cualquier actualización desde el servicio</li>
            </ul>
            <p className="mt-2 font-medium text-amber-900">
              Esta regla aplica solo a las reservas de este cliente.
            </p>
          </div>
        </div>
      </div>

      {/* Lista de estados */}
      {statuses.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <i className="ri-flag-line text-4xl text-gray-300 w-10 h-10 flex items-center justify-center mx-auto mb-3"></i>
          <p className="text-sm text-gray-500">No hay estados configurados para esta organización.</p>
          <p className="text-xs text-gray-400 mt-1">Creá estados en la pestaña "Estatus Op" primero.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {statuses.map((status) => {
            const isSelected = selectedIds.includes(status.id);
            return (
              <button
                key={status.id}
                type="button"
                onClick={() => toggleStatus(status.id)}
                disabled={!isPrivileged || !clientId}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${!isPrivileged || !clientId ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                {/* Color dot */}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: status.color || '#6B7280' }}
                />

                {/* Nombre */}
                <span
                  className={`flex-1 text-sm font-medium ${
                    isSelected ? 'text-amber-900' : 'text-gray-800'
                  }`}
                >
                  {status.name}
                </span>

                {/* Badge "Bloqueado" */}
                {isSelected && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-semibold rounded-full">
                    <i className="ri-lock-line w-3 h-3 flex items-center justify-center"></i>
                    Bloqueado
                  </span>
                )}

                {/* Checkbox visual */}
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                  }`}
                >
                  {isSelected && (
                    <i className="ri-check-line text-white text-xs w-3 h-3 flex items-center justify-center"></i>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Resumen */}
      {selectedIds.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{selectedIds.length}</span> estado
            {selectedIds.length !== 1 ? 's' : ''} bloqueado
            {selectedIds.length !== 1 ? 's' : ''}:{' '}
            {selectedIds
              .map((id) => statuses.find((s) => s.id === id)?.name)
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <i className="ri-error-warning-line text-red-600 w-4 h-4 flex items-center justify-center"></i>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Sin permisos */}
      {!isPrivileged && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <i className="ri-lock-line text-gray-500 w-4 h-4 flex items-center justify-center"></i>
            <p className="text-sm text-gray-600">
              Solo usuarios con rol <span className="font-semibold">ADMIN</span> o{' '}
              <span className="font-semibold">Full Access</span> pueden modificar esta configuración.
            </p>
          </div>
        </div>
      )}

      {/* Botón guardar */}
      {isPrivileged && clientId && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
              saved
                ? 'bg-teal-600 text-white'
                : hasChanges
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            } disabled:opacity-60`}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                Guardando...
              </span>
            ) : saved ? (
              <span className="flex items-center gap-2">
                <i className="ri-check-line w-4 h-4 flex items-center justify-center"></i>
                Guardado
              </span>
            ) : (
              'Guardar configuración'
            )}
          </button>

          {hasChanges && !saving && (
            <button
              type="button"
              onClick={() => {
                setSelectedIds(originalIds);
                setSaved(false);
              }}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Descartar cambios
            </button>
          )}
        </div>
      )}
    </div>
  );
}
