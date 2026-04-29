import { useEffect, useRef, useState, useCallback } from 'react';
import { parseQRContent } from '@/utils/reservationQr.utils';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se llama con el reservation_id extraído del QR */
  onReservationIdScanned: (reservationId: string) => void;
  title?: string;
}

type ScannerState = 'idle' | 'starting' | 'scanning' | 'error';

export default function QRScannerModal({
  isOpen,
  onClose,
  onReservationIdScanned,
  title = 'Escanear QR de Reserva',
}: QRScannerModalProps) {
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scannerState, setScannerState] = useState<ScannerState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lastScanned, setLastScanned] = useState<string>('');
  const hasScannedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const isRunning = scannerRef.current.isScanning;
        if (isRunning) {
          await scannerRef.current.stop();
        }
      } catch {
        // non-blocking
      }
      try {
        scannerRef.current.clear();
      } catch {
        // non-blocking
      }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;

    setScannerState('starting');
    setErrorMsg('');
    hasScannedRef.current = false;

    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      const scannerId = 'sro-qr-scanner-container';
      const scannerEl = document.getElementById(scannerId);
      if (!scannerEl) {
        setScannerState('error');
        setErrorMsg('No se pudo inicializar el lector. Recargá la página.');
        return;
      }

      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          if (hasScannedRef.current) return;

          const reservationId = parseQRContent(decodedText);

          if (reservationId) {
            hasScannedRef.current = true;
            setLastScanned(reservationId);
            stopScanner().then(() => {
              onReservationIdScanned(reservationId);
            });
          } else {
            // QR detectado pero no es de SRO — mostrar aviso breve
            setErrorMsg('QR no reconocido. Escaneá el QR de una reserva SRO.');
            setTimeout(() => setErrorMsg(''), 2500);
          }
        },
        () => {
          // frame sin QR — ignorar
        }
      );

      setScannerState('scanning');
    } catch (err: any) {
      setScannerState('error');

      if (
        err?.message?.includes('Permission') ||
        err?.message?.includes('permission') ||
        err?.name === 'NotAllowedError'
      ) {
        setErrorMsg(
          'Permiso de cámara denegado. Habilitá el acceso a la cámara en la configuración del navegador e intentá de nuevo.'
        );
      } else if (
        err?.message?.includes('NotFound') ||
        err?.name === 'NotFoundError'
      ) {
        setErrorMsg('No se encontró ninguna cámara en este dispositivo.');
      } else {
        setErrorMsg(
          `No se pudo iniciar la cámara: ${err?.message || 'Error desconocido'}. Verificá los permisos e intentá de nuevo.`
        );
      }
    }
  }, [onReservationIdScanned, stopScanner]);

  // Iniciar al abrir, detener al cerrar
  useEffect(() => {
    if (isOpen) {
      // Pequeño delay para que el DOM esté listo
      const t = setTimeout(() => startScanner(), 150);
      return () => clearTimeout(t);
    } else {
      stopScanner();
      setScannerState('idle');
      setErrorMsg('');
      setLastScanned('');
      hasScannedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      stopScanner();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    stopScanner().then(() => onClose());
  }, [stopScanner, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[70]"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-teal-50 rounded-lg">
              <i className="ri-scan-line text-teal-700 text-lg"></i>
            </div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-4">
          {/* Instrucción */}
          <p className="text-sm text-gray-600 text-center">
            Apuntá la cámara al código QR de la reserva para cargarla automáticamente.
          </p>

          {/* Contenedor del scanner */}
          <div className="relative rounded-xl overflow-hidden bg-gray-900" style={{ minHeight: 280 }}>
            <div
              id="sro-qr-scanner-container"
              ref={containerRef}
              className="w-full"
            />

            {/* Overlay de estado */}
            {scannerState === 'starting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 gap-3">
                <i className="ri-loader-4-line animate-spin text-white text-3xl"></i>
                <p className="text-white text-sm">Iniciando cámara...</p>
              </div>
            )}

            {scannerState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 gap-3 p-5">
                <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-full">
                  <i className="ri-camera-off-line text-red-600 text-2xl"></i>
                </div>
                <p className="text-white text-sm text-center leading-relaxed">{errorMsg}</p>
                <button
                  onClick={() => startScanner()}
                  className="mt-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-refresh-line mr-1.5"></i>
                  Reintentar
                </button>
              </div>
            )}
          </div>

          {/* Aviso de QR no reconocido (overlay temporal) */}
          {scannerState === 'scanning' && errorMsg && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
              <i className="ri-alert-line text-amber-600 flex-shrink-0"></i>
              <p className="text-sm text-amber-800">{errorMsg}</p>
            </div>
          )}

          {/* Último ID escaneado (feedback visual) */}
          {lastScanned && (
            <div className="flex items-center gap-2 px-4 py-3 bg-teal-50 border border-teal-200 rounded-lg">
              <i className="ri-checkbox-circle-line text-teal-600 flex-shrink-0"></i>
              <div className="min-w-0">
                <p className="text-sm font-medium text-teal-800">QR detectado</p>
                <p className="text-xs text-teal-600 font-mono truncate">{lastScanned}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleClose}
            className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
