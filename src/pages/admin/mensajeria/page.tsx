import { useState, useEffect, useCallback } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchAdminData } from '@/services/messagingService';
import type { MessagingAdminData } from '@/types/messaging';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export default function MensajeriaAdminPage() {
  const { orgId } = usePermissions();
  const [data, setData] = useState<MessagingAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'direct' | 'group'>('all');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminData(orgId);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats;
  const conversations = data?.conversations ?? [];
  const filtered = filter === 'all' ? conversations : conversations.filter((c) => c.type === filter);

  const statCards = [
    { label: 'Conversaciones', value: stats?.total_conversations ?? 0, icon: 'ri-chat-1-line' },
    { label: 'Mensajes', value: stats?.total_messages ?? 0, icon: 'ri-message-2-line' },
    { label: 'Archivos', value: stats?.total_attachments ?? 0, icon: 'ri-folder-2-line' },
    { label: 'Usuarios activos', value: stats?.active_users ?? 0, icon: 'ri-team-line' },
  ];

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Monitoreo de Mensajería</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Actividad de la mensajería interna de toda la organización
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer transition-colors whitespace-nowrap"
        >
          <i className="ri-refresh-line"></i>
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <i className="ri-error-warning-line"></i>
          <span>{error}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <i className={`${s.icon} text-lg text-emerald-600`}></i>
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-800 leading-none">{loading ? '—' : s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-gray-100 rounded-full p-1">
          {(['all', 'direct', 'group'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                filter === f ? 'bg-white text-emerald-700 font-medium shadow-sm' : 'text-gray-500'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'direct' ? 'Directos' : 'Grupos'}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <i className="ri-loader-4-line text-2xl text-emerald-500 animate-spin"></i>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <i className="ri-chat-1-line text-3xl text-gray-200 block mb-2"></i>
            <p className="text-sm text-gray-400">No hay conversaciones registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversación</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Miembros</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Último mensaje</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actividad</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <i className={`${c.type === 'group' ? 'ri-team-line' : 'ri-user-line'} text-emerald-600 text-sm`}></i>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {c.title || c.members.map((m) => m.name).join(', ')}
                          </p>
                          <p className="text-[11px] text-gray-400">{c.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          c.type === 'group' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {c.type === 'group' ? 'Grupo' : 'Directo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600">{c.members.length}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-xs text-gray-600 truncate">{c.last_message_preview || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-500 whitespace-nowrap">{timeAgo(c.last_message_at)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}