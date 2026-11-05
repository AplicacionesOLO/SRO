import { useMemo, useState } from 'react';
import type { AppoloPersona, AppoloPersonal } from '../../../services/appoloOpsService';

/**
 * Personal marcado hoy en el reloj BIT2 (vía AppOLO): activos (en sitio y en pausa) y los que
 * ya salieron, agrupados gerente → coordinador → colaboradores.
 */

type Tab = 'activos' | 'salieron';

const ESTADO_META: Record<AppoloPersona['estado'], { label: string; dot: string }> = {
  en_sitio: { label: 'En sitio', dot: 'bg-green-500' },
  pausa: { label: 'En pausa', dot: 'bg-amber-400' },
  salio: { label: 'Salió', dot: 'bg-gray-400' },
};

function hhmm(iso: string | null) {
  if (!iso) return '—';
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '—';
}

function since(iso: string | null, now: number) {
  if (!iso) return '';
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function PersonRow({ p, now }: { p: AppoloPersona; now: number }) {
  const meta = ESTADO_META[p.estado];
  return (
    <li className="flex items-start gap-2 py-1">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label}></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-medium text-gray-900">
          <span className="truncate">{p.nombre}</span>
          {p.escala === 'coordinador' && <span className="rounded bg-indigo-100 px-1 text-[9px] font-semibold text-indigo-700">COORD.</span>}
          {p.escala === 'gerente' && <span className="rounded bg-purple-100 px-1 text-[9px] font-semibold text-purple-700">GERENTE</span>}
          {p.tarde && (
            <span className="rounded bg-red-50 px-1 text-[9px] font-semibold text-[#b42318]" title={`Horario de entrada ${p.horario.entrada ?? '—'}`}>
              TARDE
            </span>
          )}
        </p>
        <p className="truncate text-[10px] text-gray-500">
          {p.puesto ?? 'Sin puesto'}
          {' · '}
          {p.estado === 'salio'
            ? `${hhmm(p.entrada)} – ${hhmm(p.salida)}`
            : `desde ${hhmm(p.entrada)}${p.estado === 'en_sitio' ? ` (${since(p.entrada, now)})` : ' · en pausa'}`}
        </p>
        {p.marcas.length > 0 && <p className="truncate text-[10px] tabular-nums text-gray-400">Marcas: {p.marcas.join(' · ')}</p>}
      </div>
    </li>
  );
}

export default function PersonnelPanel({
  data,
  error,
  loading,
  now,
}: {
  data: AppoloPersonal | { disponible: false } | null;
  error: string | null;
  loading: boolean;
  now: number;
}) {
  const [tab, setTab] = useState<Tab>('activos');
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    if (!data || !data.disponible) return [];
    const q = query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const norm = (s: string | null) =>
      (s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
    const list = data.personas.filter(
      (p) =>
        (tab === 'activos' ? p.estado !== 'salio' : p.estado === 'salio') &&
        (!q || norm(p.nombre).includes(q) || norm(p.puesto).includes(q) || norm(p.coordinador).includes(q))
    );
    // gerente → coordinador → personas (el coordinador encabeza su grupo)
    const byManager = new Map<string, Map<string, AppoloPersona[]>>();
    for (const p of list) {
      const coord = p.escala === 'coordinador' ? p.nombre : p.coordinador;
      const m = byManager.get(p.gerente) ?? new Map<string, AppoloPersona[]>();
      const arr = m.get(coord) ?? [];
      arr.push(p);
      m.set(coord, arr);
      byManager.set(p.gerente, m);
    }
    const rank = { gerente: 0, coordinador: 1, colaborador: 2 } as const;
    return [...byManager.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([gerente, coords]) => ({
        gerente,
        total: [...coords.values()].reduce((s, a) => s + a.length, 0),
        coords: [...coords.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], 'es'))
          .map(([coordinador, people]) => ({
            coordinador,
            people: people.sort((a, b) => rank[a.escala] - rank[b.escala] || a.nombre.localeCompare(b.nombre, 'es')),
          })),
      }));
  }, [data, tab, query]);

  const toggle = (k: string) =>
    setClosed((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            <i className="ri-fingerprint-line mr-1"></i>Personal en sitio
          </h2>
          <p className="text-[11px] text-gray-500">Reloj marcador BIT2 · hoy</p>
        </div>
        {loading && <i className="ri-loader-4-line inline-block animate-spin text-gray-400"></i>}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-gray-500">{error}.</p>
      ) : !data ? (
        <p className="mt-2 text-xs text-gray-400">Consultando AppOLO…</p>
      ) : !data.disponible ? (
        <p className="mt-2 text-xs text-gray-500">Este almacén no tiene reloj marcador conectado (solo OLO).</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            {(
              [
                ['En sitio', data.resumen.en_sitio, 'text-green-700'],
                ['En pausa', data.resumen.en_pausa, 'text-amber-700'],
                ['Salieron', data.resumen.salieron, 'text-gray-600'],
              ] as const
            ).map(([label, n, cls]) => (
              <div key={label} className="rounded-md bg-gray-50 px-1 py-1.5">
                <p className={`text-lg font-bold leading-none tabular-nums ${cls}`}>{n}</p>
                <p className="mt-0.5 text-[10px] text-gray-500">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-gray-500">
            {data.resumen.por_escala.coordinador} coordinadores · {data.resumen.por_escala.colaborador} colaboradores
            {data.resumen.por_escala.gerente > 0 ? ` · ${data.resumen.por_escala.gerente} gerentes` : ''} marcaron hoy
          </p>
          <p
            className={`mt-1.5 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${
              data.desactualizado ? 'bg-amber-50 font-medium text-amber-800' : 'bg-gray-50 text-gray-600'
            }`}
          >
            <i className={data.desactualizado ? 'ri-error-warning-line' : 'ri-time-line'}></i>
            Marcas hasta {hhmm(data.marcas_hasta)}
            {data.desactualizado && ' · el reloj se descarga a mano: puede ir atrasado'}
          </p>

          <div className="mt-2 flex items-center gap-1">
            {(['activos', 'salieron'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2 py-1 text-xs font-medium cursor-pointer ${tab === t ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {t === 'activos' ? `Activos (${data.resumen.en_sitio + data.resumen.en_pausa})` : `Salieron (${data.resumen.salieron})`}
              </button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nombre o puesto"
              className="ml-auto h-7 w-36 min-w-0 rounded-md border border-gray-300 px-2 text-xs"
            />
          </div>

          <div className="mt-2 max-h-[420px] overflow-y-auto pr-1">
            {groups.length === 0 ? (
              <p className="py-2 text-xs text-gray-400">Nadie en esta lista.</p>
            ) : (
              groups.map((g) => (
                <div key={g.gerente} className="mb-2">
                  <p className="sticky top-0 z-10 flex items-center justify-between bg-white py-1 text-[11px] font-semibold text-gray-700">
                    <span className="truncate">
                      <i className="ri-user-star-line mr-1 text-purple-600"></i>Gerente: {g.gerente}
                    </span>
                    <span className="tabular-nums text-gray-400">{g.total}</span>
                  </p>
                  {g.coords.map((c) => {
                    const key = `${g.gerente}|${c.coordinador}`;
                    const open = !closed.has(key);
                    return (
                      <div key={key} className="ml-2 border-l border-gray-200 pl-2">
                        <button
                          onClick={() => toggle(key)}
                          className="flex w-full items-center justify-between py-0.5 text-left text-[11px] font-medium text-indigo-700 cursor-pointer"
                        >
                          <span className="truncate">
                            <i className={`${open ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} mr-0.5`}></i>
                            {c.coordinador}
                          </span>
                          <span className="tabular-nums text-gray-400">{c.people.length}</span>
                        </button>
                        {open && (
                          <ul className="ml-1">
                            {c.people.map((p) => (
                              <PersonRow key={p.id} p={p} now={now} />
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
