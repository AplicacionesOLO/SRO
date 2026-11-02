import * as THREE from 'three';

/**
 * Texturas procedurales (se dibujan en un canvas al cargar; no hay archivos externos).
 * Son casi neutras para que el color del material las tiña.
 */
export type TextureKind = 'asphalt' | 'grass' | 'concrete' | 'pavers' | 'dirt' | 'floor' | 'roof' | 'trailer';

const cache = new Map<TextureKind, THREE.CanvasTexture>();

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!] as const;
}

/** Ruido de grano fino: puntos claros y oscuros sobre un fondo. */
function grain(g: CanvasRenderingContext2D, size: number, base: number, amount: number, count: number, seed: number) {
  const r = rng(seed);
  g.fillStyle = `rgb(${base},${base},${base})`;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = Math.max(0, Math.min(255, base + (r() - 0.5) * amount));
    g.fillStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.5})`;
    const s = r() < 0.9 ? 1 : 2;
    g.fillRect(Math.floor(r() * size), Math.floor(r() * size), s, s);
  }
}

/** Manchas grandes y suaves (variación de tono). */
function blotches(g: CanvasRenderingContext2D, size: number, color: (r: () => number) => string, count: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.05 + r() * 0.15);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, color(r));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    // dibujar también desplazado para que la textura se repita sin costuras
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) g.fillRect(x - rad + dx, y - rad + dy, rad * 2, rad * 2);
  }
}

function draw(kind: TextureKind): HTMLCanvasElement {
  switch (kind) {
    case 'asphalt': {
      const [c, g] = canvas(256);
      grain(g, 256, 205, 120, 9000, 3);
      blotches(g, 256, (r) => `rgba(${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},0.05)`, 14, 4);
      return c;
    }
    case 'grass': {
      const [c, g] = canvas(256);
      g.fillStyle = '#e8f0e0';
      g.fillRect(0, 0, 256, 256);
      blotches(g, 256, (r) => (r() < 0.5 ? 'rgba(120,150,60,0.22)' : 'rgba(255,255,220,0.25)'), 26, 7);
      const r = rng(9);
      for (let i = 0; i < 5000; i++) {
        const v = 150 + r() * 105;
        g.strokeStyle = `rgba(${v * 0.85},${v},${v * 0.7},0.45)`;
        const x = r() * 256;
        const y = r() * 256;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 2, y - 2 - r() * 3);
        g.stroke();
      }
      return c;
    }
    case 'concrete': {
      const [c, g] = canvas(256);
      grain(g, 256, 232, 50, 6000, 11);
      blotches(g, 256, () => 'rgba(120,120,120,0.06)', 10, 12);
      // juntas de losa
      g.fillStyle = 'rgba(90,90,90,0.55)';
      g.fillRect(0, 0, 256, 2);
      g.fillRect(0, 0, 2, 256);
      return c;
    }
    case 'floor': {
      const [c, g] = canvas(256);
      grain(g, 256, 240, 30, 3000, 21);
      blotches(g, 256, () => 'rgba(255,255,255,0.12)', 8, 22);
      g.fillStyle = 'rgba(120,120,120,0.35)';
      g.fillRect(0, 0, 256, 1);
      g.fillRect(0, 0, 1, 256);
      return c;
    }
    case 'pavers': {
      const [c, g] = canvas(256);
      const r = rng(31);
      const bw = 32;
      const bh = 16;
      for (let row = 0; row < 256 / bh; row++) {
        for (let col = -1; col < 256 / bw + 1; col++) {
          const off = row % 2 ? bw / 2 : 0;
          const v = 205 + r() * 40;
          g.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`;
          g.fillRect(col * bw + off + 1, row * bh + 1, bw - 2, bh - 2);
        }
      }
      const rr = rng(32);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(0,0,0,${rr() * 0.12})`;
        g.fillRect(Math.floor(rr() * 256), Math.floor(rr() * 256), 1, 1);
      }
      return c;
    }
    case 'dirt': {
      const [c, g] = canvas(256);
      grain(g, 256, 215, 90, 8000, 41);
      blotches(g, 256, (r) => (r() < 0.5 ? 'rgba(90,60,30,0.15)' : 'rgba(255,240,220,0.12)'), 18, 42);
      return c;
    }
    case 'roof': {
      const [c, g] = canvas(128);
      for (let x = 0; x < 128; x++) {
        const v = 215 + Math.cos((x / 128) * Math.PI * 2 * 4) * 25;
        g.fillStyle = `rgb(${v},${v},${v + 3})`;
        g.fillRect(x, 0, 1, 128);
      }
      return c;
    }
    case 'trailer': {
      const [c, g] = canvas(128);
      for (let x = 0; x < 128; x++) {
        const t = (x % 16) / 16;
        const v = t < 0.12 ? 205 : t < 0.2 ? 238 : 250;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, 0, 1, 128);
      }
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, 0, 128, 3);
      g.fillRect(0, 125, 128, 3);
      return c;
    }
  }
}

function base(kind: TextureKind) {
  let t = cache.get(kind);
  if (!t) {
    t = new THREE.CanvasTexture(draw(kind));
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    cache.set(kind, t);
  }
  return t;
}

/** Textura repetida para una superficie de w × d metros (un mosaico cada `tile` metros). */
export function tiledTexture(kind: TextureKind, w: number, d: number, tile: number) {
  const t = base(kind).clone();
  t.repeat.set(Math.max(1, w / tile), Math.max(1, d / tile));
  t.needsUpdate = true;
  return t;
}
