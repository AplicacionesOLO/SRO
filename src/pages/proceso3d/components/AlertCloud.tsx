import { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import './alertCloud.css';
import { alertLevel, formatElapsed, type TruckAlert } from '../lib/alerts';

/** Reloj que avanza cada segundo (solo en tiempo real). */
function useTicker(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

/**
 * Nube de alerta sobre un camión con el contador de espera.
 * `clock` = null → tiempo real (avanza cada segundo); número → hora simulada del recorrido.
 */
export default function AlertCloud({ alert, clock, y = 7.2 }: { alert: TruckAlert; clock: number | null; y?: number }) {
  const live = useTicker(clock === null);
  const elapsed = (clock ?? live) - alert.since;
  const level = alertLevel(elapsed);
  if (!level) return null;
  return (
    <Html position={[0, y, 0]} center distanceFactor={55} zIndexRange={[40, 20]} style={{ pointerEvents: 'none' }}>
      <div className={`p3d-cloud p3d-cloud--${level}`}>
        <span className="p3d-cloud__puff p3d-cloud__puff--a" />
        <span className="p3d-cloud__puff p3d-cloud__puff--b" />
        <span className="p3d-cloud__puff p3d-cloud__puff--c" />
        <span className="p3d-cloud__body">
          <span className="p3d-cloud__label">
            <i className={level === 'red' ? 'ri-alarm-warning-fill' : 'ri-time-line'}></i> {alert.label}
          </span>
          <span className="p3d-cloud__time">{formatElapsed(elapsed)}</span>
        </span>
        <span className="p3d-cloud__dot p3d-cloud__dot--1" />
        <span className="p3d-cloud__dot p3d-cloud__dot--2" />
      </div>
    </Html>
  );
}
