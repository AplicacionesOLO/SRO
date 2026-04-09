import {
  useState,
  useRef,
  useCallback,
  useEffect,
  Children,
  cloneElement,
  isValidElement,
} from 'react';
import { createPortal } from 'react-dom';

export interface ReservationHoverData {
  id: string;
  startDatetime: string;
  endDatetime: string;
  // Campos de transporte
  dua?: string | null;
  pedido?: string | null;
  driver?: string | null;
  truckPlate?: string | null;
  invoice?: string | null;
  purchaseOrder?: string | null;
  cargoOrigin?: string | null;
  // Proveedor / cliente
  providerName?: string | null;
  clientName?: string | null;
  // Estado
  statusName?: string | null;
  statusColor?: string | null;
  // Andén
  dockName?: string | null;
  // Notas
  notes?: string | null;
  // Usuario creador
  createdByName?: string | null;
}

interface ReservationHoverCardProps {
  data: ReservationHoverData;
  disabled?: boolean;
  /** Si true, oculta todos los campos sensibles (proveedor, chofer, matrícula, DUA, factura, OC, pedido, notas, creador) */
  isLimitedAccess?: boolean;
  children: React.ReactNode;
}

const CARD_WIDTH = 300;
const CARD_ESTIMATED_HEIGHT = 380;
const OFFSET = 12;
const OPEN_DELAY = 0;
const CLOSE_DELAY = 80;

export default function ReservationHoverCard({
  data,
  disabled = false,
  isLimitedAccess = false,
  children,
}: ReservationHoverCardProps) {
  const [visible, setVisible] = useState(false);
  const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insideCard = useRef(false);

  useEffect(() => {
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const handleTriggerEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      openTimer.current = setTimeout(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const goLeft = rect.right + CARD_WIDTH + OFFSET > vw;
        const goUp = rect.bottom + CARD_ESTIMATED_HEIGHT + OFFSET > vh;
        const left = goLeft ? rect.left - CARD_WIDTH - OFFSET : rect.right + OFFSET;
        const top = goUp ? Math.max(8, rect.bottom - CARD_ESTIMATED_HEIGHT) : rect.top;
        setCardPos({ top, left });
        setVisible(true);
      }, OPEN_DELAY);
    },
    [data.id, disabled]
  );

  const handleTriggerLeave = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => {
      if (!insideCard.current) setVisible(false);
    }, CLOSE_DELAY);
  }, [data.id]);

  const handleTriggerMove = useCallback(() => {}, [data.id]);

  const handleCardEnter = useCallback(() => {
    insideCard.current = true;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const handleCardLeave = useCallback(() => {
    insideCard.current = false;
    closeTimer.current = setTimeout(() => setVisible(false), CLOSE_DELAY);
  }, []);

  const formatTime = (dt: string) =>
    new Date(dt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const shortId = data.id.slice(0, 8).toUpperCase();

  // ── Filas dinámicas ─────────────────────────────────────────────────────
  // Cada entrada: { icon, label, value, sensitive }
  // sensitive=true → se oculta cuando isLimitedAccess=true
  // Solo se renderiza si value es truthy (no vacío, no null, no undefined)
  const allRows: Array<{ icon: string; label: string; value: string; sensitive?: boolean }> = [
    { icon: 'ri-map-pin-line', label: 'Andén', value: data.dockName ?? '' },
    { icon: 'ri-building-2-line', label: 'Proveedor', value: data.providerName ?? '', sensitive: true },
    { icon: 'ri-user-3-line', label: 'Cliente', value: data.clientName ?? '', sensitive: true },
    { icon: 'ri-steering-2-line', label: 'Chofer', value: data.driver ?? '', sensitive: true },
    { icon: 'ri-car-line', label: 'Matrícula', value: data.truckPlate ?? '', sensitive: true },
    { icon: 'ri-map-2-line', label: 'Origen', value: data.cargoOrigin ?? '' },
    { icon: 'ri-file-list-3-line', label: 'DUA', value: data.dua ?? '', sensitive: true },
    { icon: 'ri-receipt-line', label: 'Factura', value: data.invoice ?? '', sensitive: true },
    { icon: 'ri-shopping-bag-3-line', label: 'Orden de compra', value: data.purchaseOrder ?? '', sensitive: true },
    { icon: 'ri-hashtag', label: 'Pedido', value: data.pedido ?? '', sensitive: true },
  ];

  const rows = allRows.filter((row) => {
    if (!row.value.trim()) return false;
    if (isLimitedAccess && row.sensitive) return false;
    return true;
  });

  const card = visible ? (
    <div
      onMouseEnter={handleCardEnter}
      onMouseLeave={handleCardLeave}
      style={{
        position: 'fixed',
        top: cardPos.top,
        left: cardPos.left,
        width: CARD_WIDTH,
        zIndex: 99999,
        pointerEvents: 'auto',
      }}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        style={{
          boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
          animation: 'hoverCardIn 0.12s ease-out forwards',
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            backgroundColor: `${data.statusColor ?? '#6b7280'}15`,
            borderBottom: `3px solid ${data.statusColor ?? '#6b7280'}`,
          }}
        >
          <span className="text-[10px] font-mono font-bold text-gray-400 tracking-widest">
            #{shortId}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white whitespace-nowrap"
            style={{ backgroundColor: data.statusColor ?? '#6b7280' }}
          >
            {data.statusName ?? 'Sin estado'}
          </span>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-1.5">
          {/* Hora — siempre visible */}
          <div className="flex items-center gap-2 pb-1.5 border-b border-gray-100 mb-1">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <i className="ri-time-line text-gray-400 text-xs" />
            </div>
            <span className="text-xs font-semibold text-gray-800">
              {formatTime(data.startDatetime)} — {formatTime(data.endDatetime)}
            </span>
          </div>

          {/* Filas dinámicas */}
          {rows.map((row) => (
            <div key={row.label} className="flex items-start gap-2">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className={`${row.icon} text-gray-400 text-xs`} />
              </div>
              <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                  {row.label}:
                </span>
                <span className="text-xs text-gray-700 truncate">{row.value}</span>
              </div>
            </div>
          ))}

          {/* Notas — ocultas en modo restringido */}
          {!isLimitedAccess && data.notes && data.notes.trim() !== '' && (
            <div className="flex items-start gap-2 pt-1.5 border-t border-gray-100 mt-1">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className="ri-sticky-note-line text-gray-400 text-xs" />
              </div>
              <span className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                {data.notes}
              </span>
            </div>
          )}

          {/* Banner de acceso limitado */}
          {isLimitedAccess && (
            <div className="flex items-center gap-1.5 pt-1.5 border-t border-amber-100 mt-1">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <i className="ri-eye-off-line text-amber-400 text-xs" />
              </div>
              <span className="text-[10px] text-amber-600 leading-relaxed">
                Información limitada — solo datos básicos visibles
              </span>
            </div>
          )}
        </div>

        {/* Footer — creado por + hint */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
          {/* Creador — oculto en modo restringido */}
          {!isLimitedAccess && data.createdByName ? (
            <span className="text-[10px] text-gray-500 truncate">
              <span className="text-gray-400">Creado por:</span>{' '}
              <span className="font-medium text-gray-600">{data.createdByName}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
            Click para detalle
          </span>
        </div>
      </div>
    </div>
  ) : null;

  const child = Children.only(children);
  if (!isValidElement(child)) return <>{children}</>;

  const enhancedChild = cloneElement(child as React.ReactElement<any>, {
    onMouseEnter: handleTriggerEnter,
    onMouseLeave: handleTriggerLeave,
    onMouseMove: handleTriggerMove,
  });

  return (
    <>
      {enhancedChild}
      {card && createPortal(card, document.body)}
    </>
  );
}
