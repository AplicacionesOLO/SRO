import { useEffect, useRef, useState } from 'react';
import { PANEL_META, type PanelKey, type PanelPrefs } from '../lib/panelPrefs';

interface Props {
  prefs: PanelPrefs;
  onToggle: (k: PanelKey) => void;
  onMove: (k: PanelKey, delta: number) => void;
  onReorder: (from: PanelKey, to: PanelKey) => void;
  onReset: () => void;
  onClose: () => void;
  /** Secciones que este usuario puede ver (las demás no se listan) */
  available?: PanelKey[];
}

/**
 * Encabezado del panel lateral: elegir qué secciones se ven y en qué orden
 * (arrastrar o con las flechas). Las preferencias quedan en este navegador.
 */
export default function PanelSettings({ prefs, onToggle, onMove, onReorder, onReset, onClose, available }: Props) {
  const [open, setOpen] = useState(false);
  const [dragKey, setDragKey] = useState<PanelKey | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const keys = available ? prefs.order.filter((k) => available.includes(k)) : prefs.order;
  const hiddenCount = prefs.hidden.filter((k) => keys.includes(k)).length;

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
        <span className="text-xs font-semibold text-gray-700">
          <i className="ri-layout-right-line mr-1"></i>Panel
          {hiddenCount > 0 && <span className="ml-1 font-normal text-gray-400">· {hiddenCount} oculta{hiddenCount > 1 ? 's' : ''}</span>}
        </span>
        <span className="flex items-center gap-1">
          <button
            onClick={() => setOpen((v) => !v)}
            className={`rounded-md px-2 py-0.5 text-xs font-medium cursor-pointer ${open ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            title="Elegir qué secciones mostrar y su orden"
          >
            <i className="ri-settings-3-line mr-1"></i>Secciones
          </button>
          <button onClick={onClose} className="rounded-md px-1.5 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer" title="Ocultar el panel">
            <i className="ri-arrow-right-s-line"></i>
          </button>
        </span>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <p className="mb-1.5 px-1 text-[11px] text-gray-500">Marcá lo que querés ver. Arrastrá o usá las flechas para elegir el orden.</p>
          <ul className="flex flex-col gap-1">
            {keys.map((k) => {
              const i = prefs.order.indexOf(k);
              const visible = !prefs.hidden.includes(k);
              return (
                <li
                  key={k}
                  draggable
                  onDragStart={(e) => {
                    setDragKey(k);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!dragKey) return;
                    e.preventDefault();
                    if (dragKey !== k) onReorder(dragKey, k);
                  }}
                  onDragEnd={() => setDragKey(null)}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                    dragKey === k ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <i className="ri-draggable cursor-grab text-gray-400"></i>
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={visible} onChange={() => onToggle(k)} className="accent-teal-600" />
                    <i className={`${PANEL_META[k].icon} ${visible ? 'text-gray-600' : 'text-gray-300'}`}></i>
                    <span className={`truncate ${visible ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{PANEL_META[k].label}</span>
                  </label>
                  <button
                    onClick={() => onMove(k, -1)}
                    disabled={i === 0}
                    className="rounded px-1 text-gray-500 hover:bg-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    title="Subir"
                  >
                    <i className="ri-arrow-up-s-line"></i>
                  </button>
                  <button
                    onClick={() => onMove(k, 1)}
                    disabled={i === prefs.order.length - 1}
                    className="rounded px-1 text-gray-500 hover:bg-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    title="Bajar"
                  >
                    <i className="ri-arrow-down-s-line"></i>
                  </button>
                </li>
              );
            })}
          </ul>
          <button onClick={onReset} className="mt-2 w-full rounded-md px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100 cursor-pointer">
            Restablecer orden y secciones
          </button>
        </div>
      )}
    </div>
  );
}
