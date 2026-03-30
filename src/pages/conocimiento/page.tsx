import { useState, useEffect } from 'react';
import { useKnowledgeDocuments } from '../../hooks/useKnowledgeDocuments';
import { fetchRoles } from '../../services/knowledgeService';
import DocumentCard from './components/DocumentCard';
import UploadDocumentModal from './components/UploadDocumentModal';
import EditDocumentModal from './components/EditDocumentModal';
import type { KnowledgeDocumentWithRelations } from '../../types/knowledge';
import type { DocumentStatus } from '../../types/knowledge';

const STATUS_FILTERS: Array<{ value: DocumentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'draft', label: 'Borrador' },
  { value: 'processing', label: 'Procesando' },
  { value: 'failed', label: 'Error' },
  { value: 'archived', label: 'Archivados' },
];

export default function ConocimientoPage() {
  const { documents, loading, error, uploadAndCreate, updateDoc, updateRelations, archive, process, reindex } =
    useKnowledgeDocuments();
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [editDoc, setEditDoc] = useState<KnowledgeDocumentWithRelations | null>(null);
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchRoles().then(setRoles).catch(() => {});
  }, []);

  // One-time bucket + RLS setup (idempotent, safe to re-run)
  useEffect(() => {
    const KEY = 'kd_storage_setup_v1';
    if (localStorage.getItem(KEY)) return;
    const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    fetch(`${SUPABASE_URL}/functions/v1/setup-knowledge-storage`, { method: 'POST' })
      .then((r) => { if (r.ok) localStorage.setItem(KEY, '1'); })
      .catch(() => {});
  }, []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleProcess = async (id: string) => {
    setProcessingId(id);
    try {
      await process(id);
      showToast('Documento enviado a procesar con IA');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReindex = async (id: string) => {
    setProcessingId(id);
    try {
      await reindex(id);
      showToast('Documento re-indexado correctamente');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archive(id);
      showToast('Documento archivado');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  const filtered = documents.filter((doc) => {
    const matchStatus = statusFilter === 'all' || doc.status === statusFilter;
    const matchSearch =
      !search ||
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase()) ||
      doc.file_name.toLowerCase().includes(search.toLowerCase()) ||
      doc.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const stats = {
    total: documents.length,
    active: documents.filter((d) => d.status === 'active').length,
    processing: documents.filter((d) => d.status === 'processing').length,
    failed: documents.filter((d) => d.status === 'failed').length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium shadow-sm animate-fade-in ${
          toast.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
        }`}>
          <i className={toast.type === 'error' ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'}></i>
          {toast.msg}
        </div>
      )}

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Base de Conocimiento</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Documentos PDF indexados para el asistente IA
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-upload-2-line"></i>
            Subir PDF
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: stats.total, icon: 'ri-file-list-3-line', color: 'text-gray-600' },
            { label: 'Activos', value: stats.active, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600' },
            { label: 'Procesando', value: stats.processing, icon: 'ri-loader-4-line', color: 'text-amber-600' },
            { label: 'Con error', value: stats.failed, icon: 'ri-error-warning-line', color: 'text-red-500' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
              <div className={`w-9 h-9 flex items-center justify-center`}>
                <i className={`${s.icon} text-xl ${s.color}`}></i>
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, descripción o etiqueta..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 bg-white"
            />
          </div>
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg flex-shrink-0">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value as DocumentStatus | 'all')}
                className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  statusFilter === f.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-600">
            <i className="ri-error-warning-line"></i> {error}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <i className="ri-loader-4-line text-2xl text-teal-500 animate-spin"></i>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mb-4">
              <i className="ri-file-search-line text-2xl text-gray-400"></i>
            </div>
            <h3 className="text-base font-medium text-gray-700 mb-1">
              {documents.length === 0 ? 'Aún no hay documentos' : 'Sin resultados'}
            </h3>
            <p className="text-sm text-gray-400">
              {documents.length === 0
                ? 'Subí el primer PDF para comenzar a construir la base de conocimiento'
                : 'Probá con otros filtros de búsqueda'}
            </p>
            {documents.length === 0 && (
              <button
                onClick={() => setShowUpload(true)}
                className="mt-4 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 cursor-pointer"
              >
                Subir primer documento
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onEdit={setEditDoc}
                onProcess={handleProcess}
                onReindex={handleReindex}
                onArchive={handleArchive}
                processing={processingId === doc.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadDocumentModal
          onClose={() => setShowUpload(false)}
          onUpload={uploadAndCreate}
          onProcess={handleProcess}
          roles={roles}
        />
      )}

      {editDoc && (
        <EditDocumentModal
          doc={editDoc}
          roles={roles}
          onClose={() => setEditDoc(null)}
          onSave={async (id, payload, tags, roleIds, permKeys) => {
            await updateDoc(id, payload);
            await updateRelations(id, tags, roleIds, permKeys);
            showToast('Documento actualizado');
          }}
        />
      )}
    </div>
  );
}
