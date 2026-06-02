import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../../lib/supabase';

interface ProviderExcelSyncModalProps {
  onClose: () => void;
  onDone: () => void;
}

interface ExcelRow {
  idCompania: number;
  origen: string;
  idProveedor: number;
  nombre: string;
}

type Step = 'upload' | 'preview' | 'syncing' | 'result';

interface SyncResult {
  total: number;
  uniqueNames?: number;
  duplicatesInFile?: number;
  matched: number;
  inserted: number;
  skipped: number;
  updateErrors?: string[];
  insertErrors?: string[];
  sampleUnmatched?: string[];
  sampleExisting?: string[];
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseExcel(file: File): Promise<{ rows: ExcelRow[]; error: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve({ rows: [], error: 'El archivo no contiene hojas.' });
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          raw: true,
        });

        if (jsonRows.length === 0) {
          resolve({ rows: [], error: 'El archivo está vacío.' });
          return;
        }

        // Detectar columnas por header normalizado
        const firstRow = jsonRows[0];
        const colMap: Record<string, string> = {};
        for (const key of Object.keys(firstRow)) {
          const norm = normalizeHeader(key);
          colMap[norm] = key;
        }

        const idcompaniaKey = colMap['IDCOMPANIA'];
        const origenKey = colMap['ORIGEN'];
        const idproveedorKey = colMap['IDPROVEEDOR'];
        const nombreKey = colMap['NOMBRELARGO'] || colMap['NOMBRECORTO'];

        if (!idcompaniaKey || !idproveedorKey || !nombreKey) {
          resolve({
            rows: [],
            error:
              'Columnas requeridas no encontradas. El archivo debe tener IDCOMPANIA, IDPROVEEDOR y NOMBRELARGO (o NOMBRECORTO).',
          });
          return;
        }

        const rows: ExcelRow[] = [];
        for (const raw of jsonRows) {
          const nombre = String(raw[nombreKey] ?? '').trim();
          if (!nombre) continue;

          const idCompania = Number(raw[idcompaniaKey]);
          const idProveedor = Number(raw[idproveedorKey]);
          const origen = String(raw[origenKey] ?? '').trim();

          if (isNaN(idCompania) || isNaN(idProveedor)) continue;

          rows.push({ idCompania, origen, idProveedor, nombre });
        }

        resolve({ rows, error: '' });
      } catch (err: unknown) {
        reject(new Error('Error leyendo el archivo: ' + String(err)));
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
}

export default function ProviderExcelSyncModal({ onClose, onDone }: ProviderExcelSyncModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats del preview
  const cofersa = rows.filter((r) => r.idCompania === 29);
  const epa = rows.filter((r) => r.idCompania === 109);
  const otros = rows.filter((r) => r.idCompania !== 29 && r.idCompania !== 109);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParseError('Solo se admiten archivos .xlsx o .xls');
      return;
    }
    setParseError('');
    setFileName(file.name);
    setLoading(true);
    try {
      const { rows: parsed, error } = await parseExcel(file);
      if (error) {
        setParseError(error);
        setLoading(false);
        return;
      }
      if (parsed.length === 0) {
        setParseError('No se encontraron filas válidas en el archivo.');
        setLoading(false);
        return;
      }
      setRows(parsed);
      setStep('preview');
    } catch (err: unknown) {
      setParseError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleSync = async () => {
    setStep('syncing');
    setSyncError('');
    try {
      const payload = rows.map((r) => ({
        id_compania: r.idCompania,
        origen: r.origen,
        id_proveedor: r.idProveedor,
        nombre: r.nombre,
      }));

      const { data, error } = await supabase.functions.invoke('sync-providers-excel', {
        body: { providers: payload },
      });

      if (error) throw new Error(error.message || 'Error en la sincronización');
      if (data?.error) throw new Error(data.error);

      setSyncResult({
        total: data.total ?? rows.length,
        uniqueNames: data.uniqueNames,
        duplicatesInFile: data.duplicatesInFile,
        matched: data.matched ?? 0,
        inserted: data.inserted ?? 0,
        skipped: data.skipped ?? 0,
        updateErrors: data.updateErrors,
        insertErrors: data.insertErrors,
        sampleUnmatched: data.sampleUnmatched,
        sampleExisting: data.sampleExisting,
      });
      setStep('result');
    } catch (err: unknown) {
      setSyncError(String(err));
      setStep('result');
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setParseError('');
    setRows([]);
    setSyncResult(null);
    setSyncError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stepIndexMap: Step[] = ['upload', 'preview', 'result'];
  const currentStepIdx = stepIndexMap.indexOf(step === 'syncing' ? 'preview' : step);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-teal-50 rounded-lg">
              <i className="ri-file-excel-2-line text-teal-600"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Sincronizar desde Excel de Proveedores</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {step === 'upload' && 'Subí el archivo PROVEEDORES.xlsx para hacer match y agregar los faltantes'}
                {step === 'preview' && `${rows.length} filas detectadas listas para sincronizar`}
                {step === 'syncing' && 'Sincronizando proveedores...'}
                {step === 'result' && (syncError ? 'Error en sincronización' : '¡Sincronización completada!')}
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
            {['Subir archivo', 'Previsualizar', 'Resultado'].map((label, idx) => {
              const isActive = currentStepIdx === idx;
              const isDone = currentStepIdx > idx;
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
          {/* UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-loader-4-line animate-spin text-3xl text-teal-500"></i>
                    </div>
                    <p className="text-sm text-gray-600 font-medium">Analizando archivo...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 flex items-center justify-center bg-teal-50 rounded-full">
                      <i className="ri-file-excel-2-line text-3xl text-teal-500"></i>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {fileName || 'Arrastrá tu archivo o hacé clic para seleccionar'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Formatos: .xlsx, .xls</p>
                    </div>
                  </div>
                )}
              </div>

              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <i className="ri-error-warning-line text-red-500 mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                  <p className="text-sm text-red-700">{parseError}</p>
                </div>
              )}

              {/* Formato esperado */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-700 mb-2">Formato esperado del archivo:</p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-200">
                        {['IDCOMPANIA', 'ORIGEN', 'IDPROVEEDOR', 'NOMBRELARGO', 'NOMBRECORTO'].map((h) => (
                          <th key={h} className="px-3 py-1.5 text-left text-gray-700 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white border-b border-gray-100">
                        <td className="px-3 py-1.5 text-gray-800">29</td>
                        <td className="px-3 py-1.5 text-gray-600">Cofersa</td>
                        <td className="px-3 py-1.5 text-gray-600">1</td>
                        <td className="px-3 py-1.5 text-gray-800">TESA TAPE CENTRO AMERICA S.A.</td>
                        <td className="px-3 py-1.5 text-gray-600">TESA TAPE</td>
                      </tr>
                      <tr className="bg-white">
                        <td className="px-3 py-1.5 text-gray-800">109</td>
                        <td className="px-3 py-1.5 text-gray-600">EPA</td>
                        <td className="px-3 py-1.5 text-gray-600">1</td>
                        <td className="px-3 py-1.5 text-gray-800">Rex Internacional Costa Rica S.A.</td>
                        <td className="px-3 py-1.5 text-gray-600">Rex CR</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-500">
                    <strong>IDCOMPANIA:</strong> 29 = Cofersa · 109 = EPA · otros se ignoran en el cliente
                  </p>
                  <p className="text-xs text-gray-500">
                    <strong>Match exacto:</strong> los proveedores existentes se actualizan con código y origen. Los que no coincidan se crean.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PREVIEW */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-800">{rows.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total filas</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-teal-700">{cofersa.length}</p>
                  <p className="text-xs text-teal-600 mt-0.5">Cofersa (ID 29)</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-teal-700">{epa.length}</p>
                  <p className="text-xs text-teal-600 mt-0.5">EPA (ID 109)</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{otros.length}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Otras compañías</p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <i className="ri-information-line text-blue-500 mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                <div className="text-xs text-blue-700 space-y-1">
                  <p><strong>Match exacto por nombre:</strong> los proveedores existentes se actualizan con código y origen.</p>
                  <p><strong>Nuevos:</strong> los que no coincidan se crean automáticamente con su cliente correspondiente.</p>
                  {otros.length > 0 && (
                    <p><strong>Otras compañías ({otros.length}):</strong> se crean sin cliente asignado.</p>
                  )}
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">ID Prov.</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Nombre</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Origen</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Cliente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 150).map((r, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-500 font-mono">{r.idProveedor}</td>
                        <td className="px-3 py-1.5 text-gray-800 font-medium max-w-xs truncate" title={r.nombre}>{r.nombre}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.origen || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-1.5">
                          {r.idCompania === 29 ? (
                            <span className="inline-flex px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium">Cofersa</span>
                          ) : r.idCompania === 109 ? (
                            <span className="inline-flex px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">EPA</span>
                          ) : (
                            <span className="text-gray-400 text-xs">ID {r.idCompania}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 150 && (
                  <p className="text-xs text-gray-400 text-center py-2 border-t border-gray-100">
                    + {rows.length - 150} filas más (se procesarán todas)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* SYNCING */}
          {step === 'syncing' && (
            <div className="flex flex-col items-center gap-6 py-12">
              <div className="w-16 h-16 flex items-center justify-center">
                <i className="ri-loader-4-line animate-spin text-5xl text-teal-500"></i>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800">Sincronizando {rows.length} proveedores...</p>
                <p className="text-sm text-gray-500 mt-1">Procesando match exacto y creando nuevos registros. No cerrés esta ventana.</p>
              </div>
            </div>
          )}

          {/* RESULT */}
          {step === 'result' && (
            <div className="space-y-4">
              {syncError ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-16 h-16 flex items-center justify-center bg-red-100 rounded-full">
                    <i className="ri-close-circle-line text-4xl text-red-500"></i>
                  </div>
                  <p className="text-lg font-bold text-gray-800">Error en sincronización</p>
                  <p className="text-sm text-red-600 text-center max-w-sm">{syncError}</p>
                </div>
              ) : syncResult ? (
                <>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="w-16 h-16 flex items-center justify-center bg-green-100 rounded-full">
                      <i className="ri-checkbox-circle-line text-4xl text-green-500"></i>
                    </div>
                    <p className="text-lg font-bold text-gray-800">¡Sincronización completada!</p>
                  </div>

                  {/* Stats principales */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-gray-800">{syncResult.total}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Total filas Excel</p>
                    </div>
                    <div className="bg-teal-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-teal-700">{syncResult.matched}</p>
                      <p className="text-xs text-teal-600 mt-0.5">Match actualizado</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{syncResult.inserted}</p>
                      <p className="text-xs text-green-600 mt-0.5">Nuevos creados</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-amber-700">{syncResult.skipped}</p>
                      <p className="text-xs text-amber-600 mt-0.5">Sin cambios</p>
                    </div>
                  </div>

                  {/* Deduplicación del archivo */}
                  {(syncResult.uniqueNames !== undefined || syncResult.duplicatesInFile !== undefined) && (
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                      <p className="text-sm font-semibold text-blue-800 mb-2">Análisis del archivo Excel</p>
                      <div className="flex gap-4 text-sm">
                        <span className="text-blue-700">Nombres únicos: <strong>{syncResult.uniqueNames}</strong></span>
                        <span className="text-blue-700">Duplicados en archivo: <strong>{syncResult.duplicatesInFile}</strong></span>
                      </div>
                    </div>
                  )}

                  {/* Errores */}
                  {(syncResult.updateErrors && syncResult.updateErrors.length > 0) && (
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <p className="text-sm font-semibold text-red-800 mb-2">Errores al actualizar ({syncResult.updateErrors.length})</p>
                      <div className="space-y-1">
                        {syncResult.updateErrors.slice(0, 3).map((err, i) => (
                          <p key={i} className="text-xs text-red-600 font-mono">{err}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {(syncResult.insertErrors && syncResult.insertErrors.length > 0) && (
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <p className="text-sm font-semibold text-red-800 mb-2">Errores al crear ({syncResult.insertErrors.length})</p>
                      <div className="space-y-1">
                        {syncResult.insertErrors.slice(0, 3).map((err, i) => (
                          <p key={i} className="text-xs text-red-600 font-mono">{err}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nombres que no hicieron match */}
                  {(syncResult.sampleUnmatched && syncResult.sampleUnmatched.length > 0) && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <p className="text-sm font-semibold text-gray-800 mb-2">
                        Ejemplos de nombres del Excel que NO coinciden con la base ({syncResult.skipped} total)
                      </p>
                      <ul className="space-y-1">
                        {syncResult.sampleUnmatched.map((name, i) => (
                          <li key={i} className="text-xs text-gray-600 font-mono">• {name}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Nombres existentes en la base */}
                  {(syncResult.sampleExisting && syncResult.sampleExisting.length > 0) && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <p className="text-sm font-semibold text-gray-800 mb-2">Ejemplos de proveedores existentes en la base</p>
                      <ul className="space-y-1">
                        {syncResult.sampleExisting.map((name, i) => (
                          <li key={i} className="text-xs text-gray-600 font-mono">• {name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
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
                Subir otro archivo
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {(step === 'upload' || step === 'preview') && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm whitespace-nowrap cursor-pointer"
              >
                Cancelar
              </button>
            )}
            {step === 'preview' && (
              <button
                type="button"
                onClick={handleSync}
                className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium whitespace-nowrap cursor-pointer"
              >
                <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
                Sincronizar {rows.length} proveedores
              </button>
            )}
            {step === 'result' && (
              <button
                type="button"
                onClick={onClose}
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