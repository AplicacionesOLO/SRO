import { useState, useEffect, useRef, useCallback } from 'react';
import type { ProviderWithClients } from '../../../../types/catalog';

interface ProviderSearchSelectProps {
  providers: ProviderWithClients[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ProviderSearchSelect({
  providers,
  value,
  onChange,
  disabled = false,
  placeholder = 'Buscar proveedor…',
}: ProviderSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedProvider = providers.find(p => p.id === value) ?? null;

  // Filtrar por query (nombre o nombre de cliente)
  const filtered = query.trim()
    ? providers.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.clientNames.some(c => c.toLowerCase().includes(query.toLowerCase()))
      )
    : providers;

  // Reset highlight cuando cambia el filtro
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  // Click fuera cierra
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Scroll del ítem highlighted en vista
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLDivElement>('[data-option]');
    if (items[highlighted]) {
      items[highlighted].scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  const handleSelect = useCallback((provider: ProviderWithClients) => {
    onChange(provider.id);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }, [onChange]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (!open) setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlighted]) handleSelect(filtered[highlighted]);
        break;
      case 'Escape':
        setOpen(false);
        setQuery('');
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  };

  // Valor visible en el input
  const displayValue = open ? query : (selectedProvider?.name ?? '');

  return (
    <div ref={containerRef} className="relative">
      {/* Input con ícono de búsqueda */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-4 h-4 flex items-center justify-center">
          <i className="ri-search-line text-gray-400 text-sm"></i>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? '—' : (selectedProvider ? selectedProvider.name : placeholder)}
          disabled={disabled}
          autoComplete="off"
          className={[
            'w-full pl-9 pr-9 py-2 border rounded-lg text-sm transition-all',
            'focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none',
            disabled
              ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-white border-gray-300 text-gray-900 cursor-text',
            open ? 'ring-2 ring-teal-500 border-transparent' : '',
          ].join(' ')}
        />

        {/* Botón limpiar o chevron */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
          {value && !disabled ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              tabIndex={-1}
            >
              <i className="ri-close-line text-sm"></i>
            </button>
          ) : (
            <i
              className={`ri-arrow-down-s-line text-gray-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}
            ></i>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && !disabled && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="w-8 h-8 flex items-center justify-center mx-auto mb-2">
                <i className="ri-search-line text-gray-300 text-2xl"></i>
              </div>
              <p className="text-sm text-gray-400">
                {query ? `Sin resultados para "${query}"` : 'No hay proveedores disponibles'}
              </p>
            </div>
          ) : (
            filtered.map((provider, i) => (
              <div
                key={provider.id}
                data-option
                onClick={() => handleSelect(provider)}
                className={[
                  'px-4 py-3 cursor-pointer transition-colors border-b border-gray-50 last:border-b-0',
                  highlighted === i ? 'bg-teal-50' : 'hover:bg-gray-50',
                  provider.id === value ? 'bg-teal-50/60' : '',
                ].join(' ')}
                onMouseEnter={() => setHighlighted(i)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{provider.name}</span>
                  {provider.id === value && (
                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      <i className="ri-check-line text-teal-600 text-sm"></i>
                    </div>
                  )}
                </div>

                {provider.clientNames.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {provider.clientNames.map(clientName => (
                      <span
                        key={clientName}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-teal-50 text-teal-700 font-medium border border-teal-100"
                      >
                        <i className="ri-building-line text-teal-500" style={{ fontSize: '10px' }}></i>
                        {clientName}
                      </span>
                    ))}
                  </div>
                )}

                {provider.clientNames.length === 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">Sin cliente asociado en este almacén</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
