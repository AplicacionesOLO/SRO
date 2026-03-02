/**
 * Ordena andenes por el número dentro del nombre (orden natural)
 * Ejemplo: "Andén 1", "Andén 2", "Andén 10" en vez de "Andén 1", "Andén 10", "Andén 2"
 */
export function sortDocksByNameNumber<T extends { name?: string }>(a: T, b: T): number {
  const an = Number((a.name ?? '').match(/\d+/)?.[0] ?? NaN);
  const bn = Number((b.name ?? '').match(/\d+/)?.[0] ?? NaN);

  // Si ambos tienen número, ordenar por número
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;

  // Si solo uno tiene número, el que tiene número va primero
  if (!Number.isNaN(an) && Number.isNaN(bn)) return -1;
  if (Number.isNaN(an) && !Number.isNaN(bn)) return 1;

  // Fallback alfabético (con acentos)
  return (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' });
}
