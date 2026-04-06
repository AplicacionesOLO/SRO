import { useState, useRef, useEffect } from 'react';
import { useActiveWarehouse } from '@/contexts/ActiveWarehouseContext';

interface WarehouseSelectorProps {
  /** Mostrar como dropdown compacto (default) o como chips */
  variant?: 'dropdown' | 'chips';
  className?: string;
}

/**
 * Selector de almacén activo reutilizable.
 * Solo se renderiza si el usuario tiene múltiples almacenes permitidos.
 * Si tiene solo 1, muestra el nombre sin opción de cambio.
 */
export default function WarehouseSelector({ variant = 'dropdown', className = '' }: WarehouseSelectorProps) {
  const {
    allowedWarehouses,
    activeWarehouseId,
    activeWarehouse,
    setActiveWarehouseId,
    hasMultipleWarehouses,
    loading,
  } = useActiveWarehouse();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-400 ${className}`}>
        <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
        Cargando...
      </div>
    );
  }

  if (allowedWarehouses.length === 0) return null;

  // Usuario con 1 solo almacén → mostrar badge sin dropdown
  if (!hasMultipleWarehouses) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-teal-50 rounded-lg text-sm text-teal-700 font-medium ${className}`}>
        <i className="ri-building-2-line w-4 h-4 flex items-center justify-center"></i>
        {allowedWarehouses[0]?.name ?? 'Almacén'}
      </div>
    );
  }

  if (variant === 'chips') {
    return (
      <div className={`flex items-center gap-2 flex-wrap ${className}`}>
        <button
          onClick={() => setActiveWarehouseId(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeWarehouseId === null
              ? 'bg-teal-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todos
        </button>
        {allowedWarehouses.map((w) => (
          <button
            key={w.id}
            onClick={() => setActiveWarehouseId(w.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeWarehouseId === w.id
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {w.name}
          </button>
        ))}
      </div>
    );
  }

  // Variant: dropdown
  const label = activeWarehouse ? activeWarehouse.name : 'Todos los almacenes';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
      >
        <i className="ri-building-2-line w-4 h-4 flex items-center justify-center text-teal-600"></i>
        <span className="max-w-[160px] truncate">{label}</span>
        {open
          ? <i className="ri-arrow-up-s-line w-4 h-4 flex items-center justify-center text-gray-400"></i>
          : <i className="ri-arrow-down-s-line w-4 h-4 flex items-center justify-center text-gray-400"></i>
        }
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Opción "Todos" */}
          <button
            onClick={() => { setActiveWarehouseId(null); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors cursor-pointer ${
              activeWarehouseId === null
                ? 'bg-teal-50 text-teal-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100">
              <i className="ri-stack-line text-gray-500 text-sm"></i>
            </div>
            <span>Todos los almacenes</span>
            {activeWarehouseId === null && (
              <i className="ri-check-line ml-auto text-teal-600 w-4 h-4 flex items-center justify-center"></i>
            )}
          </button>

          <div className="border-t border-gray-100" />

          {/* Lista de almacenes */}
          {allowedWarehouses.map((w) => (
            <button
              key={w.id}
              onClick={() => { setActiveWarehouseId(w.id); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors cursor-pointer ${
                activeWarehouseId === w.id
                  ? 'bg-teal-50 text-teal-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-teal-50">
                <i className="ri-building-2-fill text-teal-500 text-sm"></i>
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="truncate">{w.name}</p>
                {w.location && (
                  <p className="text-xs text-gray-400 truncate">{w.location}</p>
                )}
              </div>
              {activeWarehouseId === w.id && (
                <i className="ri-check-line ml-auto text-teal-600 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
