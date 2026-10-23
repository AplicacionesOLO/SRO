import { useState } from 'react';
import { SUPABASE_URL } from '@/lib/supabase';
import { checkBackendReachability } from '@/utils/authErrors';

type DiagState = 'idle' | 'checking' | 'ok' | 'fail';

export default function ConnectionDiagnostic() {
  const [state, setState] = useState<DiagState>('idle');
  const [detail, setDetail] = useState('');

  const host = (SUPABASE_URL || '').replace(/^https?:\/\//, '');

  const runCheck = async () => {
    setState('checking');
    setDetail('');
    const result = await checkBackendReachability(SUPABASE_URL);
    setDetail(result.detail);
    setState(result.ok ? 'ok' : 'fail');
  };

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Diagnóstico de conexión
          </div>
          <div className="mt-1 font-mono text-[11px] text-white/50 truncate">{host || 'sin configurar'}</div>
        </div>
        <button
          type="button"
          onClick={runCheck}
          disabled={state === 'checking'}
          className="flex-shrink-0 h-8 px-3 rounded-lg bg-white/[0.08] border border-white/10 text-white/70 text-xs font-medium hover:bg-white/[0.14] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
        >
          {state === 'checking' ? (
            <>
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Probando...
            </>
          ) : (
            <>
              <i className="ri-wifi-line w-3.5 h-3.5 flex items-center justify-center" />
              Probar conexión
            </>
          )}
        </button>
      </div>

      {state !== 'idle' && state !== 'checking' && (
        <div className="mt-3">
          <div
            className={`flex items-start gap-2 text-xs leading-relaxed ${
              state === 'ok' ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            <i
              className={`${
                state === 'ok' ? 'ri-checkbox-circle-line' : 'ri-alert-line'
              } w-4 h-4 flex items-center justify-center flex-shrink-0 mt-px`}
            />
            <span>{detail}</span>
          </div>

          {state === 'fail' && (
            <ul className="mt-2.5 space-y-1 text-[11px] text-white/45 leading-relaxed">
              <li className="flex gap-1.5">
                <span className="text-white/25">1.</span>
                Probá con datos móviles (no el WiFi de la empresa).
              </li>
              <li className="flex gap-1.5">
                <span className="text-white/25">2.</span>
                Conectate con un VPN y volvé a intentar.
              </li>
              <li className="flex gap-1.5">
                <span className="text-white/25">3.</span>
                Cambiá el DNS del equipo a 1.1.1.1 o 8.8.8.8.
              </li>
              <li className="flex gap-1.5">
                <span className="text-white/25">4.</span>
                Si nada funciona, pasale este resultado al administrador.
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}