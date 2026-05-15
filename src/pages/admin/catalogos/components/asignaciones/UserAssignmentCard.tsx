import type { ClientUser } from '@/services/clusterService';
import type { EffectiveSummary } from '@/services/effectiveProvidersService';

interface Props {
  user: ClientUser;
  effectiveSummary: EffectiveSummary | null;
  clusterCount: number;
  loadingEffective: boolean;
  onViewDetail: () => void;
  onCopyAssignments: () => void;
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ').filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
      <span className="text-xs font-semibold text-teal-700">{initials}</span>
    </div>
  );
}

export default function UserAssignmentCard({
  user,
  effectiveSummary,
  clusterCount,
  loadingEffective,
  onViewDetail,
  onCopyAssignments,
}: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-200 transition-colors">
      {/* User header */}
      <div className="flex items-start gap-3 mb-3">
        <Initials name={user.name} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
        </div>
      </div>

      {/* Stats */}
      {loadingEffective ? (
        <div className="flex items-center gap-2 mb-3">
          <div className="h-3 bg-gray-100 rounded animate-pulse w-24"></div>
          <div className="h-3 bg-gray-100 rounded animate-pulse w-16"></div>
        </div>
      ) : effectiveSummary ? (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 bg-teal-50 rounded-lg">
            <p className="text-base font-bold text-teal-700">{clusterCount}</p>
            <p className="text-xs text-teal-600">Clusters</p>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <p className="text-base font-bold text-blue-700">{effectiveSummary.individual_count}</p>
            <p className="text-xs text-blue-600">Individuales</p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-base font-bold text-gray-700">{effectiveSummary.total_unique}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-xs text-gray-400">Sin asignaciones</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onViewDetail}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-eye-line"></i>
          Ver detalle
        </button>
        <button
          type="button"
          onClick={onCopyAssignments}
          title="Copiar asignaciones a otro usuario"
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
        >
          <i className="ri-file-copy-line"></i>
        </button>
      </div>
    </div>
  );
}