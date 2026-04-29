/**
 * Utilidades para generación y lectura de QR de reservas SRO.
 *
 * Formato del payload QR:
 * { "type": "sro_reservation", "reservation_id": "<UUID>" }
 */

export interface SROQRPayload {
  type: 'sro_reservation';
  reservation_id: string;
}

/**
 * Genera el string JSON que se codifica en el QR.
 */
export function buildQRPayload(reservationId: string): string {
  const payload: SROQRPayload = {
    type: 'sro_reservation',
    reservation_id: reservationId,
  };
  return JSON.stringify(payload);
}

/**
 * Parsea el contenido escaneado de un QR y extrae el reservation_id.
 * Soporta:
 *   - JSON con { type: "sro_reservation", reservation_id: "..." }
 *   - UUID puro (fallback)
 * Retorna null si el contenido no es válido.
 */
export function parseQRContent(raw: string): string | null {
  if (!raw || !raw.trim()) return null;

  const trimmed = raw.trim();

  // Intentar parsear como JSON
  try {
    const parsed = JSON.parse(trimmed) as Partial<SROQRPayload>;
    if (
      parsed.type === 'sro_reservation' &&
      typeof parsed.reservation_id === 'string' &&
      isValidUUID(parsed.reservation_id)
    ) {
      return parsed.reservation_id;
    }
  } catch {
    // no es JSON — intentar como UUID puro
  }

  // Fallback: UUID puro
  if (isValidUUID(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Valida que un string sea un UUID v4 válido.
 */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Formatea un UUID para mostrar solo los primeros 8 caracteres.
 */
export function shortId(uuid: string): string {
  return uuid.slice(0, 8).toUpperCase();
}

/**
 * Etiquetas legibles para operation_type.
 */
export const OPERATION_TYPE_LABELS: Record<string, string> = {
  distribucion: 'Distribución',
  almacen: 'Almacén',
  zona_franca: 'Zona Franca',
};

export function getOperationTypeLabel(operationType: string | null | undefined): string {
  if (!operationType) return '—';
  return OPERATION_TYPE_LABELS[operationType] ?? operationType;
}
