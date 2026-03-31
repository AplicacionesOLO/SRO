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
  dua?: string | null;
  pedido?: string | null;
  driver?: string | null;
  notes?: string | null;
  statusName?: string | null;
  statusColor?: string | null;
  dockName?: string | null;
  providerName?: string | null;
}

interface ReservationHoverCardProps {
  data: ReservationHoverData;
  disabled?: boolean;
  children: React.ReactNode;
}

const CARD_WIDTH = 280;
const CARD_ESTIMATED_HEIGHT = 300;
const OFFSET = 12;
// DEBUG: delay en 0 para diagnóstico. Subir a 150 cuando esté confirmado.
const OPEN_DELAY = 0;
const CLOSE_DELAY = 80;

export default function ReservationHoverCard({
  data,
  disabled = false,
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

  // ── Handlers del trigger ────────────────────────────────────────────────
  // getBoundingClientRect() se llama ANTES del timeout para capturar el rect
  // mientras el elemento está bajo el cursor (luego el currentTarget es null).
  const handleTriggerEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      console.log('[RESERVA REAL] enter', data.id);
      if (disabled) return;

      // Capturar rect sincrónicamente ANTES de que se ejecute el timeout
      const rect = e.currentTarget.getBoundingClientRect();
      console.log('[HoverCard] rect calculado:', {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });

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

        console.log('[HoverCard] setVisible(true):', { top, left, goLeft, goUp });
        setCardPos({ top, left });
        setVisible(true);
      }, OPEN_DELAY);
    },
    [data.id, disabled]
  );

  const handleTriggerLeave = useCallback(() => {
    console.log('[RESERVA REAL] leave', data.id);
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => {
      if (!insideCard.current) {
        console.log('[HoverCard] setVisible(false)');
        setVisible(false);
      }
    }, CLOSE_DELAY);
  }, [data.id]);

  const handleTriggerMove = useCallback(() => {
    console.log('[RESERVA REAL] move', data.id);
  }, [data.id]);

  // ── Handlers de la tarjeta flotante ────────────────────────────────────
  const handleCardEnter = useCallback(() => {
    insideCard.current = true;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const handleCardLeave = useCallback(() => {
    insideCard.current = false;
    closeTimer.current = setTimeout(() => {
      setVisible(false);
    }, CLOSE_DELAY);
  }, []);

  // ── Helpers de presentación ─────────────────────────────────────────────
  const formatTime = (dt: string) =>
    new Date(dt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const shortId = data.id.slice(0, 8).toUpperCase();

  // ── Tarjeta flotante ────────────────────────────────────────────────────
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
        <div className="px-4 py-3 space-y-2">
          {/* Hora */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className="ri-time-line text-gray-400 text-sm" />
            </div>
            <span className="text-xs font-semibold text-gray-800">
              {formatTime(data.startDatetime)} — {formatTime(data.endDatetime)}
            </span>
          </div>

          {/* Andén */}
          {data.dockName && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-map-pin-line text-gray-400 text-sm" />
              </div>
              <span className="text-xs text-gray-700 truncate">{data.dockName}</span>
            </div>
          )}

          {/* Proveedor */}
          {data.providerName && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-truck-line text-gray-400 text-sm" />
              </div>
              <span className="text-xs text-gray-700 truncate">{data.providerName}</span>
            </div>
          )}

          {/* Chofer */}
          {data.driver && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-steering-2-line text-gray-400 text-sm" />
              </div>
              <span className="text-xs text-gray-700 truncate">{data.driver}</span>
            </div>
          )}

          {/* DUA */}
          {data.dua && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-file-list-3-line text-gray-400 text-sm" />
              </div>
              <span className="text-xs text-gray-700 truncate">DUA: {data.dua}</span>
            </div>
          )}

          {/* Pedido */}
          {data.pedido && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-receipt-line text-gray-400 text-sm" />
              </div>
              <span className="text-xs text-gray-700 truncate">Pedido: {data.pedido}</span>
            </div>
          )}

          {/* Notas */}
          {data.notes && (
            <div className="flex items-start gap-2 pt-2 border-t border-gray-100 mt-1">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className="ri-sticky-note-line text-gray-400 text-sm" />
              </div>
              <span className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                {data.notes}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <span className="text-[10px] text-gray-400">Click para ver detalle completo</span>
        </div>
      </div>
    </div>
  ) : null;

  // ── Clonar el child e inyectar los handlers directamente ────────────────
  // Esto garantiza que los eventos van al nodo DOM real sin wrapper adicional.
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
