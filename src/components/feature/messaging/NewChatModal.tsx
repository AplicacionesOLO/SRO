import { useState } from 'react';
import type { MessagingContact } from '@/types/messaging';
import Avatar from './Avatar';

interface NewChatModalProps {
  open: boolean;
  contacts: MessagingContact[];
  onClose: () => void;
  onStartDirect: (recipientId: string) => void;
  onStartGroup: (title: string, memberIds: string[]) => void;
}

export default function NewChatModal({
  open,
  contacts,
  onClose,
  onStartDirect,
  onStartGroup,
}: NewChatModalProps) {
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const filtered = query.trim()
    ? contacts.filter((c) => {
        const q = query.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
        );
      })
    : contacts;

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDirect = (id: string) => {
    setBusy(true);
    onStartDirect(id);
    setBusy(false);
    onClose();
  };

  const handleGroup = () => {
    if (!groupName.trim() || selected.length === 0 || busy) return;
    setBusy(true);
    onStartGroup(groupName.trim(), selected);
    setBusy(false);
    setGroupName('');
    setSelected([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-800">Nueva conversación</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 py-3 flex items-center gap-2 flex-shrink-0">
          <div className="flex bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setMode('direct')}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'direct' ? 'bg-white text-emerald-700 font-medium shadow-sm' : 'text-gray-500'
              }`}
            >
              Directo
            </button>
            <button
              onClick={() => setMode('group')}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'group' ? 'bg-white text-emerald-700 font-medium shadow-sm' : 'text-gray-500'
              }`}
            >
              Grupo
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pb-2 flex-shrink-0">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400"></i>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o correo..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Group name (if group mode) */}
        {mode === 'group' && (
          <div className="px-5 pb-2 flex-shrink-0">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Nombre del grupo..."
              className="w-full px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {/* Contacts */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-gray-400">No hay usuarios disponibles para chatear</p>
              <p className="text-[11px] text-gray-300 mt-1">Solo ves usuarios de tus almacenes</p>
            </div>
          ) : (
            <ul>
              {filtered.map((c) => {
                const isSelected = selected.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => (mode === 'direct' ? handleDirect(c.id) : toggleSelect(c.id))}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-left"
                    >
                      <Avatar name={c.name} url={c.avatar_url} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                        {c.email && (
                          <p className="text-xs text-gray-500 truncate">{c.email}</p>
                        )}
                        <p className="text-xs text-gray-400 truncate">
                          {c.shared_warehouse_names.length > 0
                            ? c.shared_warehouse_names.slice(0, 2).join(', ')
                            : c.role || 'Usuario'}
                        </p>
                      </div>
                      {mode === 'group' && (
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <i className="ri-check-line text-xs"></i>}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Group footer */}
        {mode === 'group' && (
          <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={handleGroup}
              disabled={!groupName.trim() || selected.length === 0 || busy}
              className="w-full py-2.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap"
            >
              Crear grupo ({selected.length} {selected.length === 1 ? 'miembro' : 'miembros'})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}