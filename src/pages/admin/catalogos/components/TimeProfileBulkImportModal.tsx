import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { parseTimeProfileExcel, generateTimeProfileTemplate } from '@/utils/timeProfileExcelParser';
import { timeProfilesService } from '@/services/timeProfilesService';
import type { ParsedTimeProfileRow, TimeProfileValidationError } from '@/utils/timeProfileExcelParser';
import type { ProviderCargoTimeProfile } from '@/types/catalog';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  existingProfiles: ProviderCargoTimeProfile[];
  onClose: () => void;
  onDone: () => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

interface ResolvedRow extends ParsedTimeProfileRow {
  validated: boolean; // passed all validation
  statusLabel: string;
  statusColor: string;
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TimeProfileBulkImportModal({ orgId, existingProfiles, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolvedRows, setResolvedRows] = useState<ResolvedRow[]>([]);
  const [fileErrors, setFileErrors] = useState<TimeProfileValidationError[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validCount = resolvedRows.filter((r) => r.validated).length;
  const errorCount = resolvedRows.filter((r) => !r.validated).length;
  const hasMissingCols = fileErrors.length === 0 && resolvedRows.length === 0 && !parsing;

  // ── Build existing profile key set ──
  const existingKeySet = new Set(
    existingProfiles.map(
      (p) => `${p.provider_id}|||${p.cargo_type_id}|||${p.warehouse_id ?? '__NULL__'}`,
    ),
  );

  // ── Process file ───────────────────────────────────────────────────────────
  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls)$/i)) return;
      setFileName(file.name);
      setParsing(true);
      setFileErrors([]);
      setResolvedRows([]);

      const parseResult = await parseTimeProfileExcel(file);
      if (parseResult.missingColumns) {
        setFileErrors([
          {
            rowIndex: 0,
            message:
              'Columnas requeridas no encontradas. El archivo debe contener: Código Proveedor, Tipo de Carga, Tiempo Promedio (min).',
            severity: 'error',
          },
        ]);
        setParsing(false);
        return;
      }

      if (parseResult.rows.length === 0) {
        setFileErrors([
          { rowIndex: 0, message: 'El archivo no tiene filas con datos.', severity: 'error' },
        ]);
        setParsing(false);
        return;
      }

      setFileErrors(parseResult.errors);
      setParsing(false);
      setResolving(true);

      // ── Resolve: provider_code → provider, cargo_type name → cargo_type, warehouse name → warehouse ──
      try {
        // Fetch all org providers (without active filter — need to know inactive status)
        const { data: allProviders } = await supabase
          .from('providers')
          .select('id, name, active, provider_code, source_code')
          .eq('org_id', orgId);

        // Fetch all org cargo types
        const { data: allCargoTypes } = await supabase
          .from('cargo_types')
          .select('id, name')
          .eq('org_id', orgId);

        // Fetch all org warehouses
        const { data: allWarehouses } = await supabase
          .from('warehouses')
          .select('id, name')
          .eq('org_id', orgId);

        // Build lookup maps
        const providerByCode: Record<string, any> = {};
        const providerByName: Record<string, any> = {};
        for (const p of allProviders ?? []) {
          const code = ((p as any).provider_code ?? '').trim().toUpperCase();
          if (code) providerByCode[code] = p;
          // Also index by source_code as fallback
          const sc = ((p as any).source_code ?? '').trim().toUpperCase();
          if (sc && !providerByCode[sc]) providerByCode[sc] = p;
        }

        const cargoTypeByName: Record<string, any> = {};
        const cargoTypeDuplicates = new Set<string>();
        for (const ct of allCargoTypes ?? []) {
          const key = ((ct as any).name ?? '').trim().toUpperCase();
          if (cargoTypeByName[key]) {
            cargoTypeDuplicates.add(key);
          }
          cargoTypeByName[key] = ct;
        }

        const warehouseByName: Record<string, any> = {};
        const warehouseDuplicates = new Set<string>();
        for (const w of allWarehouses ?? []) {
          const key = ((w as any).name ?? '').trim().toUpperCase();
          if (warehouseByName[key]) {
            warehouseDuplicates.add(key);
          }
          warehouseByName[key] = w;
        }

        // Resolve each row
        const resolved: ResolvedRow[] = parseResult.rows.map((row) => {
          const rowErrors: string[] = [];

          // Skip rows that already have parse errors
          const hasParseError = parseResult.errors.some(
            (e) => e.rowIndex === row.rowIndex && e.severity === 'error',
          );

          // Resolve provider
          const pCode = row.providerCode.toUpperCase();
          const provider = providerByCode[pCode];
          if (!provider) {
            rowErrors.push(`Proveedor no encontrado: código "${row.providerCode}"`);
          }

          // Resolve cargo type
          const ctKey = row.cargoTypeName.trim().toUpperCase();
          if (cargoTypeDuplicates.has(ctKey)) {
            rowErrors.push(`Tipo de carga duplicado: "${row.cargoTypeName}" (hay múltiples con el mismo nombre)`);
          }
          const cargoType = cargoTypeByName[ctKey];
          if (!cargoType) {
            rowErrors.push(`Tipo de carga no encontrado: "${row.cargoTypeName}"`);
          }

          // Resolve warehouse
          let warehouseId: string | null = null;
          if (row.warehouseName) {
            const whKey = row.warehouseName.trim().toUpperCase();
            if (warehouseDuplicates.has(whKey)) {
              rowErrors.push(`Almacén duplicado: "${row.warehouseName}" (hay múltiples con el mismo nombre)`);
            }
            const warehouse = warehouseByName[whKey];
            if (!warehouse) {
              rowErrors.push(`Almacén no encontrado: "${row.warehouseName}"`);
            } else {
              warehouseId = warehouse.id;
            }
          }

          // Validate avgMinutes
          if (row.avgMinutes === null) {
            rowErrors.push('Tiempo promedio inválido o vacío');
          }

          // Check inactive provider rule
          const isInactive = provider && !provider.active;
          const profileKey = `${provider?.id ?? '??'}|||${cargoType?.id ?? '??'}|||${warehouseId ?? '__NULL__'}`;
          const exists = provider && cargoType ? existingKeySet.has(profileKey) : false;
          if (isInactive && !exists && !hasParseError && rowErrors.length === 0) {
            rowErrors.push('Proveedor inactivo: solo se permite actualizar perfiles existentes');
          }

          const validated = !hasParseError && rowErrors.length === 0;

          let statusLabel: string;
          let statusColor: string;
          if (hasParseError) {
            statusLabel = 'Error formato';
            statusColor = 'bg-red-100 text-red-700';
          } else if (!validated) {
            statusLabel = 'Error';
            statusColor = 'bg-red-100 text-red-700';
          } else if (exists) {
            statusLabel = 'Actualizar';
            statusColor = 'bg-amber-100 text-amber-700';
          } else {
            statusLabel = 'Nuevo';
            statusColor = 'bg-green-100 text-green-700';
          }

          return {
            ...row,
            providerId: provider?.id,
            cargoTypeId: cargoType?.id,
            warehouseId,
            providerIsActive: provider?.active ?? null,
            profileExists: exists,
            validated,
            statusLabel,
            statusColor,
            _resolveErrors: rowErrors,
          };
        });

        // Deduplicate within the Excel (same composite key)
        const seenInExcel = new Set<string>();
        for (const r of resolved) {
          const key = `${r.providerId ?? r.providerCode}|||${r.cargoTypeId ?? r.cargoTypeName}|||${r.warehouseId ?? '__NULL__'}`;
          if (seenInExcel.has(key)) {
            if (!(r as any)._resolveErrors) (r as any)._resolveErrors = [];
            (r as any)._resolveErrors.push('Duplicado dentro del mismo archivo');
            (r as any).validated = false;
            (r as any).statusLabel = 'Dup. archivo';
            (r as any).statusColor = 'bg-amber-100 text-amber-700';
          }
          seenInExcel.add(key);
        }

        setResolvedRows(resolved);
        setStep('preview');
      } catch {
        setFileErrors([
          {
            rowIndex: 0,
            message: 'Error al resolver datos. Verificá la conexión e intentá de nuevo.',
            severity: 'error',
          },
        ]);
      } finally {
        setResolving(false);
      }
    },
    [orgId, existingKeySet],
  );

  // ── File handlers ──────────────────────────────────────────────────────────
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

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    const toImport = resolvedRows.filter((r) => r.validated);
    if (toImport.length === 0) return;

    setStep('importing');
    setImportProgress({ current: 0, total: toImport.length });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const importErrors: { row: number; message: string }[] = [];

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      try {
        const exists = row.profileExists;
        await timeProfilesService.create(
          orgId,
          row.providerId!,
          row.cargoTypeId!,
          row.avgMinutes!,
          row.warehouseId,
          undefined,
          undefined,
          row.secondsPerUnit,
        );
        if (exists) {
          updated++;
        } else {
          created++;
        }
      } catch (err: any) {
        importErrors.push({
          row: row.rowIndex,
          message: err?.message ?? 'Error desconocido',
        });
        skipped++;
      }
      setImportProgress({ current: i + 1, total: toImport.length });
    }

    setImportResult({
      total: toImport.length,
      created,
      updated,
      skipped,
      errors: importErrors,
    });
    setStep('result');
  };

  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setFileErrors([]);
    setResolvedRows([]);
    setImportResult(null);
    setImportProgress({ current: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFinish = () => {
    onDone();
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-teal-50 rounded-lg">
              <i className="ri-file-excel-2-line text-teal-600"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Importar perfiles de tiempo</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {step === 'upload' && 'Subí un archivo Excel con los perfiles a importar'}
                {step === 'preview' &&
                  `${resolvedRows.length} filas — ${validCount} válidas, ${errorCount} con errores`}
                {step === 'importing' && 'Importando perfiles...'}
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
              const current = stepMap.indexOf(
                step === 'importing' ? 'preview' : step,
              );
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
                  <span
                    className={
                      isActive
                        ? 'text-teal-700 font-medium'
                        : isDone
                        ? 'text-teal-600'
                        : ''
                    }
                  >
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
            <div className="space-y-5">
              {/* Template download */}
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-teal-100 shrink-0 mt-0.5">
                  <i className="ri-download-line text-teal-600 text-sm"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-teal-800">Paso 1 — Descargá la plantilla</p>
                  <p className="text-xs text-teal-600 mt-0.5 leading-relaxed">
                    Usá esta plantilla como referencia. Solo se editan las columnas{' '}
                    <strong>Tiempo Promedio (min)</strong> y <strong>Segundos por Unidad</strong>.
                    Las demás columnas identifican el perfil a actualizar.
                  </p>
                  <button
                    type="button"
                    onClick={() => generateTimeProfileTemplate()}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-file-excel-line"></i>
                    Descargar plantilla
                  </button>
                </div>
              </div>

              {/* Column reference */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-600">Columnas del archivo</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {[
                    {
                      col: 'Código Proveedor',
                      req: true,
                      editable: false,
                      desc: 'Código del proveedor. Se usa para identificar al proveedor en el sistema.',
                    },
                    { col: 'Proveedor', req: false, editable: false, desc: 'Nombre del proveedor. Solo informativo.' },
                    {
                      col: 'Tipo de Carga',
                      req: true,
                      editable: false,
                      desc: 'Nombre del tipo de carga. Se usa para identificarlo.',
                    },
                    {
                      col: 'Almacén',
                      req: false,
                      editable: false,
                      desc: 'Nombre del almacén. Vacío = perfil global.',
                    },
                    {
                      col: 'Tiempo Promedio (min)',
                      req: true,
                      editable: true,
                      desc: 'Tiempo en minutos. EDITABLE.',
                    },
                    {
                      col: 'Segundos por Unidad',
                      req: false,
                      editable: true,
                      desc: 'Solo para tipos de carga dinámicos. EDITABLE.',
                    },
                    {
                      col: 'Proveedor Activo',
                      req: false,
                      editable: false,
                      desc: 'Sí/No. Informativo.',
                    },
                    { col: 'Origen', req: false, editable: false, desc: 'manual/calculated. Informativo.' },
                  ].map((item) => (
                    <div key={item.col} className="flex items-start gap-3 px-4 py-2.5">
                      <code className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono shrink-0 mt-0.5">
                        {item.col}
                      </code>
                      <div className="flex items-start gap-2 flex-1">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${
                            item.req ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {item.req ? 'Requerido' : 'Opcional'}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${
                            item.editable ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {item.editable ? 'Editable' : 'Solo lectura'}
                        </span>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Drop zone */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Paso 2 — Subí el Excel</p>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
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
                  {(parsing || resolving) ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 flex items-center justify-center">
                        <i className="ri-loader-4-line animate-spin text-3xl text-teal-500"></i>
                      </div>
                      <p className="text-sm text-gray-600 font-medium">
                        {parsing ? 'Analizando archivo...' : 'Validando datos...'}
                      </p>
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
              </div>

              {/* File-level errors */}
              {fileErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <i className="ri-error-warning-line text-red-500 mt-0.5 w-5 h-5 flex items-center justify-center shrink-0"></i>
                  <div>
                    <p className="text-sm font-medium text-red-700">Error al leer el archivo</p>
                    <p className="text-xs text-red-600 mt-0.5">{fileErrors[0].message}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary pills */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600">
                  <i className="ri-file-list-line"></i>
                  {resolvedRows.length} filas totales
                </span>
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 text-green-700">
                  <i className="ri-check-line"></i>
                  {validCount} válidas
                </span>
                {errorCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-red-100 text-red-600">
                    <i className="ri-error-warning-line"></i>
                    {errorCount} con errores
                  </span>
                )}
                {resolvedRows.filter((r) => r.profileExists && r.validated).length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
                    <i className="ri-refresh-line"></i>
                    {resolvedRows.filter((r) => r.profileExists && r.validated).length} a actualizar
                  </span>
                )}
              </div>

              {/* Warning about error rows */}
              {errorCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <i className="ri-alert-line text-amber-500 mt-0.5 w-4 h-4 flex items-center justify-center shrink-0"></i>
                  <p className="text-sm text-amber-700">
                    Las filas con errores <strong>no se importarán</strong>. Solo se procesarán las {validCount} filas válidas.
                  </p>
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">Fila</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">Código Prov.</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">Tipo Carga</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">Almacén</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">Tiempo (min)</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">Seg/Unidad</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resolvedRows.map((row) => (
                      <tr
                        key={row.rowIndex}
                        className={!row.validated ? 'bg-red-50/30' : 'hover:bg-gray-50'}
                      >
                        <td className="px-3 py-2 text-gray-400">{row.rowIndex}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-gray-800">{row.providerCode}</span>
                          {row.providerIsActive === false && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{row.cargoTypeName}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {row.warehouseName || <span className="text-gray-400 italic">Global</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-800 font-medium">{row.avgMinutes}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {row.secondsPerUnit !== null ? row.secondsPerUnit : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${row.statusColor}`}
                          >
                            {row.validated && row.profileExists && (
                              <i className="ri-refresh-line text-xs"></i>
                            )}
                            {row.validated && !row.profileExists && (
                              <i className="ri-add-line text-xs"></i>
                            )}
                            {!row.validated && <i className="ri-close-line text-xs"></i>}
                            {row.statusLabel}
                          </span>
                          {(row as any)._resolveErrors?.length > 0 && (
                            <div className="mt-1">
                              {(row as any)._resolveErrors.map((err: string, i: number) => (
                                <p key={i} className="text-red-600 text-xs leading-relaxed">
                                  {err}
                                </p>
                              ))}
                            </div>
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
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <i className="ri-loader-4-line animate-spin text-3xl text-teal-500"></i>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-800">Importando perfiles...</p>
                  <p className="text-xs text-gray-500 mt-0.5">No cerrés esta ventana</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 font-medium">
                    {importProgress.current} de {importProgress.total} perfiles (
                    {importProgress.total > 0
                      ? Math.round((importProgress.current / importProgress.total) * 100)
                      : 0}
                    %)
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-3 rounded-full bg-teal-500 transition-all duration-300 ease-out"
                    style={{
                      width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: RESULT ── */}
          {step === 'result' && importResult && (
            <div className="space-y-4">
              {importResult.errors.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-16 h-16 flex items-center justify-center bg-green-100 rounded-full">
                    <i className="ri-checkbox-circle-line text-4xl text-green-500"></i>
                  </div>
                  <p className="text-lg font-bold text-gray-800">¡Importación completada!</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-full">
                    <i className="ri-alert-line text-4xl text-amber-500"></i>
                  </div>
                  <p className="text-lg font-bold text-gray-800">Importación con algunos errores</p>
                </div>
              )}

              {/* Summary grid */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-800">{importResult.total}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Intentados</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{importResult.created}</p>
                  <p className="text-xs text-green-600 mt-0.5">Creados</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{importResult.updated}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Actualizados</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{importResult.skipped}</p>
                  <p className="text-xs text-red-500 mt-0.5">Fallidos</p>
                </div>
              </div>

              {/* Errors list */}
              {importResult.errors.length > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 border-b border-red-200 flex items-center gap-2">
                    <i className="ri-error-warning-line text-red-500 w-4 h-4 flex items-center justify-center"></i>
                    <p className="text-xs font-semibold text-red-700">
                      {importResult.errors.length} error{importResult.errors.length !== 1 ? 'es' : ''}:
                    </p>
                  </div>
                  <ul className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <li key={i} className="px-4 py-2 text-xs flex items-start gap-2">
                        <span className="text-red-400 font-mono shrink-0">F{e.row}</span>
                        <span className="text-red-600">{e.message}</span>
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
                  Importar {validCount} perfil{validCount !== 1 ? 'es' : ''}
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