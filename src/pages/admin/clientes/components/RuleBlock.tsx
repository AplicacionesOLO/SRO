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
}

/**
 * Contenedor visual para cada regla en la pestaña Reglas del cliente.
 * Cada regla se muestra como un bloque/card independiente con título, descripción e icono.
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
}: RuleBlockProps) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Header del bloque */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <i className={`${icon} text-base w-4 h-4 flex items-center justify-center ${iconColor}`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
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
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>

      {/* Contenido del bloque */}
      <div className="px-5 py-4">
        {children}
      </div>
    </div>
  );
}
