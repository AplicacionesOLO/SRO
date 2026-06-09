import type { Provider } from '../types/catalog';

/**
 * Formatea la etiqueta de un proveedor para dropdowns con el formato:
 *   Cliente | código | nombre
 *
 * Ejemplo: "FEBECA | J303992722 | ADMINISTRADORA DE RIESGOS PARSALUD,S.A."
 *
 * Si el proveedor no tiene source ni código, solo devuelve el nombre.
 */
export function formatProviderLabel(provider: Provider): string {
  const source = provider.source?.trim() || null;
  const code = provider.provider_code?.trim() || provider.source_code?.trim() || null;

  if (!source && !code) {
    return provider.name;
  }

  const parts: string[] = [];
  if (source) parts.push(source);
  if (code) parts.push(code);
  parts.push(provider.name);

  return parts.join(' | ');
}