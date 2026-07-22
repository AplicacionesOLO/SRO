import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Resumen {
  total_procesadas: number;
  grupo_a_ok: string;
  grupo_b_ok: string;
  grupo_c_pendientes: number;
  total_errores: number;
  despachado_actual: number;
}

interface GrupoReport {
  total: number;
  procesados: number;
  errores_count: number;
  ultimos_detalles: string[];
  primeros_errores: string[];
}

interface Resultado {
  success: boolean;
  message: string;
  resumen: Resumen;
  grupo_a: GrupoReport;
  grupo_b: GrupoReport;
}

export default function MigracionPage() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ejecutarMigracion = async () => {
    const confirmado = window.confirm(
      'CONFIRMACION DE SEGURIDAD\n\n' +
      'Esta operacion:\n' +
      '- Grupo A (660): Cambiara estado Finalizada → Despachado\n' +
      '- Grupo B (76): Creara registro de salida + cambiara estado Finalizada → Despachado\n' +
      '- Grupo C (685): NO se tocara, quedan como Finalizada\n\n' +
      'La fecha de salida (exit_at) usara reservation.updated_at como referencia.\n\n' +
      '¿Deseas continuar?'
    );

    if (!confirmado) return;

    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'migrate-finalizada-to-despachado',
        {
          body: { safety_token: 'MIGRAR-FINALIZADA-2026' },
        }
      );

      if (fnError) {
        setError(`Error al invocar: ${fnError.message}`);
        return;
      }

      setResultado(data as Resultado);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Excepcion: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground-950 mb-2">
            Migracion: Finalizada → Despachado
          </h1>
          <p className="text-foreground-600">
            Herramienta temporal para migrar reservas en estado &quot;Finalizada&quot; a &quot;Despachado&quot;
          </p>
        </div>

        {/* Panel de accion */}
        <div className="bg-white rounded-lg border border-background-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground-900 mb-4">Resumen antes de ejecutar</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-accent-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-accent-600 mb-1">660</div>
              <div className="text-sm text-foreground-600">Grupo A</div>
              <div className="text-xs text-foreground-500 mt-1">IN + OUT existente</div>
              <div className="text-xs text-accent-600 mt-1">Solo cambio status</div>
            </div>
            <div className="bg-secondary-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-secondary-600 mb-1">76</div>
              <div className="text-sm text-foreground-600">Grupo B</div>
              <div className="text-xs text-foreground-500 mt-1">Con IN, sin OUT</div>
              <div className="text-xs text-secondary-600 mt-1">Crear OUT + status</div>
            </div>
            <div className="bg-background-100 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-foreground-400 mb-1">685</div>
              <div className="text-sm text-foreground-600">Grupo C</div>
              <div className="text-xs text-foreground-500 mt-1">Sin IN ni OUT</div>
              <div className="text-xs text-foreground-400 mt-1">NO se procesa</div>
            </div>
          </div>

          <button
            onClick={ejecutarMigracion}
            disabled={loading}
            className={`w-full py-3 rounded-lg font-semibold text-white transition-colors whitespace-nowrap ${
              loading
                ? 'bg-foreground-300 cursor-not-allowed'
                : 'bg-primary-500 hover:bg-primary-600'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin w-5 h-5 flex items-center justify-center"></i>
                Ejecutando migracion...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-play-circle-line w-5 h-5 flex items-center justify-center"></i>
                Ejecutar Migracion (Grupos A + B)
              </span>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <i className="ri-error-warning-line text-red-600 text-xl w-6 h-6 flex items-center justify-center"></i>
              <h3 className="text-lg font-semibold text-red-800">Error</h3>
            </div>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div className="space-y-6">
            {/* Resumen */}
            <div className={`rounded-lg border p-6 ${resultado.success ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-3 mb-4">
                <i className={`text-xl w-6 h-6 flex items-center justify-center ${resultado.success ? 'ri-checkbox-circle-line text-green-600' : 'ri-alert-line text-amber-600'}`}></i>
                <h3 className="text-lg font-semibold text-foreground-900">
                  {resultado.success ? 'Migracion completada exitosamente' : 'Migracion completada con advertencias'}
                </h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-primary-600">{resultado.resumen.total_procesadas}</div>
                  <div className="text-xs text-foreground-500">Total procesadas</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-accent-600">{resultado.resumen.grupo_a_ok}</div>
                  <div className="text-xs text-foreground-500">Grupo A</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-secondary-600">{resultado.resumen.grupo_b_ok}</div>
                  <div className="text-xs text-foreground-500">Grupo B</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-foreground-400">{resultado.resumen.grupo_c_pendientes}</div>
                  <div className="text-xs text-foreground-500">Grupo C pendientes</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <span className="text-foreground-600">
                  <strong className="text-foreground-900">Despachado actual:</strong> {resultado.resumen.despachado_actual}
                </span>
                <span className={`font-semibold ${resultado.resumen.total_errores > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  Errores: {resultado.resumen.total_errores}
                </span>
              </div>
            </div>

            {/* Detalle Grupo A */}
            <div className="bg-white rounded-lg border border-background-200 p-6">
              <h3 className="text-lg font-semibold text-foreground-900 mb-4 flex items-center gap-2">
                <i className="ri-check-line text-green-600 w-5 h-5 flex items-center justify-center"></i>
                Grupo A: {resultado.grupo_a.procesados}/{resultado.grupo_a.total}
              </h3>
              {resultado.grupo_a.ultimos_detalles.length > 0 && (
                <div className="bg-background-50 rounded-lg p-3 mb-3">
                  {resultado.grupo_a.ultimos_detalles.map((d, i) => (
                    <p key={i} className="text-sm text-foreground-600">{d}</p>
                  ))}
                </div>
              )}
              {resultado.grupo_a.primeros_errores.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-700 mb-1">Errores:</p>
                  {resultado.grupo_a.primeros_errores.map((e, i) => (
                    <p key={i} className="text-sm text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Detalle Grupo B */}
            <div className="bg-white rounded-lg border border-background-200 p-6">
              <h3 className="text-lg font-semibold text-foreground-900 mb-4 flex items-center gap-2">
                <i className="ri-check-line text-green-600 w-5 h-5 flex items-center justify-center"></i>
                Grupo B: {resultado.grupo_b.procesados}/{resultado.grupo_b.total}
              </h3>
              {resultado.grupo_b.ultimos_detalles.length > 0 && (
                <div className="bg-background-50 rounded-lg p-3 mb-3">
                  {resultado.grupo_b.ultimos_detalles.map((d, i) => (
                    <p key={i} className="text-sm text-foreground-600">{d}</p>
                  ))}
                </div>
              )}
              {resultado.grupo_b.primeros_errores.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-700 mb-1">Errores:</p>
                  {resultado.grupo_b.primeros_errores.map((e, i) => (
                    <p key={i} className="text-sm text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}