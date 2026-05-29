import { useState, useEffect, useCallback } from 'react';

/**
 * Hook genérico que persiste un estado de React en sessionStorage.
 * Al montar, recupera el valor guardado. Al cambiar, lo guarda.
 * Si no hay valor guardado, usa el initialValue.
 */
export function useSessionStorageState<T>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // Si hay error de parseo, seguimos con el valor inicial
    }
    return initialValue;
  });

  // Guardar en sessionStorage cada vez que cambia el valor
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // sessionStorage puede estar lleno o deshabilitado
    }
  }, [key, value]);

  // setValue envuelto para evitar que se pierda la referencia en callbacks
  const setValueStable = useCallback(
    (next: React.SetStateAction<T>) => {
      setValue(next);
    },
    []
  );

  return [value, setValueStable];
}