import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';

export interface SearchSelectOption {
  id: string;
  label: string;
}

interface SearchSelectProps {
  options: SearchSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const MAX_VISIBLE = 50;
const BLUR_DELAY_MS = 150;
const DEBOUNCE_MS = 200;

export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar...',
  disabled = false,
  className = '',
}: SearchSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync display label when value changes externally
  useEffect(() => {
    if (!value) {
      setQuery('');
      return;
    }
    const found = options.find(o => o.id === value);
    if (found) setQuery(found.label);
  }, [value, options]);

  // Debounce query → debouncedQuery
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [debouncedQuery]);

  const filteredOptions = useCallback((): SearchSelectOption[] => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return options.slice(0, MAX_VISIBLE);
    return options
      .filter(o => o.label.toLowerCase().includes(q))
      .slice(0, MAX_VISIBLE);
  }, [debouncedQuery, options])();

  const selectOption = (option: SearchSelectOption) => {
    onChange(option.id);
    setQuery(option.label);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
    // Clear selection if user is typing something different
    if (value) {
      const current = options.find(o => o.id === value);
      if (current && e.target.value !== current.label) {
        onChange('');
      }
    }
  };

  const handleFocus = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    setIsOpen(true);
  };

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      // If query doesn't match any selected value, clear it
      if (value) {
        const current = options.find(o => o.id === value);
        if (current) setQuery(current.label);
        else setQuery('');
      } else {
        setQuery('');
      }
    }, BLUR_DELAY_MS);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev < filteredOptions.length - 1 ? prev + 1 : 0;
          scrollToItem(next);
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev > 0 ? prev - 1 : filteredOptions.length - 1;
          scrollToItem(next);
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          selectOption(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  };

  const scrollToItem = (index: number) => {
    if (!listRef.current) return;
    const item = listRef.current.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  };

  const selectedLabel = value ? options.find(o => o.id === value)?.label : '';

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? '' : placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
          {value && selectedLabel ? (
            <i className="ri-check-line text-teal-600 text-sm"></i>
          ) : (
            <i className="ri-search-line text-sm"></i>
          )}
        </span>
      </div>

      {isOpen && !disabled && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md max-h-56 overflow-y-auto"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }}
        >
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400 select-none">Sin resultados</li>
          ) : (
            filteredOptions.map((option, idx) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value}
                onMouseDown={() => selectOption(option)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`px-3 py-2 text-sm cursor-pointer select-none flex items-center justify-between gap-2 ${
                  idx === highlightedIndex
                    ? 'bg-teal-50 text-teal-900'
                    : option.id === value
                    ? 'bg-gray-50 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {option.id === value && (
                  <i className="ri-check-line text-teal-600 text-sm flex-shrink-0"></i>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
