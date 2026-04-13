import { useState, useRef, useCallback } from 'react';
import { parseProvidersExcel, generateProviderTemplate } from '@/utils/excelParser';
import { providerBulkImportService } from '@/services/providerBulkImportService';
import type { ValidatedRow, ImportProgress } from '@/services/providerBulkImportService';

interface ProviderBulkImportModalProps {
  orgId: string;
  onClose: () => void;
  onImportDone: () => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

interface ImportResult {
  attempted: number;
  succeeded: number;
  updated: number;
  failed: number;
  skipped: number;
  errors: { nombre: string; reason: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  valid: 'Nuevo',
  update_warehouses: 'Actualizar almacenes',
  duplicate_file: 'Dup. archivo',
  duplicate_db: 'Dup. base de datos',
  invalid_warehouse: 'Almacén no encontrado',
  error: 'Error',
};

const STATUS_COLORS: Record<string, string> = {
  valid: 'bg-green-100 text-green-700',
  update_warehouses: 'bg-teal-100 text-teal-700',
  duplicate_file: 'bg-amber-100 text-amber-700',
  duplicate_db: 'bg-amber-100 text-amber-700',
  invalid_warehouse: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
};

export default function ProviderBulkImportModal({
  orgId,
  onClose,
  onImportDone,
}: ProviderBulkImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [validating, setValidating] = useState(false);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validCount = validatedRows.filter((r) => r.status === 'valid' || r.status === 'update_warehouses').length;
  const invalidCount = validatedRows.filter((r) => r.status !== 'valid' && r.status !== 'update_warehouses').length;

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        setParseError('Solo se admiten archivos .xlsx o .xls');
        return;
      }
      setParseError('');
      setFileName(file.name);
      setValidating(true);
      try {
        const { rows, errors } = await parseProvidersExcel(file);
        if (errors.length > 0) {
          setParseError(errors[0]);
          setValidating(false);
          return;
        }
        if (rows.length === 0) {
          setParseError('El archivo no tiene filas con datos.');
          setValidating(false);
          return;
        }
        const validated = await providerBulkImportService.validateRows(orgId, rows);
        setValidatedRows(validated);
        setStep('preview');
      } catch (err: unknown) {
        setParseError(String(err));
      } finally {
        setValidating(false);
      }
    },
    [orgId],
  );

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

  const handleImport = async () => {
    setProgress(null);
    setStep('importing');
    try {
      const result = await providerBulkImportService.importValidRows(
        orgId,
        validatedRows,
        (prog) => setProgress(prog),
        50,
      );
      setImportResult({
        attempted: result.attempted,
        succeeded: result.succeeded,
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
      });
      setStep('result');
    } catch (err: unknown) {
      setImportResult({
        attempted: validCount,
        succeeded: 0,
        updated: 0,
        failed: validCount,
        skipped: 0,
        errors: [{ nombre: 'general', reason: String(err) }],
      });
      setStep('result');
    }
  };

  const handleFinish = () => {
    onImportDone();
    onClose();
  };

  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setParseError('');
    setValidatedRows([]);
    setImportResult(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-teal-50 rounded-lg">
              <i className="ri-upload-cloud-line text-teal-600"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Carga masiva de proveedores</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {step === 'upload' && 'Subí un archivo Excel con los proveedores a importar'}
                {step === 'preview' && `${validatedRows.length} filas detectadas — ${validCount} válidas, ${invalidCount} con problemas`}
                {step === 'importing' && 'Importando proveedores...'}
                {step === 'result' && 'Importación completada'}
              </p>
            </div>
          </div>
          {step !== 'importing' && (
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
              const stepMap: Step[] = ['upload', 'preview', 'result'];
              const current = stepMap.indexOf(step);
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
          {/* ── STEP: UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Zona de drop */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {validating ? (
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
                        {fileName || 'Arrastrá tu archivo aquí o hacé clic para seleccionar'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Formatos admitidos: .xlsx, .xls</p>
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
                        <th className="px-3 py-1.5 text-left text-gray-700 font-semibold rounded-tl-lg">nombre *</th>
                        <th className="px-3 py-1.5 text-left text-gray-700 font-semibold">almacenes</th>
                        <th className="px-3 py-1.5 text-left text-gray-700 font-semibold rounded-tr-lg">activo</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white border-b border-gray-100">
                        <td className="px-3 py-1.5 text-gray-800">Proveedor A</td>
                        <td className="px-3 py-1.5 text-gray-600">Almacén OLO|San Diego</td>
                        <td className="px-3 py-1.5 text-gray-600">true</td>
                      </tr>
                      <tr className="bg-white">
                        <td className="px-3 py-1.5 text-gray-800">Proveedor B</td>
                        <td className="px-3 py-1.5 text-gray-600">Almacén OLO</td>
                        <td className="px-3 py-1.5 text-gray-600">false</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  * <strong>nombre</strong> es obligatorio. Separar múltiples almacenes con <code className="bg-gray-200 px-1 rounded">|</code> o <code className="bg-gray-200 px-1 rounded">,</code>
                </p>
              </div>

              {/* Botón descargar plantilla */}
              <button
                type="button"
                onClick={() => generateProviderTemplate()}
                className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-800 font-medium transition-colors cursor-pointer"
              >
                <i className="ri-download-line w-4 h-4 flex items-center justify-center"></i>
                Descargar plantilla Excel
              </button>
            </div>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-800">{validatedRows.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total filas</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{validCount}</p>
                  <p className="text-xs text-green-600 mt-0.5">Válidas para importar</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{invalidCount}</p>
                  <p className="text-xs text-red-500 mt-0.5">Con errores / duplicadas</p>
                </div>
              </div>

              {/* Aviso si hay filas inválidas */}
              {invalidCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <i className="ri-alert-line text-amber-500 mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                  <p className="text-sm text-amber-700">
                    Las filas con errores <strong>no se importarán</strong>. Solo se insertarán las {validCount} filas válidas.
                  </p>
                </div>
              )}

              {/* Tabla de previsualización */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Fila</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Nombre</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Almacenes</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Activo</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {validatedRows.map((row) => (
                      <tr
                        key={row.rowIndex}
                        className={row.status !== 'valid' ? 'bg-red-50/40' : 'hover:bg-gray-50'}
                      >
                        <td className="px-3 py-2 text-gray-400">{row.rowIndex}</td>
                        <td className="px-3 py-2 text-gray-800 font-medium">{row.nombre}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {row.almacenesInput.length === 0 ? (
                            <span className="text-gray-400 italic">Sin almacenes</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {row.almacenesInput.map((a) => {
                                const found = row.almacenesResolved.some(
                                  (r) => r.name.toLowerCase() === a.toLowerCase(),
                                );
                                return (
                                  <span
                                    key={a}
                                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                      row.status === 'invalid_warehouse' && !found
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-teal-100 text-teal-700'
                                    }`}
                                  >
                                    {a}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${row.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {row.activo ? 'Sí' : 'No'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status]}`}>
                            {(row.status === 'valid' || row.status === 'update_warehouses') && <i className="ri-check-line text-xs"></i>}
                            {row.status !== 'valid' && row.status !== 'update_warehouses' && <i className="ri-close-line text-xs"></i>}
                            {STATUS_LABELS[row.status]}
                          </span>
                          {row.reason && (
                            <p className="text-red-600 mt-0.5 text-xs">{row.reason}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── STEP: IMPORTING ── */}
          {step === 'importing' && (
            <div className="flex flex-col gap-6 py-8 px-2">
              {/* Encabezado animado */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                  <i className="ri-loader-4-line animate-spin text-3xl text-teal-500"></i>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-800">Importando proveedores...</p>
                  <p className="text-xs text-gray-500 mt-0.5">Por favor no cerrés esta ventana</p>
                </div>
              </div>

              {/* Texto de progreso textual */}
              {progress && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 font-medium">
                      Procesando {progress.processed} de {progress.total} registros ({progress.percent}%)
                    </span>
                    <span className="text-gray-400 text-xs">
                      Lote {progress.currentBatch} / {progress.totalBatches}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-3 rounded-full bg-teal-500 transition-all duration-300 ease-out"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>

                  {/* Contadores live */}
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    <div className="bg-green-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-green-700">{progress.created}</p>
                      <p className="text-xs text-green-600 mt-0.5">Creados</p>
                    </div>
                    <div className="bg-teal-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-teal-700">{progress.updated}</p>
                      <p className="text-xs text-teal-600 mt-0.5">Actualizados</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-red-600">{progress.failed}</p>
                      <p className="text-xs text-red-500 mt-0.5">Errores</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-600">{progress.skipped}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Omitidos</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Estado inicial antes de primer progreso */}
              {!progress && (
                <div className="space-y-3">
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div className="h-3 rounded-full bg-teal-200 animate-pulse w-1/12" />
                  </div>
                  <p className="text-xs text-gray-400 text-center">Preparando importación...</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: RESULT ── */}
          {step === 'result' && importResult && (
            <div className="space-y-4">
              {importResult.failed === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-16 h-16 flex items-center justify-center bg-green-100 rounded-full">
                    <i className="ri-checkbox-circle-line text-4xl text-green-500"></i>
                  </div>
                  <p className="text-lg font-bold text-gray-800">¡Importación completada!</p>
                  <p className="text-sm text-gray-500 text-center">
                    {importResult.succeeded > 0 && (
                      <>Creados: <strong>{importResult.succeeded}</strong>. </>
                    )}
                    {importResult.updated > 0 && (
                      <>Actualizados: <strong>{importResult.updated}</strong>.</>
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-full">
                    <i className="ri-alert-line text-4xl text-amber-500"></i>
                  </div>
                  <p className="text-lg font-bold text-gray-800">Importación con errores</p>
                  <p className="text-sm text-gray-500">Algunos registros no pudieron procesarse</p>
                </div>
              )}

              {/* Resumen de resultado — 4 contadores */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-800">{importResult.attempted}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Intentados</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{importResult.succeeded}</p>
                  <p className="text-xs text-green-600 mt-0.5">Creados</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-teal-700">{importResult.updated}</p>
                  <p className="text-xs text-teal-600 mt-0.5">Actualizados</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                  <p className="text-xs text-red-500 mt-0.5">Fallidos</p>
                </div>
              </div>

              {/* Omitidos (filas inválidas del archivo) */}
              {importResult.skipped > 0 && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <i className="ri-information-line text-amber-500 w-4 h-4 flex items-center justify-center flex-shrink-0"></i>
                  <p className="text-xs text-amber-700">
                    <strong>{importResult.skipped}</strong> fila{importResult.skipped !== 1 ? 's' : ''} omitida{importResult.skipped !== 1 ? 's' : ''} por errores de validación (almacén no encontrado, duplicado en archivo, etc.)
                  </p>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 border-b border-red-200 flex items-center gap-2">
                    <i className="ri-error-warning-line text-red-500 w-4 h-4 flex items-center justify-center"></i>
                    <p className="text-xs font-semibold text-red-700">
                      {importResult.errors.length} error{importResult.errors.length !== 1 ? 'es' : ''} durante la importación:
                    </p>
                  </div>
                  <ul className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <li key={i} className="px-4 py-2 text-xs flex items-start gap-2">
                        <i className="ri-close-circle-line text-red-400 mt-0.5 w-3 h-3 flex items-center justify-center flex-shrink-0"></i>
                        <span>
                          <span className="font-semibold text-gray-800">{e.nombre}:</span>{' '}
                          <span className="text-red-600">{e.reason}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
            {step === 'upload' && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm whitespace-nowrap cursor-pointer"
              >
                Cancelar
              </button>
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
                  onClick={handleImport}
                  disabled={validCount === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-upload-cloud-line w-4 h-4 flex items-center justify-center"></i>
                  Importar {validCount} proveedore{validCount !== 1 ? 's' : ''}
                </button>
              </>
            )}
            {step === 'result' && (
              <button
                type="button"
                onClick={handleFinish}
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
