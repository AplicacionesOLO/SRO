import type { WarehouseResolution } from '@/types/compliance';

interface WarehouseResolutionCardProps {
  resolution: WarehouseResolution;
}

export default function WarehouseResolutionCard({ resolution }: WarehouseResolutionCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        <i className="ri-git-branch-line text-teal-600"></i>
        Resolución de Warehouse
      </h4>

      <div className="flex items-center gap-2 text-sm font-mono">
        {/* Reservation */}
        <span className="px-2 py-1 bg-gray-100 rounded text-gray-700 text-xs">Reservation</span>
        <i className="ri-arrow-right-line text-gray-400 text-xs"></i>

        {/* Dock */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-500">dock_id</span>
          <span className="px-2 py-1 bg-teal-50 rounded text-teal-700 text-xs font-medium">
            {resolution.dockName || 'N/A'}
          </span>
        </div>
        <i className="ri-arrow-right-line text-gray-400 text-xs"></i>

        {/* Warehouse */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-500">warehouse_id</span>
          {resolution.couldNotResolve ? (
            <span className="px-2 py-1 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-1">
              <i className="ri-error-warning-line w-3 h-3 flex items-center justify-center"></i>
              No resuelto
            </span>
          ) : (
            <span className="px-2 py-1 bg-emerald-50 rounded text-emerald-700 text-xs font-medium">
              {resolution.warehouseName || '—'}
            </span>
          )}
        </div>
        <i className="ri-arrow-right-line text-gray-400 text-xs"></i>

        {/* Organization */}
        <span className="px-2 py-1 bg-gray-100 rounded text-gray-600 text-xs">{resolution.orgName || '—'}</span>
      </div>

      {/* Detalle */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-400">Reservation dock_id:</span>
          <p className="text-gray-700 font-mono">{resolution.dockId || '—'}</p>
        </div>
        <div>
          <span className="text-gray-400">Resolved warehouse_id:</span>
          <p className={`font-mono ${resolution.couldNotResolve ? 'text-red-600' : 'text-teal-700'}`}>
            {resolution.resolvedWarehouseId || 'NULL'}
          </p>
        </div>
      </div>
    </div>
  );
}