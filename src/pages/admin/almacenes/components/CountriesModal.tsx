import { useEffect, useMemo, useState } from 'react';
import { countriesService, type Country } from '../../../../services/countriesService';

interface CountriesModalProps {
  isOpen: boolean;
  orgId: string;
  onClose: () => void;
  onChanged?: (countries: Country[]) => void;
}

export default function CountriesModal({ isOpen, orgId, onClose, onChanged }: CountriesModalProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingCode, setEditingCode] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedCountries = useMemo(() => {
    return [...countries].sort((a, b) => a.name.localeCompare(b.name));
  }, [countries]);

  const load = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setLoadError(null);
      const data = await countriesService.getAll(orgId);
      setCountries(data || []);
      onChanged?.(data || []);
    } catch (e: any) {
      console.error('[CountriesModal] load error', e);
      setLoadError(e?.message || 'Error al cargar países');
      setCountries([]);
      onChanged?.([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orgId]);

  const handleCreate = async () => {
    const name = newName.trim();
    const code = newCode.trim();
    if (!name || !code) return;

    try {
      setSavingNew(true);
      setLoadError(null);
      await countriesService.create(orgId, name, code);
      setNewName('');
      setNewCode('');
      await load();
    } catch (e: any) {
      console.error('[CountriesModal] create error', e);
      setLoadError(e?.message || 'Error al crear país');
    } finally {
      setSavingNew(false);
    }
  };

  const startEdit = (c: Country) => {
    setLoadError(null);
    setEditingId(c.id);
    setEditingName(c.name);
    setEditingCode(c.code);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingCode('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    const code = editingCode.trim();
    if (!name || !code) return;

    try {
      setSavingEdit(true);
      setLoadError(null);
      await countriesService.update(orgId, editingId, name, code);
      cancelEdit();
      await load();
    } catch (e: any) {
      console.error('[CountriesModal] update error', e);
      setLoadError(e?.message || 'Error al actualizar país');
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id: string) => {
    try {
      setDeletingId(id);
      setLoadError(null);
      await countriesService.remove(orgId, id);
      await load();
    } catch (e: any) {
      console.error('[CountriesModal] delete error', e);
      setLoadError(e?.message || 'Error al eliminar país');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Países</h2>
            <p className="text-sm text-gray-600">Agregar, editar o eliminar países del sistema</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Cerrar"
          >
            <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loadError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{loadError}</p>
            </div>
          )}

          {/* Crear */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-semibold text-gray-900 mb-3">Nuevo país</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del país (Ej: Costa Rica)"
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                disabled={savingNew}
              />
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="Código (Ej: CR)"
                maxLength={3}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                disabled={savingNew}
              />
              <button
                onClick={handleCreate}
                disabled={savingNew || !newName.trim() || !newCode.trim()}
                className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2"
              >
                {savingNew ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    Guardando...
                  </>
                ) : (
                  <>
                    <i className="ri-add-line"></i>
                    Agregar
                  </>
                )}
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              El código debe tener 2-3 caracteres (Ej: CR, USA, ESP)
            </div>
          </div>

          {/* Lista */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-5 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  País
                </div>
                <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Código
                </div>
                <div className="col-span-5 text-xs font-semibold text-gray-700 uppercase tracking-wider text-right">
                  Acciones
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-gray-600">
                <i className="ri-loader-4-line animate-spin text-2xl text-teal-600"></i>
                <div className="mt-2 text-sm">Cargando...</div>
              </div>
            ) : sortedCountries.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <i className="ri-inbox-line text-4xl text-gray-300"></i>
                <div className="mt-2 text-sm">No hay países registrados</div>
                <div className="text-xs text-gray-400 mt-1">Agrega el primer país usando el formulario de arriba</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {sortedCountries.map((c) => {
                  const isEditing = editingId === c.id;

                  return (
                    <div key={c.id} className="px-4 py-3">
                      {isEditing ? (
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-5">
                            <input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              placeholder="Nombre del país"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                              disabled={savingEdit}
                              autoFocus
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              value={editingCode}
                              onChange={(e) => setEditingCode(e.target.value.toUpperCase().slice(0, 3))}
                              placeholder="Código"
                              maxLength={3}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                              disabled={savingEdit}
                            />
                          </div>
                          <div className="col-span-5 flex items-center justify-end gap-2">
                            <button
                              onClick={cancelEdit}
                              disabled={savingEdit}
                              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={saveEdit}
                              disabled={savingEdit || !editingName.trim() || !editingCode.trim()}
                              className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                            >
                              {savingEdit ? 'Guardando...' : 'Guardar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-5">
                            <div className="text-sm font-medium text-gray-900">{c.name}</div>
                          </div>
                          <div className="col-span-2">
                            <span className="px-2 py-1 text-xs font-mono bg-gray-100 text-gray-700 rounded">
                              {c.code}
                            </span>
                          </div>
                          <div className="col-span-5 flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEdit(c)}
                              className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Editar país"
                            >
                              <i className="ri-edit-line text-lg w-5 h-5 flex items-center justify-center"></i>
                            </button>
                            <button
                              onClick={() => remove(c.id)}
                              disabled={deletingId === c.id}
                              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Eliminar país"
                            >
                              {deletingId === c.id ? (
                                <i className="ri-loader-4-line animate-spin text-lg w-5 h-5 flex items-center justify-center"></i>
                              ) : (
                                <i className="ri-delete-bin-line text-lg w-5 h-5 flex items-center justify-center"></i>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <i className="ri-information-line text-blue-600 mt-0.5"></i>
              <div className="text-sm text-blue-800">
                <div className="font-medium mb-1">Información sobre países:</div>
                <ul className="text-xs space-y-1 ml-2">
                  <li>• El código debe ser único y tener 2-3 caracteres (Ej: CR, USA, ESP)</li>
                  <li>• Si un país está asignado a almacenes, no se podrá eliminar</li>
                  <li>• Los países eliminados se marcan como inactivos pero se conservan</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
