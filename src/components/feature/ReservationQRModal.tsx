import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { buildQRPayload, getOperationTypeLabel, shortId } from '@/utils/reservationQr.utils';

export interface ReservationQRData {
  id: string;
  providerName: string;
  startDatetime: string;
  endDatetime: string;
  operationType?: string | null;
  warehouseTimezone?: string;
}

interface ReservationQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: ReservationQRData;
}

function formatDatetime(iso: string, tz: string): { date: string; time: string } {
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

export default function ReservationQRModal({
  isOpen,
  onClose,
  reservation,
}: ReservationQRModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string>('');

  const tz = reservation.warehouseTimezone || 'America/Costa_Rica';
  const start = formatDatetime(reservation.startDatetime, tz);
  const end = formatDatetime(reservation.endDatetime, tz);
  const operationLabel = getOperationTypeLabel(reservation.operationType);

  // Generar QR al abrir
  useEffect(() => {
    if (!isOpen || !reservation.id) return;

    const payload = buildQRPayload(reservation.id);

    QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        setQrDataUrl(url);
        setError('');
      })
      .catch(() => {
        setError('No se pudo generar el QR. Intentá de nuevo.');
      });
  }, [isOpen, reservation.id]);

  // Renderizar QR en canvas (para descarga de imagen)
  useEffect(() => {
    if (!isOpen || !reservation.id || !canvasRef.current) return;

    const payload = buildQRPayload(reservation.id);

    QRCode.toCanvas(canvasRef.current, payload, {
      width: 280,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).catch(() => {
      // non-blocking
    });
  }, [isOpen, reservation.id]);

  const handleDownloadImage = useCallback(async () => {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `reserva-qr-${shortId(reservation.id)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      setError('No se pudo descargar la imagen. Intentá de nuevo.');
    } finally {
      setDownloading(false);
    }
  }, [reservation.id]);

  const handleDownloadPDF = useCallback(async () => {
    if (!printRef.current) return;
    setDownloadingPdf(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const yOffset = Math.max(10, (pageHeight - imgHeight) / 2);

      pdf.addImage(imgData, 'PNG', 10, yOffset, imgWidth, imgHeight);
      pdf.save(`reserva-qr-${shortId(reservation.id)}.pdf`);
    } catch {
      setError('No se pudo generar el PDF. Intentá de nuevo.');
    } finally {
      setDownloadingPdf(false);
    }
  }, [reservation.id]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-teal-50 rounded-lg">
              <i className="ri-qr-code-line text-teal-700 text-lg"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">QR de Reserva</h2>
              <p className="text-xs text-gray-500">#{shortId(reservation.id)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="overflow-y-auto flex-1 p-6">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <i className="ri-error-warning-line flex-shrink-0"></i>
              {error}
            </div>
          )}

          {/* Ficha imprimible */}
          <div
            ref={printRef}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden"
            style={{ fontFamily: 'system-ui, sans-serif' }}
          >
            {/* Header de la ficha */}
            <div className="bg-teal-700 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-teal-200 text-xs font-medium uppercase tracking-wider">
                    Ficha de Cita
                  </p>
                  <p className="text-white text-lg font-bold mt-0.5">
                    Reserva #{shortId(reservation.id)}
                  </p>
                </div>
                <div className="w-8 h-8 flex items-center justify-center">
                  <i className="ri-calendar-check-line text-teal-200 text-2xl"></i>
                </div>
              </div>
            </div>

            {/* Cuerpo de la ficha */}
            <div className="p-5">
              <div className="flex gap-5">
                {/* QR */}
                <div className="flex-shrink-0">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR de reserva"
                      className="w-28 h-28 rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                      <i className="ri-loader-4-line animate-spin text-gray-400 text-2xl"></i>
                    </div>
                  )}
                  <p className="text-center text-xs text-gray-400 mt-1.5">Escanear para ingresar</p>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-2.5">
                  <InfoRow icon="ri-building-line" label="Proveedor" value={reservation.providerName || '—'} />
                  <InfoRow icon="ri-calendar-line" label="Fecha" value={start.date} />
                  <InfoRow icon="ri-time-line" label="Hora inicio" value={start.time} />
                  <InfoRow icon="ri-time-line" label="Hora fin" value={end.time} />
                  <InfoRow
                    icon={
                      reservation.operationType === 'distribucion'
                        ? 'ri-truck-line'
                        : reservation.operationType === 'zona_franca'
                        ? 'ri-global-line'
                        : 'ri-store-2-line'
                    }
                    label="Tipo operación"
                    value={operationLabel}
                  />
                </div>
              </div>

              {/* ID completo al pie */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 font-mono break-all">
                  ID: {reservation.id}
                </p>
              </div>
            </div>
          </div>

          {/* Canvas oculto para generación */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Footer con botones */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={handleDownloadImage}
            disabled={downloading || !qrDataUrl}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            {downloading ? (
              <><i className="ri-loader-4-line animate-spin"></i>Descargando...</>
            ) : (
              <><i className="ri-image-line"></i>Descargar imagen</>
            )}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPdf || !qrDataUrl}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            {downloadingPdf ? (
              <><i className="ri-loader-4-line animate-spin"></i>Generando PDF...</>
            ) : (
              <><i className="ri-file-pdf-line"></i>Descargar PDF</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
        <i className={`${icon} text-teal-600 text-sm`}></i>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 leading-none">{label}</p>
        <p className="text-sm font-medium text-gray-800 mt-0.5 leading-tight">{value}</p>
      </div>
    </div>
  );
}
