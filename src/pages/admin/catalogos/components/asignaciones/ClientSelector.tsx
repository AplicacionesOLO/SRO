import { useState, useEffect, useRef } from 'react';
import { clientsService } from '@/services/clientsService';
import type { Client } from '@/types/client';

interface Props {
  orgId: string;
  selectedClient: Client | null;
  onSelect: (client: Client | null) => void;
}

export default function ClientSelector({ orgId, selectedClient, onSelect }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await clientsService.listClients(orgId, search || undefined);
        if (!cancelled) setClients(data.filter((c) => c.is_active));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [orgId, search]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function handleSelect(client: Client) {
    onSelect(client);
    setOpen(false);
    setSearch('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect(null);
    setSearch('');
  }

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm cursor-pointer hover:border-teal-400 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <i className="ri-building-line text-gray-400 text-base w-4 h-4 flex items-center justify-center shrink-0"></i>
          {selectedClient ? (
            <span className="font-medium text-gray-800 truncate">{selectedClient.name}</span>
          ) : (
            <span className="text-gray-400">Seleccionar cliente...</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selectedClient && (
            <span
              onClick={handleClear}
              className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <i className="ri-close-line text-sm"></i>
            </span>
          )}
          <i className={`ri-arrow-down-s-line text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}></i>
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-md z-20 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-md">
              <i className="ri-search-line text-gray-400 text-sm w-4 h-4 flex items-center justify-center"></i>
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center">
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
              </div>
            ) : clients.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">Sin resultados</p>
            ) : (
              clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 transition-colors cursor-pointer ${
                    selectedClient?.id === c.id ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}