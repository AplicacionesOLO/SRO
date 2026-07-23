import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarSearchProps {
  isExpanded: boolean;
  isCollapsed: boolean;
  onSearch: (query: string) => void;
  onOpenResult: (path: string) => void;
  filteredPaths: string[];
}

export default function SidebarSearch({ isExpanded, isCollapsed, onSearch, onOpenResult, filteredPaths }: SidebarSearchProps) {
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (e.key === 'k' && (e.metaKey || e.ctrlKey) && !isTyping) {
      e.preventDefault();
      setIsFloatingOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (e.key === 'Escape') {
      setIsFloatingOpen(false);
      setQuery('');
      onSearch('');
    }
  }, [onSearch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleChange = (value: string) => {
    setQuery(value);
    onSearch(value);
  };

  const handleSelect = (path: string) => {
    onOpenResult(path);
    setIsFloatingOpen(false);
    setQuery('');
    onSearch('');
  };

  if (isCollapsed) {
    return (
      <>
        <div className="px-2 py-2 flex justify-center">
          <button
            onClick={() => {
              setIsFloatingOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.05] text-gray-500 hover:text-teal-400 hover:bg-white/[0.05] hover:border-white/[0.08] transition-all duration-200 cursor-pointer"
            aria-label="Buscar módulo (Ctrl+K)"
          >
            <i className="ri-search-line text-xl w-6 h-6 flex items-center justify-center" />
          </button>
        </div>

        <AnimatePresence>
          {isFloatingOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[90]"
                onClick={() => {
                  setIsFloatingOpen(false);
                  setQuery('');
                  onSearch('');
                }}
              />
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[460px] max-w-[92vw] bg-[#0F172A] border border-white/[0.08] rounded-2xl shadow-2xl z-[100] overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0A0F1C] border border-white/[0.06]">
                    <i className="ri-search-line text-gray-400 w-5 h-5 flex items-center justify-center" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => handleChange(e.target.value)}
                      placeholder="Buscar módulo..."
                      className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                      autoFocus
                    />
                    <kbd className="px-2 py-1 rounded-md bg-white/[0.04] text-gray-500 text-[11px] font-semibold border border-white/[0.06]">
                      ESC
                    </kbd>
                  </div>
                </div>

                {filteredPaths.length > 0 && (
                  <div className="max-h-72 overflow-y-auto pb-3">
                    <div className="px-4 pb-2 pt-1">
                      <span className="text-[11px] font-bold tracking-widest uppercase text-gray-600">Módulos</span>
                    </div>
                    {filteredPaths.map((path, idx) => (
                      <motion.button
                        key={path}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        onClick={() => handleSelect(path)}
                        className="w-full flex items-center gap-3 px-5 py-3 text-sm text-gray-300 hover:bg-white/[0.04] hover:text-white transition-all duration-100 text-left cursor-pointer"
                      >
                        <span className="w-6 h-6 flex items-center justify-center rounded-md bg-white/[0.04]">
                          <i className="ri-corner-down-right-line text-teal-400/70 text-sm w-4 h-4 flex items-center justify-center" />
                        </span>
                        <span>{path}</span>
                      </motion.button>
                    ))}
                  </div>
                )}

                {query && filteredPaths.length === 0 && (
                  <div className="px-5 py-8 text-sm text-gray-600 text-center">
                    Sin resultados para &quot;{query}&quot;
                  </div>
                )}

                {!query && (
                  <div className="px-5 py-8 text-sm text-gray-600 text-center">
                    Escribe para buscar módulos del sistema
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="px-4 py-2">
      <button
        onClick={() => {
          setIsFloatingOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-200 cursor-pointer group"
      >
        <i className="ri-search-line text-gray-400 group-hover:text-teal-400 transition-colors w-5 h-5 flex items-center justify-center" />
        <span className="flex-1 text-left text-sm text-gray-500 group-hover:text-gray-300 transition-colors">
          Buscar módulo...
        </span>
        <kbd className="px-2 py-1 rounded-md bg-white/[0.04] text-gray-600 text-[11px] font-semibold border border-white/[0.06] group-hover:text-gray-400 transition-colors">
          Ctrl K
        </kbd>
      </button>

      <AnimatePresence>
        {isFloatingOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[90]"
              onClick={() => {
                setIsFloatingOpen(false);
                setQuery('');
                onSearch('');
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[460px] max-w-[92vw] bg-[#0F172A] border border-white/[0.08] rounded-2xl shadow-2xl z-[100] overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0A0F1C] border border-white/[0.06]">
                  <i className="ri-search-line text-gray-400 w-5 h-5 flex items-center justify-center" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    placeholder="Buscar módulo..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                    autoFocus
                  />
                  <kbd className="px-2 py-1 rounded-md bg-white/[0.04] text-gray-500 text-[11px] font-semibold border border-white/[0.06]">
                    ESC
                  </kbd>
                </div>
              </div>

              {filteredPaths.length > 0 && (
                <div className="max-h-72 overflow-y-auto pb-3">
                  <div className="px-4 pb-2 pt-1">
                    <span className="text-[11px] font-bold tracking-widest uppercase text-gray-600">Módulos</span>
                  </div>
                  {filteredPaths.map((path, idx) => (
                    <motion.button
                      key={path}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      onClick={() => handleSelect(path)}
                      className="w-full flex items-center gap-3 px-5 py-3 text-sm text-gray-300 hover:bg-white/[0.04] hover:text-white transition-all duration-100 text-left cursor-pointer"
                    >
                      <span className="w-6 h-6 flex items-center justify-center rounded-md bg-white/[0.04]">
                        <i className="ri-corner-down-right-line text-teal-400/70 text-sm w-4 h-4 flex items-center justify-center" />
                      </span>
                      <span>{path}</span>
                    </motion.button>
                  ))}
                </div>
              )}

              {query && filteredPaths.length === 0 && (
                <div className="px-5 py-8 text-sm text-gray-600 text-center">
                  Sin resultados para &quot;{query}&quot;
                </div>
              )}

              {!query && (
                <div className="px-5 py-8 text-sm text-gray-600 text-center">
                  Escribe para buscar módulos del sistema
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}