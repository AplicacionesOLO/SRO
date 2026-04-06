import { useActiveWarehouse } from '@/contexts/ActiveWarehouseContext';

interface WarehousePageHeaderProps {
  title: string;
  description?: string;
  onChangeWarehouse?: () => void;
}

/**
 * Header reutilizable que muestra el almacén activo en páginas de Admin/Catálogos.
 * Si el usuario tiene múltiples almacenes, muestra botón para cambiar.
 */
export default function WarehousePageHeader({ title, description, onChangeWarehouse }: WarehousePageHeaderProps) {
  const { activeWarehouse, hasMultipleWarehouses } = useActiveWarehouse();

  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
        {description && <p className="text-gray-600 text-sm">{description}</p>}
      </div>

      {activeWarehouse && (
        <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5">
          <div className="w-8 h-8 flex items-center justify-center">
            <i className="ri-building-2-line text-teal-600 text-lg"></i>
          </div>
          <div>
            <p className="text-xs text-teal-600 font-medium uppercase tracking-wide">Almacén activo</p>
            <p className="text-sm font-semibold text-teal-900">{activeWarehouse.name}</p>
          </div>
          {hasMultipleWarehouses && onChangeWarehouse && (
            <button
              onClick={onChangeWarehouse}
              className="ml-2 text-xs text-teal-600 hover:text-teal-800 underline whitespace-nowrap cursor-pointer"
            >
              Cambiar
            </button>
          )}
        </div>
      )}

      {!activeWarehouse && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <i className="ri-alert-line text-amber-500 text-lg w-5 h-5 flex items-center justify-center"></i>
          <p className="text-sm text-amber-700">Sin almacén seleccionado</p>
          {onChangeWarehouse && (
            <button
              onClick={onChangeWarehouse}
              className="ml-2 text-xs text-amber-600 hover:text-amber-800 underline whitespace-nowrap cursor-pointer"
            >
              Seleccionar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
