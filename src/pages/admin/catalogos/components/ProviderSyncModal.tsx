import { useState, useEffect, useCallback } from 'react';
import { providersService, type SyncProviderPayload } from '../../../../services/providersService';
import { clientsService } from '../../../../services/clientsService';

interface ProviderSyncModalProps {
  orgId: string;
  onClose: () => void;
  onSyncDone: () => void;
}

type Step = 'input' | 'preview' | 'syncing' | 'result';

export default function ProviderSyncModal({ orgId, onClose, onSyncDone }: ProviderSyncModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState('');
  const [source, setSource] = useState('');
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [parsedProviders, setParsedProviders] = useState<SyncProviderPayload[]>([]);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncError, setSyncError] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Clientes disponibles
  useEffect(() => {
    clientsService.listClients(orgId)
      .then(data => setClients(data.map(c => ({ id: c.id, name: c.name }))))
      .catch(() => setClients([]));
  }, [orgId]);

  // Autodetectar cliente cuando cambia el source
  useEffect(() => {
    const sourceUpper = source.trim().toUpperCase();
    if (!sourceUpper) return;
    const found = clients.find(c => 
      c.name.toUpperCase() === sourceUpper || 
      sourceUpper.includes(c.name.toUpperCase()) ||
      c.name.toUpperCase().includes(sourceUpper)
    );
    if (found) {
      setClientId(found.id);
    }
  }, [source, clients]);

  const handleParse = useCallback(() => {
    setParseError('');
    if (!jsonText.trim()) {
      setParseError('Ingresá el JSON con los proveedores');
      return;
    }
    if (!source.trim()) {
      setParseError('Seleccioná el origen (EPA, Cofersa, etc.)');
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      let providers: SyncProviderPayload[] = [];

      if (Array.isArray(parsed)) {
        providers = parsed;
      } else if (parsed.providers && Array.isArray(parsed.providers)) {
        providers = parsed.providers;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        providers = parsed.data;
      } else {
        throw new Error('El JSON debe ser un array o tener un campo "providers" o "data" con un array');
      }

      const validProviders = providers
        .filter((p: any) => p.name || p.short_name || p.NOMBRECORTO || p.NOMBRELARGO)
        .map((p: any) => ({
          code: p.code || p.Idproveedor || p.id || '',
          name: p.name || p.NOMBRELARGO || p.NOMBRECORTO || '',
          short_name: p.short_name || p.NOMBRECORTO || '',
          provider_type: p.provider_type || undefined,
        }));

      if (validProviders.length === 0) {
        setParseError('No se encontraron proveedores válidos en el JSON');
        return;
      }

      setParsedProviders(validProviders);
      setStep('preview');
    } catch (err: any) {
      setParseError('Error al parsear JSON: ' + (err?.message || 'JSON inválido'));
    }
  }, [jsonText, source]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');
    setStep('syncing');

    try {
      const result = await providersService.syncProviders(
        orgId,
        source.trim().toUpperCase(),
        clientId,
        parsedProviders
      );
      setSyncResult(result);
      setStep('result');
      onSyncDone();
    } catch (err: any) {
      setSyncError(err?.message || 'Error al sincronizar');
      setStep('result');
    } finally {
      setSyncing(false);
    }
  };

  const handleReset = () => {
    setStep('input');
    setJsonText('');
    setParsedProviders([]);
    setSyncResult(null);
    setSyncError('');
    setParseError('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-teal-50 rounded-lg">
              <i className="ri-refresh-line text-teal-600"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Sincronizar proveedores</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {step === 'input' && 'Importá los proveedores desde la API externa'}
                {step === 'preview' && `${parsedProviders.length} proveedores listos para sincronizar`}
                {step === 'syncing' && 'Sincronizando proveedores...'}
                {step === 'result' && (syncResult ? 'Sincronización completada' : 'Error en sincronización')}
              </p>
            </div>
          </div>
          {step !== 'syncing' && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer w-8 h-8 flex items-center justify-center"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          )}
        </div>

        {/* Steps indicator */}
        <div className="px-6 pt-3 pb-0 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {['Datos', 'Previsualizar', 'Resultado'].map((label, idx) => {
              const stepMap: Step[] = ['input', 'preview', 'result'];
              const current = stepMap.indexOf(step === 'syncing' ? 'preview' : step);
              const isActive = current === idx;
              const isDone = current > idx;
              return (
                <div key={label} className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      isActive
                        ? 'bg-teal-600 text-white'
                        : isDone
                        ? 'bg-teal-100 text-teal-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isDone ? <i className="ri-check-line text-xs"></i> : idx + 1}
                  </div>
                  <span className={isActive ? 'text-teal-700 font-medium' : isDone ? 'text-teal-600' : ''}>
                    {label}
                  </span>
                  {idx < 2 && <i className="ri-arrow-right-s-line text-gray-300"></i>}
                </div>
              );
            })}
          </div>
          <div className="border-b border-gray-100 mt-3"></div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* -- STEP: INPUT -- */}
          {step === 'input' && (
            <div className="space-y-5">
              {/* Origen */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Origen (Fuente de datos) <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Ej: EPA, COFERSA, OLO Operativo"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Se guarda en UPPERCASE. El cliente se detecta automáticamente si coincide con el nombre.</p>
              </div>

              {/* Cliente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cliente asociado (opcional, autodetectado)</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white cursor-pointer"
                >
                  <option value="">Autodetectar por origen...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {clientId && (
                  <p className="text-xs text-teal-600 mt-1">
                    <i className="ri-check-line"></i> Cliente seleccionado: {clients.find(c => c.id === clientId)?.name}
                  </p>
                )}
              </div>

              {/* JSON Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">JSON de proveedores <span className="text-red-500">*</span></label>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder={`[
  { "code": "PROV-001", "name": "Proveedor Uno", "short_name": "Prov1" },
  { "code": "PROV-002", "name": "Proveedor Dos" }
]`}
                  className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm font-mono text-xs"
                  spellCheck={false}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Podés pegar un array JSON o un objeto con <code className="bg-gray-200 px-1 rounded">providers</code> / <code className="bg-gray-200 px-1 rounded">data</code>
                </p>
              </div>

              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <i className="ri-error-warning-line text-red-500 mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                  <p className="text-sm text-red-700">{parseError}</p>
                </div>
              )}

              {/* Info box */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <i className="ri-information-line text-amber-500 w-4 h-4 flex items-center justify-center"></i>
                  <p className="text-xs font-semibold text-amber-800">¿Qué hace la sincronización?</p>
                </div>
                <ul className="text-xs text-amber-700 space-y-1 ml-6">
                  <li><strong>Match por código:</strong> Si el proveedor ya existe con el mismo código, se actualiza</li>
                  <li><strong>Match por nombre:</strong> Si no hay código, busca por nombre exacto</li>
                  <li><strong>Crear nuevos:</strong> Los que no existen se crean automáticamente</li>
                  <li><strong>Desactivar obsoletos:</strong> Proveedores SRO que no están en la API y <strong>no tienen reservas</strong> se desactivan</li>
                  <li><strong>Conservar usados:</strong> Proveedores con al menos 1 reserva se mantienen activos</li>
                  <li><strong>Origen:</strong> Se guarda siempre en UPPERCASE</li>
                </ul>
              </div>
            </div>
          )}

          {/* -- STEP: PREVIEW -- */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-teal-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-teal-700">{parsedProviders.length}</p>
                  <p className="text-xs text-teal-600 mt-0.5">Proveedores de la API</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-800">{source.trim().toUpperCase()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Origen</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-800">
                    {clients.find(c => c.id === clientId)?.name || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Cliente</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">#</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Código</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Nombre</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Nombre corto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedProviders.slice(0, 100).map((p, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 text-gray-800 font-mono">{p.code || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-800 font-medium">{p.name || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600">{p.short_name || <span className="text-gray-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedProviders.length > 100 && (
                  <p className="text-xs text-gray-400 text-center py-2 border-t border-gray-100">
                    + {parsedProviders.length - 100} proveedores más...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* -- STEP: SYNCING -- */}
          {step === 'syncing' && (
            <div className="flex flex-col items-center gap-6 py-12">
              <div className="w-16 h-16 flex items-center justify-center">
                <i className="ri-loader-4-line animate-spin text-5xl text-teal-500"></i>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800">Sincronizando proveedores...</p>
                <p className="text-sm text-gray-500 mt-1">No cerrés esta ventana. Esto puede tomar unos minutos con miles de registros.</p>
              </div>
            </div>
          )}

          {/* -- STEP: RESULT -- */}
          {step === 'result' && (
            <div className="space-y-4">
              {syncError ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-16 h-16 flex items-center justify-center bg-red-100 rounded-full">
                    <i className="ri-close-circle-line text-4xl text-red-500"></i>
                  </div>
                  <p className="text-lg font-bold text-gray-800">Error en sincronización</p>
                  <p className="text-sm text-red-600">{syncError}</p>
                </div>
              ) : syncResult ? (
                <div className="space-y-4">
                  {/* Success header */}
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-16 h-16 flex items-center justify-center bg-green-100 rounded-full">
                      <i className="ri-checkbox-circle-line text-4xl text-green-500"></i>
                    </div>
                    <p className="text-lg font-bold text-gray-800">¡Sincronización completada!</p>
                  </div>

                  {/* Summary cards */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    <div className="bg-teal-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-teal-700">{syncResult.summary.total_api}</p>
                      <p className="text-xs text-teal-600 mt-0.5">Total API</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-blue-700">{syncResult.summary.matched}</p>
                      <p className="text-xs text-blue-600 mt-0.5">Match por nombre</p>
                    </div>
                    <div className="bg-indigo-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-indigo-700">{syncResult.summary.updated}</p>
                      <p className="text-xs text-indigo-600 mt-0.5">Match por código</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-green-700">{syncResult.summary.created}</p>
                      <p className="text-xs text-green-600 mt-0.5">Creados</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-amber-700">{syncResult.summary.preserved}</p>
                      <p className="text-xs text-amber-600 mt-0.5">Conservados (con reservas)</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-red-700">{syncResult.summary.deactivated}</p>
                      <p className="text-xs text-red-600 mt-0.5">Desactivados</p>
                    </div>
                  </div>

                  {/* Errors */}
                  {syncResult.summary.errors > 0 && (
                    <div className="border border-red-200 rounded-xl overflow-hidden">
                      <div className="bg-red-50 px-4 py-2 border-b border-red-200 flex items-center gap-2">
                        <i className="ri-error-warning-line text-red-500 w-4 h-4 flex items-center justify-center"></i>
                        <p className="text-xs font-semibold text-red-700">
                          {syncResult.summary.errors} error{syncResult.summary.errors !== 1 ? 'es' : ''}
                        </p>
                      </div>
                      <ul className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                        {syncResult.details.errors.slice(0, 20).map((e: any, i: number) => (
                          <li key={i} className="px-4 py-2 text-xs flex items-start gap-2">
                            <i className="ri-close-circle-line text-red-400 mt-0.5 w-3 h-3 flex items-center justify-center flex-shrink-0"></i>
                            <span>
                              <span className="font-semibold text-gray-800">{e.name || e.code || e.id}:</span>{' '}
                              <span className="text-red-600">{e.reason}</span>
                            </span>
                          </li>
                        ))}
                        {syncResult.details.errors.length > 20 && (
                          <li className="px-4 py-2 text-xs text-gray-400 text-center">
                            + {syncResult.details.errors.length - 20} errores más...
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Preserved list */}
                  {syncResult.details.preserved.length > 0 && (
                    <div className="border border-amber-200 rounded-xl overflow-hidden">
                      <div className="bg-amber-50 px-4 py-2 border-b border-amber-200 flex items-center gap-2">
                        <i className="ri-shield-check-line text-amber-500 w-4 h-4 flex items-center justify-center"></i>
                        <p className="text-xs font-semibold text-amber-700">
                          {syncResult.details.preserved.length} proveedor{syncResult.details.preserved.length !== 1 ? 'es' : ''} conservado{syncResult.details.preserved.length !== 1 ? 's' : ''} por tener reservas
                        </p>
                      </div>
                      <ul className="divide-y divide-amber-100 max-h-48 overflow-y-auto">
                        {syncResult.details.preserved.slice(0, 20).map((p: any, i: number) => (
                          <li key={i} className="px-4 py-2 text-xs flex items-start gap-2">
                            <i className="ri-check-line text-amber-400 mt-0.5 w-3 h-3 flex items-center justify-center flex-shrink-0"></i>
                            <span className="text-gray-700">
                              <strong>{p.name}</strong> ({p.code || 'sin código'}) — {p.reservation_count} reserva{p.reservation_count !== 1 ? 's' : ''}
                            </span>
                          </li>
                        ))}
                        {syncResult.details.preserved.length > 20 && (
                          <li className="px-4 py-2 text-xs text-gray-400 text-center">
                            + {syncResult.details.preserved.length - 20} más...
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50 rounded-b-xl">
          <div>
            {step === 'preview' && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center"></i>
                Volver
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'input' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm whitespace-nowrap cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={!jsonText.trim() || !source.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-eye-line w-4 h-4 flex items-center justify-center"></i>
                  Previsualizar
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm whitespace-nowrap cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={parsedProviders.length === 0 || syncing}
                  className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
                  Sincronizar {parsedProviders.length} proveedore{parsedProviders.length !== 1 ? 's' : ''}
                </button>
              </>
            )}
            {step === 'result' && (
              <button
                type="button"
                onClick={() => { onClose(); }}
                className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium whitespace-nowrap cursor-pointer"
              >
                <i className="ri-check-line w-4 h-4 flex items-center justify-center"></i>
                Listo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}