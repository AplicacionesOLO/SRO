import { useState, useRef, useCallback } from 'react';
import type { DocumentAccessLevel, DocumentVisibilityMode } from '../../../types/knowledge';

interface UploadDocumentModalProps {
  onClose: () => void;
  onUpload: (
    file: File,
    payload: {
      title: string;
      description?: string;
      access_level: string;
      visibility_mode: string;
      tags?: string[];
      role_ids?: string[];
      permission_keys?: string[];
    }
  ) => Promise<string>;
  onProcess: (id: string) => Promise<void>;
  roles: Array<{ id: string; name: string }>;
}

const CHAT_PERMISSIONS = [
  'chat.answers.basic',
  'chat.answers.extended',
  'chat.answers.internal',
];

export default function UploadDocumentModal({
  onClose,
  onUpload,
  onProcess,
  roles,
}: UploadDocumentModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [accessLevel, setAccessLevel] = useState<DocumentAccessLevel>('basic');
  const [visibilityMode, setVisibilityMode] = useState<DocumentVisibilityMode>('mixed');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [processNow, setProcessNow] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'application/pdf') {
      setFile(droppedFile);
      if (!title) setTitle(droppedFile.name.replace('.pdf', ''));
    }
  }, [title]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const toggleRole = (id: string) =>
    setSelectedRoles((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);

  const togglePerm = (perm: string) =>
    setSelectedPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Seleccioná un archivo PDF'); return; }
    if (!title.trim()) { setError('El título es requerido'); return; }
    setLoading(true);
    setError(null);
    try {
      const docId = await onUpload(file, {
        title: title.trim(),
        description: description.trim() || undefined,
        access_level: accessLevel,
        visibility_mode: visibilityMode,
        tags,
        role_ids: selectedRoles,
        permission_keys: selectedPerms,
      });
      if (processNow) {
        await onProcess(docId);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Subir documento PDF</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* File Drop */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-teal-400 bg-teal-50' : file ? 'border-teal-300 bg-teal-50/50' : 'border-gray-300 hover:border-teal-300'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setFile(f); if (!title) setTitle(f.name.replace('.pdf', '')); }
              }}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <i className="ri-file-pdf-line text-3xl text-red-500"></i>
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                <span className="text-xs text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <i className="ri-upload-cloud-line text-3xl text-gray-300"></i>
                <p className="text-sm text-gray-500">Arrastrá un PDF o hacé click para seleccionar</p>
                <p className="text-xs text-gray-400">Solo archivos PDF</p>
              </div>
            )}
          </div>

          {/* Title + Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre descriptivo del documento"
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
                placeholder="Descripción breve del contenido..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Access Level + Visibility */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nivel de acceso</label>
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as DocumentAccessLevel)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
              >
                <option value="basic">Básico</option>
                <option value="extended">Extendido</option>
                <option value="internal">Interno</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Visibilidad</label>
              <select
                value={visibilityMode}
                onChange={(e) => setVisibilityMode(e.target.value as DocumentVisibilityMode)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
              >
                <option value="public">Público (todos)</option>
                <option value="role_based">Por rol</option>
                <option value="permission_based">Por permiso</option>
                <option value="mixed">Mixto (rol o permiso)</option>
              </select>
            </div>
          </div>

          {/* Roles */}
          {(visibilityMode === 'role_based' || visibilityMode === 'mixed') && roles.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Roles con acceso</label>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRole(r.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border ${
                      selectedRoles.includes(r.id)
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Permissions */}
          {(visibilityMode === 'permission_based' || visibilityMode === 'mixed') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Permisos con acceso</label>
              <div className="flex flex-wrap gap-2">
                {CHAT_PERMISSIONS.map((perm) => (
                  <button
                    key={perm}
                    type="button"
                    onClick={() => togglePerm(perm)}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border ${
                      selectedPerms.includes(perm)
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
                    }`}
                  >
                    {perm}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Etiquetas</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Agregar etiqueta..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
              />
              <button type="button" onClick={addTag} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 cursor-pointer whitespace-nowrap">
                Agregar
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                      <i className="ri-close-line text-xs"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Process now */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={processNow}
              onChange={(e) => setProcessNow(e.target.checked)}
              className="w-4 h-4 accent-teal-600"
            />
            <span className="text-sm text-gray-700">Procesar con IA al subir</span>
          </label>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <i className="ri-error-warning-line text-red-500"></i>
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer whitespace-nowrap">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !file || !title}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              {loading && <i className="ri-loader-4-line animate-spin"></i>}
              {loading ? 'Subiendo...' : 'Subir documento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
