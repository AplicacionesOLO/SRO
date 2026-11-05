import { useCallback, useState } from 'react';

/** Secciones del panel lateral que el usuario puede mostrar, ocultar y reordenar. */
export type PanelKey = 'seleccion' | 'appolo' | 'personal' | 'leyenda';

export const PANEL_META: Record<PanelKey, { label: string; icon: string }> = {
  seleccion: { label: 'Camión / despacho seleccionado', icon: 'ri-truck-line' },
  appolo: { label: 'AppOLO · despachos y acomodo', icon: 'ri-stack-line' },
  personal: { label: 'Personal por hora', icon: 'ri-team-line' },
  leyenda: { label: 'Leyenda', icon: 'ri-palette-line' },
};

const DEFAULT_ORDER: PanelKey[] = ['seleccion', 'appolo', 'personal', 'leyenda'];
const STORAGE_KEY = 'p3d.panel.v1';

export interface PanelPrefs {
  order: PanelKey[];
  hidden: PanelKey[];
  /** Panel completo visible en la vista normal */
  open: boolean;
  /** Panel visible flotando sobre la escena en pantalla completa */
  openFullscreen: boolean;
}

const DEFAULTS: PanelPrefs = { order: DEFAULT_ORDER, hidden: [], open: true, openFullscreen: false };

function load(): PanelPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<PanelPrefs>;
    const known = (k: unknown): k is PanelKey => typeof k === 'string' && k in PANEL_META;
    // Conserva el orden guardado y agrega al final las secciones nuevas
    const order = [...(p.order ?? []).filter(known), ...DEFAULT_ORDER.filter((k) => !(p.order ?? []).includes(k))];
    return {
      order: [...new Set(order)],
      hidden: (p.hidden ?? []).filter(known),
      open: p.open ?? true,
      openFullscreen: p.openFullscreen ?? false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function usePanelPrefs() {
  const [prefs, setPrefs] = useState<PanelPrefs>(load);

  const update = useCallback((fn: (p: PanelPrefs) => PanelPrefs) => {
    setPrefs((p) => {
      const next = fn(p);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: solo dura la sesión */
      }
      return next;
    });
  }, []);

  const toggle = useCallback(
    (k: PanelKey) => update((p) => ({ ...p, hidden: p.hidden.includes(k) ? p.hidden.filter((h) => h !== k) : [...p.hidden, k] })),
    [update]
  );

  const move = useCallback(
    (k: PanelKey, delta: number) =>
      update((p) => {
        const i = p.order.indexOf(k);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= p.order.length) return p;
        const order = [...p.order];
        [order[i], order[j]] = [order[j], order[i]];
        return { ...p, order };
      }),
    [update]
  );

  const reorder = useCallback(
    (from: PanelKey, to: PanelKey) =>
      update((p) => {
        if (from === to) return p;
        const down = p.order.indexOf(from) < p.order.indexOf(to);
        const order = p.order.filter((k) => k !== from);
        order.splice(order.indexOf(to) + (down ? 1 : 0), 0, from);
        return { ...p, order };
      }),
    [update]
  );

  const setOpen = useCallback((fullscreen: boolean, v: boolean) => update((p) => (fullscreen ? { ...p, openFullscreen: v } : { ...p, open: v })), [update]);

  const reset = useCallback(() => update(() => DEFAULTS), [update]);

  return { prefs, toggle, move, reorder, setOpen, reset };
}
