import { useState, useEffect } from 'react';
import type { KnowledgeDocumentWithRelations, DocumentAccessLevel, DocumentVisibilityMode } from '../../../types/knowledge';
import type { UpdateDocumentPayload } from '../../../types/knowledge';

interface EditDocumentModalProps {
  doc: KnowledgeDocumentWithRelations;
  roles: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (id: string, payload: UpdateDocumentPayload, tags: string[], roleIds: string[], permKeys: string[]) => Promise<void>;
}

const CHAT_PERMISSIONS = [
  'chat.answers.basic',
  'chat.answers.extended',
  'chat.answers.internal',
];

export default function EditDocumentModal({ doc, roles, onClose, onSave }: EditDocumentModalProps) {
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description || '');
  const [accessLevel, setAccessLevel] = useState<DocumentAccessLevel>(doc.access_level);
  const [visibilityMode, setVisibilityMode] = useState<DocumentVisibilityMode>(doc.visibility_mode);
  const [tags, setTags] = useState<string[]>([...doc.tags]);
  const [tagInput, setTagInput] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([...doc.role_ids]);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([...doc.permission_keys]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(doc.title);
    setDescription(doc.description || '');
    setAccessLevel(doc.access_level);
    setVisibilityMode(doc.visibility_mode);
    setTags([...doc.tags]);
    setSelectedRoles([...doc.role_ids]);
    setSelectedPerms([...doc.permission_keys]);
  }, [doc]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  };

  const toggleRole = (id: string) =>
    setSelectedRoles((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);

  const togglePerm = (perm: string) =>
    setSelectedPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('El título es requerido'); return; }
    setLoading(true);
    setError(null);
    try {
      await onSave(
        doc.id,
        { title: title.trim(), description: description.trim() || undefined, access_level: accessLevel, visibility_mode: visibilityMode },
        tags,
        selectedRoles,
        selectedPerms
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900">Editar documento</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nivel de acceso</label>
              <select value={accessLevel} onChange={(e) => setAccessLevel(e.target.value as DocumentAccessLevel)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500">
                <option value="basic">Básico</option>
                <option value="extended">Extendido</option>
                <option value="internal">Interno</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Visibilidad</label>
              <select value={visibilityMode} onChange={(e) => setVisibilityMode(e.target.value as DocumentVisibilityMode)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500">
                <option value="public">Público</option>
                <option value="role_based">Por rol</option>
                <option value="permission_based">Por permiso</option>
                <option value="mixed">Mixto</option>
              </select>
            </div>
          </div>

          {(visibilityMode === 'role_based' || visibilityMode === 'mixed') && roles.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Roles con acceso</label>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <button key={r.id} type="button" onClick={() => toggleRole(r.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors ${selectedRoles.includes(r.id) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'}`}>
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(visibilityMode === 'permission_based' || visibilityMode === 'mixed') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Permisos con acceso</label>
              <div className="flex flex-wrap gap-2">
                {CHAT_PERMISSIONS.map((perm) => (
                  <button key={perm} type="button" onClick={() => togglePerm(perm)}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors ${selectedPerms.includes(perm) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'}`}>
                    {perm}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Etiquetas</label>
            <div className="flex gap-2">
              <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Nueva etiqueta..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
              />
              <button type="button" onClick={addTag} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 cursor-pointer whitespace-nowrap">+</button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                    {tag}
                    <button type="button" onClick={() => setTags((p) => p.filter((t) => t !== tag))} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                      <i className="ri-close-line text-xs"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <i className="ri-error-warning-line text-red-500"></i>
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer whitespace-nowrap">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 cursor-pointer whitespace-nowrap flex items-center gap-2">
              {loading && <i className="ri-loader-4-line animate-spin"></i>}
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
