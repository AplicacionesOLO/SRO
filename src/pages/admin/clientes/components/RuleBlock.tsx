import type { ReactNode } from 'react';

interface RuleBlockProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  children: ReactNode;
  scope?: 'client' | 'global';
  /** Texto corto que se muestra en el header cuando el bloque está colapsado */
  summary?: string;
  /** Si el bloque está expandido */
  isOpen: boolean;
  /** Callback al hacer click en el header */
  onToggle: () => void;
}

/**
 * Contenedor visual para cada regla en la pestaña Reglas del cliente.
 * Se comporta como un accordion: header siempre visible, contenido expandible.
 */
export default function RuleBlock({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  badge,
  badgeColor = 'bg-gray-100 text-gray-600',
  children,
  scope = 'client',
  summary,
  isOpen,
  onToggle,
}: RuleBlockProps) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Header del bloque — siempre visible, clickable */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${
          isOpen ? 'border-b border-gray-100 bg-gray-50/60' : 'bg-gray-50/40 hover:bg-gray-50'
        }`}
      >
        {/* Icono */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <i className={`${icon} text-base w-4 h-4 flex items-center justify-center ${iconColor}`}></i>
        </div>

        {/* Título + badges + descripción cuando abierto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{title}</span>
            {badge && (
              <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${badgeColor}`}>
                {badge}
              </span>
            )}
            {scope === 'global' && (
              <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-100 text-amber-700">
                Global · Aplica a todos los clientes
              </span>
            )}
            {/* Summary: visible cuando está cerrado */}
            {!isOpen && summary && (
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-white border border-gray-200 text-gray-700">
                {summary}
              </span>
            )}
          </div>
          {/* Descripción solo cuando está abierto */}
          {isOpen && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>

        {/* Chevron */}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-gray-400">
          <i className={`text-base transition-transform duration-200 ${
            isOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'
          }`}></i>
        </div>
      </button>

      {/* Contenido animado con grid-rows trick */}
      <div className={`grid transition-all duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-5 py-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
