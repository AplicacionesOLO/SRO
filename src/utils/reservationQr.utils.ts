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

/**
 * Genera un Blob PNG del QR de una reserva, listo para subir a Storage.
 * Se usa lazy-load de qrcode para no aumentar el bundle crítico.
 */
export async function generateQRBlob(reservationId: string): Promise<Blob> {
  const payload = buildQRPayload(reservationId);

  const QRCodeLib = (await import('qrcode')).default;

  const dataUrl = await QRCodeLib.toDataURL(payload, {
    width: 400,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  const res = await fetch(dataUrl);
  return res.blob();
}

// ─── Ficha de Cita (imagen completa tipo tarjeta) ────────────────────────

export interface QRCardData {
  id: string;
  providerName: string;
  startDatetime: string;
  endDatetime: string;
  operationType?: string | null;
  warehouseTimezone?: string;
}

function formatDatetimeForQR(iso: string, tz: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('es-CR', {
      timeZone: tz,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const time = d.toLocaleTimeString('es-CR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return { date, time };
  } catch {
    return { date: iso, time: '' };
  }
}

/**
 * Genera un Blob PNG de una ficha de cita completa, lista para subir a Storage.
 * Incluye header teal, QR, datos de la reserva y footer con ID.
 * Renderizado con Canvas 2D a 2x para retina.
 */
export async function generateQRCardBlob(data: QRCardData): Promise<Blob> {
  const { id, providerName, startDatetime, endDatetime, operationType, warehouseTimezone } = data;

  // 1. Generar QR como DataURL
  const payload = buildQRPayload(id);
  const QRCodeLib = (await import('qrcode')).default;
  const qrDataUrl = await QRCodeLib.toDataURL(payload, {
    width: 200,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  // 2. Cargar QR en imagen
  const qrImg = new Image();
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve();
    qrImg.onerror = reject;
    qrImg.src = qrDataUrl;
  });

  // 3. Formatear datos
  const tz = warehouseTimezone || 'America/Costa_Rica';
  const start = formatDatetimeForQR(startDatetime, tz);
  const end = formatDatetimeForQR(endDatetime, tz);
  const operationLabel = getOperationTypeLabel(operationType);

  // 4. Canvas (2x para retina)
  const W = 600;
  const H = 400;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // Fondo blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Borde de tarjeta
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, W, H);

  // Header teal
  ctx.fillStyle = '#0d9488';
  ctx.fillRect(0, 0, W, 68);

  // Subtítulo header
  ctx.fillStyle = '#99f6e4';
  ctx.font = '600 12px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('FICHA DE CITA', 24, 14);

  // Título header
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Reserva #${shortId(id)}`, 24, 34);

  // Ícono decorativo (círculo)
  ctx.beginPath();
  ctx.arc(W - 40, 34, 14, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();

  // Cuerpo – QR
  const qrSize = 150;
  const qrX = 28;
  const qrY = 88;

  // Borde contenedor QR
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6);

  // Fondo contenedor QR
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6);

  // Dibujar QR
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Label bajo QR
  ctx.fillStyle = '#9ca3af';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Escanear para ingresar', qrX + qrSize / 2, qrY + qrSize + 12);
  ctx.textAlign = 'left';

  // Info – columnas derecha
  const infoX = qrX + qrSize + 36;
  let infoY = qrY + 4;
  const lineHeight = 46;

  const infoItems = [
    { label: 'PROVEEDOR', value: providerName || '—' },
    { label: 'FECHA', value: start.date },
    { label: 'HORA INICIO', value: start.time },
    { label: 'HORA FIN', value: end.time },
    { label: 'TIPO DE OPERACIÓN', value: operationLabel },
  ];

  infoItems.forEach((item) => {
    // Label
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(item.label, infoX, infoY);

    // Value (con truncado si es muy largo)
    ctx.fillStyle = '#1f2937';
    ctx.font = '600 15px system-ui, sans-serif';

    const maxTextWidth = W - infoX - 28;
    let text = item.value;
    let measured = ctx.measureText(text).width;
    while (measured > maxTextWidth && text.length > 3) {
      text = text.slice(0, -1);
      measured = ctx.measureText(text + '...').width;
    }
    if (text !== item.value) text += '...';

    ctx.fillText(text, infoX, infoY + 16);

    infoY += lineHeight;
  });

  // Separador footer
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, H - 48);
  ctx.lineTo(W - 24, H - 48);
  ctx.stroke();

  // Footer ID
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px monospace';
  ctx.fillText(`ID: ${id}`, 24, H - 32);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}