import { useEffect, useState } from 'react';
import { getGateDetail, type GateDetail } from '../../../services/proceso3dService';
import PhotoStrip from './PhotoStrip';

/**
 * Chofer y fotos registradas en el Punto de Control (IN / OUT) para la cita seleccionada,
 * más las fotos que AppOLO registró en la recepción, si las envía.
 * Se consulta al seleccionar el camión (solo lectura).
 */
export default function GateEvidence({
  orgId,
  reservationId,
  fmt,
  appoloPhotos,
  refreshKey,
}: {
  orgId: string;
  reservationId: string;
  fmt: (iso?: string | null) => string;
  appoloPhotos?: string[];
  /** Cambia cuando la casetilla registra algo nuevo (p. ej. la hora de salida) */
  refreshKey?: string;
}) {
  const [detail, setDetail] = useState<GateDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    getGateDetail(orgId, reservationId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setState('ok');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [orgId, reservationId, refreshKey]);

  const ing = detail?.ingreso;
  const sal = detail?.salida;
  const appolo = appoloPhotos ?? [];

  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-3">
      <p className="mb-2 text-xs font-semibold text-gray-900">
        <i className="ri-shield-user-line mr-1"></i>Chofer y fotos
      </p>
      {state === 'loading' && !detail && (
        <p className="text-xs text-gray-400">
          <i className="ri-loader-4-line mr-1 inline-block animate-spin"></i>Cargando registro de casetilla…
        </p>
      )}
      {state === 'error' && <p className="text-xs text-red-600">No se pudo leer el registro de casetilla.</p>}
      {state !== 'error' && detail && !ing && !sal && appolo.length === 0 && (
        <p className="text-xs text-gray-500">Todavía no tiene ingreso registrado en casetilla.</p>
      )}

      {ing && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-500">Chofer</dt>
          <dd className="font-medium text-gray-900 break-words">{ing.chofer || '—'}</dd>
          {ing.cedula && (
            <>
              <dt className="text-gray-500">Cédula</dt>
              <dd className="font-medium text-gray-900">{ing.cedula}</dd>
            </>
          )}
          <dt className="text-gray-500">Placa (IN)</dt>
          <dd className="font-medium text-gray-900">{ing.matricula || '—'}</dd>
          <dt className="text-gray-500">Ingreso</dt>
          <dd className="font-medium text-gray-900">{fmt(ing.at)}</dd>
          {sal && sal.chofer && sal.chofer !== ing.chofer && (
            <>
              <dt className="text-gray-500">Chofer (OUT)</dt>
              <dd className="font-medium text-gray-900 break-words">{sal.chofer}</dd>
            </>
          )}
          {ing.observaciones && (
            <>
              <dt className="text-gray-500">Observaciones</dt>
              <dd className="text-gray-700 break-words">{ing.observaciones}</dd>
            </>
          )}
        </dl>
      )}

      <div className="mt-2 flex flex-col gap-2">
        {ing && (
          ing.fotos.length > 0 ? (
            <PhotoStrip label="Fotos de ingreso (IN)" icon="ri-login-box-line text-green-600" photos={ing.fotos} />
          ) : (
            <p className="text-[11px] text-gray-400">Sin fotos en el ingreso.</p>
          )
        )}
        {sal && sal.fotos.length > 0 && <PhotoStrip label="Fotos de salida (OUT)" icon="ri-logout-box-line text-red-600" photos={sal.fotos} />}
        {appolo.length > 0 && <PhotoStrip label="Fotos de AppOLO (recepción)" icon="ri-stack-line text-blue-600" photos={appolo} />}
      </div>
    </div>
  );
}
