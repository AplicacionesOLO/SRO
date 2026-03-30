import { useState } from 'react';
import type { KnowledgeDocumentWithRelations, DocumentStatus, DocumentAccessLevel } from '../../../types/knowledge';

interface DocumentCardProps {
  doc: KnowledgeDocumentWithRelations;
  onEdit: (doc: KnowledgeDocumentWithRelations) => void;
  onProcess: (id: string) => void;
  onReindex: (id: string) => void;
  onArchive: (id: string) => void;
  processing: boolean;
}

const STATUS_CONFIG: Record<DocumentStatus, { label: string; color: string; icon: string }> = {
  draft:      { label: 'Borrador',    color: 'bg-gray-100 text-gray-600',   icon: 'ri-draft-line' },
  processing: { label: 'Procesando', color: 'bg-amber-100 text-amber-700', icon: 'ri-loader-4-line' },
  active:     { label: 'Activo',     color: 'bg-emerald-100 text-emerald-700', icon: 'ri-checkbox-circle-line' },
  failed:     { label: 'Error',      color: 'bg-red-100 text-red-600',     icon: 'ri-error-warning-line' },
  archived:   { label: 'Archivado',  color: 'bg-gray-100 text-gray-400',   icon: 'ri-archive-line' },
};

const ACCESS_CONFIG: Record<DocumentAccessLevel, { label: string; color: string }> = {
  basic:    { label: 'Básico',    color: 'bg-teal-50 text-teal-700' },
  extended: { label: 'Extendido', color: 'bg-indigo-50 text-indigo-700' },
  internal: { label: 'Interno',   color: 'bg-rose-50 text-rose-700' },
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.floor(days / 7)} sem.`;
  return `hace ${Math.floor(days / 30)} mes.`;
}

export default function DocumentCard({
  doc,
  onEdit,
  onProcess,
  onReindex,
  onArchive,
  processing,
}: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.draft;
  const access = ACCESS_CONFIG[doc.access_level] ?? ACCESS_CONFIG.basic;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-teal-300 transition-colors relative">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 bg-red-50 rounded-lg">
            <i className="ri-file-pdf-line text-red-500 text-lg"></i>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{doc.title}</h3>
            <p className="text-xs text-gray-400 truncate">{doc.file_name}</p>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen((p) => !p)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-more-2-fill text-base"></i>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 bg-white border border-gray-200 rounded-lg shadow-sm py-1 w-44">
                <button
                  onClick={() => { onEdit(doc); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <i className="ri-edit-line text-gray-400"></i> Editar
                </button>
                {doc.status === 'draft' || doc.status === 'failed' ? (
                  <button
                    onClick={() => { onProcess(doc.id); setMenuOpen(false); }}
                    disabled={processing}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                  >
                    <i className="ri-cpu-line text-gray-400"></i> Procesar con IA
                  </button>
                ) : null}
                {doc.status === 'active' ? (
                  <button
                    onClick={() => { onReindex(doc.id); setMenuOpen(false); }}
                    disabled={processing}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                  >
                    <i className="ri-refresh-line text-gray-400"></i> Re-indexar
                  </button>
                ) : null}
                {doc.status !== 'archived' && (
                  <button
                    onClick={() => { onArchive(doc.id); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <i className="ri-archive-line text-red-400"></i> Archivar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {doc.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{doc.description}</p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
          <i className={`${status.icon} ${doc.status === 'processing' ? 'animate-spin' : ''}`}></i>
          {status.label}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${access.color}`}>
          {access.label}
        </span>
        {doc.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
            {tag}
          </span>
        ))}
        {doc.tags.length > 3 && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
            +{doc.tags.length - 3}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-gray-100">
        <span>{formatBytes(doc.file_size)}</span>
        <span>{timeAgo(doc.created_at)}</span>
      </div>
    </div>
  );
}
