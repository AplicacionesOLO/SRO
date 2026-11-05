import { useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Clave para recordar la posición en este navegador */
  storageKey: string;
  /** Clases de posición cuando el usuario todavía no lo movió (p. ej. "right-3 top-3") */
  defaultPosition: string;
  className?: string;
  children: ReactNode;
}

type Pos = { fx: number; fy: number };

function loadPos(key: string): Pos | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    return Number.isFinite(p.fx) && Number.isFinite(p.fy) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Recuadro flotante que se arrastra desde su agarradera dentro del contenedor posicionado.
 * La posición se guarda como fracción del contenedor, así sirve igual en pantalla completa.
 * Doble clic en la agarradera lo devuelve a su lugar.
 */
export default function FloatingBox({ storageKey, defaultPosition, className = '', children }: Props) {
  const [pos, setPos] = useState<Pos | null>(() => loadPos(storageKey));
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const save = (p: Pos | null) => {
    try {
      if (p) localStorage.setItem(storageKey, JSON.stringify(p));
      else localStorage.removeItem(storageKey);
    } catch {
      /* sin almacenamiento */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const box = boxRef.current;
    const parent = box?.offsetParent as HTMLElement | null;
    if (!drag.current || !box || !parent) return;
    const pr = parent.getBoundingClientRect();
    const maxX = Math.max(0, pr.width - box.offsetWidth);
    const maxY = Math.max(0, pr.height - box.offsetHeight);
    const x = Math.min(maxX, Math.max(0, e.clientX - pr.left - drag.current.dx));
    const y = Math.min(maxY, Math.max(0, e.clientY - pr.top - drag.current.dy));
    setPos({ fx: pr.width ? x / pr.width : 0, fy: pr.height ? y / pr.height : 0 });
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setPos((p) => {
      save(p);
      return p;
    });
  };

  return (
    <div
      ref={boxRef}
      className={`absolute z-20 ${pos ? '' : defaultPosition} ${className}`}
      style={pos ? { left: `${pos.fx * 100}%`, top: `${pos.fy * 100}%` } : undefined}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          setPos(null);
          save(null);
        }}
        className="flex h-3.5 cursor-move touch-none items-center justify-center rounded-t-md bg-gray-200/90 text-gray-500 hover:bg-gray-300"
        title="Arrastrar para mover · doble clic para volver a su lugar"
      >
        <i className="ri-draggable rotate-90 text-[11px] leading-none"></i>
      </div>
      {children}
    </div>
  );
}
