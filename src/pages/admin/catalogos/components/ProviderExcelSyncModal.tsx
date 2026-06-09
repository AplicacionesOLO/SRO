import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../../lib/supabase';

interface ProviderExcelSyncModalProps {
  orgId: string;
  warehouseId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

interface ExcelRow {
  idCompania: number;
  origen: string;
  idProveedor: string;
  nombre: string;
}

type Step = 'upload' | 'preview' | 'syncing' | 'result';

interface RejectedEntry {
  name: string;
  provider_code?: string;
  source?: string;
  reason: string;
  firstCode?: string;
}

interface SyncResult {
  total: number;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  preserved: number;
  rejectedMissingCode: number;
  rejectedDuplicateInExcel: number;
  errors: number;
  details?: {
    created?: { name: string; code: string; source: string }[];
    updated?: { name: string; code: string; source: string }[];
    preserved?: { name: string; code: string; source: string }[];
    rejectedMissingCode?: RejectedEntry[];
    rejectedDuplicateInExcel?: RejectedEntry[];
    errors?: { code: string; name: string; error: string }[];
  };
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Mapeo de IDs de compañía conocidos a nombres de cliente
const COMPANY_MAP: Record<number, { name: string; color: string; bg: string; text: string }> = {
  1: { name: 'FEBECA', color: 'bg-teal-50', bg: 'bg-teal-50', text: 'text-teal-700' },
  2: { name: 'SILLACA', color: 'bg-blue-50', bg: 'bg-blue-50', text: 'text-blue-700' },
  29: { name: 'Cofersa', color: 'bg-teal-50', bg: 'bg-teal-50', text: 'text-teal-700' },
  109: { name: 'EPA', color: 'bg-blue-50', bg: 'bg-blue-50', text: 'text-blue-700' },
};

function parseExcel(file: File): Promise<{ rows: ExcelRow[]; error: string; sciWarnings: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve({ rows: [], error: 'El archivo no contiene hojas.', sciWarnings: [] });
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          raw: false,
        });

        if (jsonRows.length === 0) {
          resolve({ rows: [], error: 'El archivo está vacío.', sciWarnings: [] });
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
            sciWarnings: [],
          });
          return;
        }

        const rows: ExcelRow[] = [];
        const sciWarnings: string[] = [];
        for (const raw of jsonRows) {
          const nombre = String(raw[nombreKey] ?? '').trim();
          if (!nombre) continue;

          const idCompaniaRaw = String(raw[idcompaniaKey] ?? '').trim();
          const idCompania = Number(idCompaniaRaw);
          const origen = String(raw[origenKey] ?? '').trim();
          const idProveedor = String(raw[idproveedorKey] ?? '').trim();

          if (isNaN(idCompania) || !idProveedor) continue;

          // AUTO-CORRECCIÓN de notación científica de Excel
          // Los códigos de FEBECA y SILLACA empiezan con "E" (ej: E9667559, E009667559)
          // pero Excel los interpreta como notación científica y los convierte a número.
          // Acá los detectamos y corregimos automáticamente.
          let fixedCode = idProveedor;
          let wasFixed = false;
          
          const sciPattern = /^[0-9]+(\.[0-9]+)?[eE]\+[0-9]+$/;
          if (sciPattern.test(fixedCode)) {
            // Caso: código en notación científica explícita (ej: 9.667559e+6)
            // Intentamos reconstruir: es difícil, pero advertimos
            sciWarnings.push(
              `Código "${idProveedor}" está en notación científica y no se pudo recuperar (proveedor: "${nombre}"). Revisá el Excel original.`
            );
            continue; // Saltamos esta fila — no podemos adivinar el código real
          }

          if (/^[0-9]{5,}$/.test(fixedCode) && origen) {
            const origUp = origen.toUpperCase();
            if (origUp === 'FEBECA' || origUp === 'SILLACA') {
              // Auto-corregir: agregar prefijo "E" perdido por Excel
              fixedCode = 'E' + fixedCode;
              wasFixed = true;
            }
          }

          rows.push({ idCompania, origen, idProveedor: fixedCode, nombre });
          if (wasFixed) {
            sciWarnings.push(
              `Código auto-corregido: "${idProveedor}" → "${fixedCode}" (${origen}, proveedor: "${nombre}"). Se agregó el prefijo "E" perdido por Excel.`
            );
          }
        }

        resolve({ rows, error: '', sciWarnings });
      } catch (err: unknown) {
        reject(new Error('Error leyendo el archivo: ' + String(err)));
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
}

export default function ProviderExcelSyncModal({ orgId, warehouseId, onClose, onDone }: ProviderExcelSyncModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [sciWarnings, setSciWarnings] = useState<string[]>([]);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats del preview: agrupar por compañía dinámicamente
  const companyStats = (() => {
    const stats: Record<number, number> = {};
    for (const r of rows) {
      stats[r.idCompania] = (stats[r.idCompania] || 0) + 1;
    }
    return stats;
  })();
  const knownCompanies = Object.keys(companyStats)
    .map(Number)
    .filter((id) => COMPANY_MAP[id])
    .sort((a, b) => a - b);
  const otherIds = Object.keys(companyStats)
    .map(Number)
    .filter((id) => !COMPANY_MAP[id])
    .sort((a, b) => a - b);
  const otherCount = otherIds.reduce((sum, id) => sum + (companyStats[id] || 0), 0);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParseError('Solo se admiten archivos .xlsx o .xls');
      return;
    }
    setParseError('');
    setFileName(file.name);
    setLoading(true);
    setSciWarnings([]);
    try {
      const { rows: parsed, error, sciWarnings: warns } = await parseExcel(file);
      if (error) {
        setParseError(error);
        setLoading(false);
        return;
      }
      if (parsed.length === 0) {
        setParseError('No se encontraron filas válidas en el archivo. Revisá que IDPROVEEDOR no esté vacío y que IDCOMPANIA sea numérico.');
        setLoading(false);
        return;
      }
      setRows(parsed);
      setSciWarnings(warns);
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
        name: r.nombre,
        provider_code: r.idProveedor,
        source: r.origen,
      }));

      const { data, error } = await supabase.functions.invoke('sync-providers-excel', {
        body: { org_id: orgId, warehouse_id: warehouseId || undefined, providers: payload },
      });

      if (error) throw new Error(error.message || 'Error en la sincronización');
      if (data?.error) throw new Error(data.error);

      const details = data?.details || {};

      setSyncResult({
        total: data.total ?? rows.length,
        processed: data.processed ?? 0,
        inserted: data.inserted ?? 0,
        updated: data.updated ?? 0,
        skipped: data.preserved ?? 0,
        preserved: data.preserved ?? 0,
        rejectedMissingCode: data.rejectedMissingCode ?? 0,
        rejectedDuplicateInExcel: data.rejectedDuplicateInExcel ?? 0,
        errors: data.errors ?? 0,
        details: {
          created: details.created || [],
          updated: details.updated || [],
          preserved: details.preserved || [],
          rejectedMissingCode: details.rejectedMissingCode || [],
          rejectedDuplicateInExcel: details.rejectedDuplicateInExcel || [],
          errors: details.errors || [],
        },
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
    setSciWarnings([]);
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
                        <td className="px-3 py-1.5 text-gray-800">0001</td>
                        <td className="px-3 py-1.5 text-gray-600">FEBECA</td>
                        <td className="px-3 py-1.5 text-gray-600">J310268568</td>
                        <td className="px-3 py-1.5 text-gray-800">HOTEL LOS MOLINOS C.A</td>
                        <td className="px-3 py-1.5 text-gray-600">HOTEL LOS MOLINOS</td>
                      </tr>
                      <tr className="bg-white">
                        <td className="px-3 py-1.5 text-gray-800">0002</td>
                        <td className="px-3 py-1.5 text-gray-600">SILLACA</td>
                        <td className="px-3 py-1.5 text-gray-600">J303992722</td>
                        <td className="px-3 py-1.5 text-gray-800">ADMINISTRADORA DE RIESGOS PARSALUD</td>
                        <td className="px-3 py-1.5 text-gray-600">PARSALUD</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-500">
                    <strong>IDCOMPANIA:</strong> 0001 = FEBECA · 0002 = SILLACA · 0029 = Cofersa · 0109 = EPA
                  </p>
                  <p className="text-xs text-gray-500">
                    <strong>IDPROVEEDOR:</strong> puede ser alfanumérico (RIF, cédula, código). No se convierte a número.
                  </p>
                  <p className="text-xs text-gray-500">
                    <strong>Reglas:</strong> 1) Código obligatorio. 2) Mismo nombre + mismo origen = 1 solo. 3) Mismo nombre + origen diferente = proveedores diferentes.
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
                {knownCompanies.map((id) => {
                  const info = COMPANY_MAP[id];
                  const count = companyStats[id] || 0;
                  return (
                    <div key={id} className={`${info.bg} rounded-xl p-3 text-center`}>
                      <p className={`text-2xl font-bold ${info.text}`}>{count}</p>
                      <p className={`text-xs mt-0.5 ${info.text}`}>{info.name} (ID {String(id).padStart(4, '0')})</p>
                    </div>
                  );
                })}
                {otherCount > 0 && (
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{otherCount}</p>
                    <p className="text-xs text-amber-600 mt-0.5">Otras compañías</p>
                  </div>
                )}
                {knownCompanies.length === 0 && otherCount === 0 && (
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">0</p>
                    <p className="text-xs text-amber-600 mt-0.5">Sin compañías reconocidas</p>
                  </div>
                )}
              </div>

              {/* Advertencias de notación científica */}
              {sciWarnings.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <i className="ri-alert-line text-amber-500 mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                  <div className="text-xs text-amber-800 space-y-1">
                    <p className="font-semibold">Posibles problemas de notación científica ({sciWarnings.length})</p>
                    <p>Excel puede haber interpretado códigos que empiezan con &quot;E&quot; como notación científica.</p>
                    <div className="max-h-32 overflow-y-auto mt-1 space-y-0.5">
                      {sciWarnings.map((w, i) => (
                        <p key={i} className="text-amber-700 font-mono">• {w}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <i className="ri-information-line text-blue-500 mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                <div className="text-xs text-blue-700 space-y-1.5">
                  <p><strong>Regla 1 — Código obligatorio:</strong> si una fila del Excel no tiene código de proveedor (IDPROVEEDOR vacío), se rechaza directamente.</p>
                  <p><strong>Regla 2 — Mismo nombre + mismo origen = único:</strong> si el Excel tiene el mismo proveedor con el mismo origen pero con diferentes códigos, solo se carga el primero. Los demás se rechazan como duplicados.</p>
                  <p><strong>Regla 3 — Nombre igual + origen diferente = proveedor diferente:</strong> un proveedor con el mismo nombre puede existir con diferentes orígenes (ej: FEBECA y SILLACA). Se crea uno por cada origen.</p>
                  <p><strong>Match:</strong> la identidad del proveedor es nombre + origen. Si coincide, se actualiza (código incluido). Si no coincide, se crea uno nuevo. El código es solo metadata, no define identidad.</p>
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
                    {rows.slice(0, 150).map((r, idx) => {
                      const info = COMPANY_MAP[r.idCompania];
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-500 font-mono">{r.idProveedor}</td>
                          <td className="px-3 py-1.5 text-gray-800 font-medium max-w-xs truncate" title={r.nombre}>{r.nombre}</td>
                          <td className="px-3 py-1.5 text-gray-600">{r.origen || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-1.5">
                            {info ? (
                              <span className={`inline-flex px-1.5 py-0.5 ${info.bg} ${info.text} rounded text-xs font-medium`}>{info.name}</span>
                            ) : (
                              <span className="text-gray-400 text-xs">ID {r.idCompania}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
                    <p className="text-xs text-gray-500">
                      {syncResult.processed} procesados · {syncResult.total} total filas Excel
                    </p>
                  </div>

                  {/* Stats principales */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{syncResult.inserted}</p>
                      <p className="text-xs text-green-600 mt-0.5">Nuevos creados</p>
                    </div>
                    <div className="bg-teal-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-teal-700">{syncResult.updated}</p>
                      <p className="text-xs text-teal-600 mt-0.5">Actualizados</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-amber-700">{syncResult.skipped}</p>
                      <p className="text-xs text-amber-600 mt-0.5">Sin cambios</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-red-700">
                        {syncResult.rejectedMissingCode + syncResult.rejectedDuplicateInExcel + syncResult.errors}
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">Rechazados / Errores</p>
                    </div>
                  </div>

                  {/* Rechazados detallados */}
                  {(syncResult.rejectedMissingCode > 0 || syncResult.rejectedDuplicateInExcel > 0) && (
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <p className="text-sm font-semibold text-red-800 mb-3">
                        Proveedores rechazados ({syncResult.rejectedMissingCode + syncResult.rejectedDuplicateInExcel})
                      </p>

                      {/* Regla 1: Sin código */}
                      {syncResult.rejectedMissingCode > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-red-700 mb-1">
                            Sin código (Regla 1) — {syncResult.rejectedMissingCode} proveedores
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {syncResult.details?.rejectedMissingCode?.map((item, i) => (
                              <p key={i} className="text-xs text-red-600 font-mono">
                                • {item.name || 'Sin nombre'} — {item.reason}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Regla 2: Duplicado en Excel */}
                      {syncResult.rejectedDuplicateInExcel > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-red-700 mb-1">
                            Duplicado en Excel (Regla 2) — {syncResult.rejectedDuplicateInExcel} proveedores
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {syncResult.details?.rejectedDuplicateInExcel?.map((item, i) => (
                              <p key={i} className="text-xs text-red-600 font-mono">
                                • {item.name} ({item.source}) — código: {item.provider_code} — {item.reason}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Errores técnicos */}
                  {syncResult.errors > 0 && (
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <p className="text-sm font-semibold text-red-800 mb-2">
                        Errores técnicos ({syncResult.errors})
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {syncResult.details?.errors?.map((err, i) => (
                          <p key={i} className="text-xs text-red-600 font-mono">
                            {err.code}: {err.error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Creados */}
                  {(syncResult.details?.created && syncResult.details.created.length > 0) && (
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                      <p className="text-sm font-semibold text-green-800 mb-2">
                        Nuevos proveedores creados ({syncResult.details.created.length})
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-green-200">
                              <th className="px-2 py-1 text-left text-green-700 font-semibold">Nombre</th>
                              <th className="px-2 py-1 text-left text-green-700 font-semibold">Código</th>
                              <th className="px-2 py-1 text-left text-green-700 font-semibold">Origen</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-green-100">
                            {syncResult.details.created.map((item, i) => (
                              <tr key={i}>
                                <td className="px-2 py-1 text-gray-800 font-medium">{item.name}</td>
                                <td className="px-2 py-1 text-green-700 font-mono font-semibold">{item.code}</td>
                                <td className="px-2 py-1 text-green-700 font-semibold">{item.source}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Actualizados */}
                  {(syncResult.details?.updated && syncResult.details.updated.length > 0) && (
                    <div className="bg-teal-50 rounded-xl p-4 border border-teal-200">
                      <p className="text-sm font-semibold text-teal-800 mb-2">
                        Proveedores actualizados ({syncResult.details.updated.length})
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-teal-200">
                              <th className="px-2 py-1 text-left text-teal-700 font-semibold">Nombre</th>
                              <th className="px-2 py-1 text-left text-teal-700 font-semibold">Código</th>
                              <th className="px-2 py-1 text-left text-teal-700 font-semibold">Origen</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-teal-100">
                            {syncResult.details.updated.map((item, i) => (
                              <tr key={i}>
                                <td className="px-2 py-1 text-gray-800 font-medium">{item.name}</td>
                                <td className="px-2 py-1 text-teal-700 font-mono font-semibold">{item.code}</td>
                                <td className="px-2 py-1 text-teal-700 font-semibold">{item.source}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sin cambios */}
                  {(syncResult.details?.preserved && syncResult.details.preserved.length > 0) && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <p className="text-sm font-semibold text-gray-800 mb-2">
                        Sin cambios ({syncResult.details.preserved.length})
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {syncResult.details.preserved.map((item, i) => (
                          <p key={i} className="text-xs text-gray-600 font-mono">
                            • {item.name} ({item.code}) — {item.source}
                          </p>
                        ))}
                      </div>
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
                onClick={() => { onDone(); onClose(); }}
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