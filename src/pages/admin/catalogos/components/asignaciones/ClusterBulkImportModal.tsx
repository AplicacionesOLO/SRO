import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { Provider } from '@/types/catalog';
import { clusterService, type BulkImportResult } from '@/services/clusterService';

// ── Types ───────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  clientId: string;
  clientName: string;
  clientProviders: Provider[];
  existingClusterNames: string[];
  createdBy?: string;
  onClose: () => void;
  onDone: () => void;
}

interface ParsedGroup {
  name: string;
  description: string | null;
  providerIds: string[];
  providerNames: string[];
  duplicatesOmitted: number;
  invalidProviders: number;
  isExisting: boolean;
}

interface ParseError {
  row: number;
  message: string;
}

interface ParseResult {
  groups: ParsedGroup[];
  errors: ParseError[];
  skippedEmptyRows: number;
  missingColumns: boolean;
}

type ExistingMode = 'add' | 'replace' | 'skip';
type Step = 'upload' | 'preview' | 'done';

// ── Download template ────────────────────────────────────────────────────────

function downloadTemplate(clientName: string, providers: Provider[]) {
  const rows = providers.map((p) => ({
    cluster_name: '',
    cluster_description: '',
    provider_id: p.id,
    provider_name: p.name,
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['cluster_name', 'cluster_description', 'provider_id', 'provider_name'],
  });

  // Column widths
  ws['!cols'] = [{ wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clusters');
  XLSX.writeFile(wb, `plantilla_clusters_${clientName.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
}

// ── Parse Excel file ─────────────────────────────────────────────────────────

function parseExcelFile(
  file: File,
  clientProviderSet: Set<string>,
  providerNameMap: Map<string, string>,
  existingNamesSet: Set<string>
): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

        // Check required columns
        if (rows.length === 0) {
          resolve({ groups: [], errors: [], skippedEmptyRows: 0, missingColumns: false });
          return;
        }

        const firstRow = rows[0];
        const keys = Object.keys(firstRow).map((k) => k.trim().toLowerCase());
        const hasClusterName = keys.some((k) => k === 'cluster_name');
        const hasProviderId = keys.some((k) => k === 'provider_id');

        if (!hasClusterName || !hasProviderId) {
          resolve({ groups: [], errors: [], skippedEmptyRows: 0, missingColumns: true });
          return;
        }

        const errors: ParseError[] = [];
        let skippedEmptyRows = 0;
        const groupMap = new Map<string, ParsedGroup>();

        rows.forEach((rawRow, idx) => {
          const rowNum = idx + 2; // 1-indexed + header
          // Normalize keys
          const row: Record<string, string> = {};
          for (const [k, v] of Object.entries(rawRow)) {
            row[k.trim().toLowerCase()] = String(v ?? '').trim();
          }

          const clusterName = row['cluster_name']?.trim() ?? '';
          const providerId = row['provider_id']?.trim() ?? '';
          const clusterDesc = row['cluster_description']?.trim() || null;

          // Skip empty rows
          if (!clusterName && !providerId) {
            skippedEmptyRows++;
            return;
          }

          if (!clusterName) {
            errors.push({ row: rowNum, message: 'cluster_name está vacío.' });
            return;
          }

          if (!providerId) {
            errors.push({ row: rowNum, message: `Fila sin provider_id (cluster: "${clusterName}").` });
            return;
          }

          // Validate provider belongs to client
          if (!clientProviderSet.has(providerId)) {
            errors.push({
              row: rowNum,
              message: `provider_id "${providerId.substring(0, 12)}…" no pertenece al cliente seleccionado.`,
            });
            // Still count as invalid
            const key = clusterName.trim().toLowerCase();
            if (!groupMap.has(key)) {
              groupMap.set(key, {
                name: clusterName.trim(),
                description: clusterDesc,
                providerIds: [],
                providerNames: [],
                duplicatesOmitted: 0,
                invalidProviders: 1,
                isExisting: existingNamesSet.has(key),
              });
            } else {
              groupMap.get(key)!.invalidProviders++;
            }
            return;
          }

          const key = clusterName.trim().toLowerCase();
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              name: clusterName.trim(),
              description: clusterDesc,
              providerIds: [providerId],
              providerNames: [providerNameMap.get(providerId) ?? providerId],
              duplicatesOmitted: 0,
              invalidProviders: 0,
              isExisting: existingNamesSet.has(key),
            });
          } else {
            const g = groupMap.get(key)!;
            if (g.providerIds.includes(providerId)) {
              g.duplicatesOmitted++;
            } else {
              g.providerIds.push(providerId);
              g.providerNames.push(providerNameMap.get(providerId) ?? providerId);
            }
          }
        });

        resolve({
          groups: Array.from(groupMap.values()),
          errors,
          skippedEmptyRows,
          missingColumns: false,
        });
      } catch {
        resolve({
          groups: [],
          errors: [{ row: 0, message: 'Error al leer el archivo. Asegurate de usar formato .xlsx.' }],
          skippedEmptyRows: 0,
          missingColumns: false,
        });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ClusterBulkImportModal({
  orgId,
  clientId,
  clientName,
  clientProviders,
  existingClusterNames,
  createdBy,
  onClose,
  onDone,
}: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [existingMode, setExistingMode] = useState<ExistingMode>('add');
  const [saving, setSaving] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build lookup sets/maps once
  const clientProviderSet = new Set(clientProviders.map((p) => p.id));
  const providerNameMap = new Map(clientProviders.map((p) => [p.id, p.name]));
  const existingNamesSet = new Set(existingClusterNames.map((n) => n.trim().toLowerCase()));

  const hasExistingConflicts = parseResult?.groups.some((g) => g.isExisting) ?? false;
  const validGroups = parseResult?.groups.filter((g) => g.providerIds.length > 0) ?? [];

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (f: File) => {
      if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
        return;
      }
      setFile(f);
      setParsing(true);
      const result = await parseExcelFile(f, clientProviderSet, providerNameMap, existingNamesSet);
      setParseResult(result);
      setParsing(false);
      setStep('preview');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientProviders, existingClusterNames]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!parseResult || validGroups.length === 0) return;
    setSaving(true);
    setImportError(null);
    try {
      const result = await clusterService.bulkImportClusters(
        orgId,
        clientId,
        validGroups.map((g) => ({
          name: g.name,
          description: g.description,
          providerIds: g.providerIds,
        })),
        existingMode,
        createdBy
      );
      setImportResult(result);
      setStep('done');
    } catch (err: any) {
      setImportError(err?.message ?? 'Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setStep('upload');
    setFile(null);
    setParseResult(null);
    setImportResult(null);
    setImportError(null);
    setExistingMode('add');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-teal-50">
              <i className="ri-file-excel-line text-teal-600"></i>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Carga masiva de clusters</h2>
              <p className="text-xs text-gray-400 mt-0.5">{clientName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-gray-100 bg-gray-50">
          {(['upload', 'preview', 'done'] as Step[]).map((s, i) => {
            const labels: Record<Step, string> = { upload: '1. Cargar', preview: '2. Preview', done: '3. Resultado' };
            const isActive = step === s;
            const isPast = ['upload', 'preview', 'done'].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center">
                {i > 0 && <div className={`w-8 h-px ${isPast || isActive ? 'bg-teal-400' : 'bg-gray-200'}`} />}
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    isActive
                      ? 'bg-teal-600 text-white'
                      : isPast
                      ? 'bg-teal-100 text-teal-700'
                      : 'text-gray-400'
                  }`}
                >
                  {labels[s]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── STEP: UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Download template */}
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-teal-100 shrink-0 mt-0.5">
                  <i className="ri-download-line text-teal-600 text-sm"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-teal-800">Paso 1 — Descargá la plantilla</p>
                  <p className="text-xs text-teal-600 mt-0.5 leading-relaxed">
                    Viene precargada con todos los proveedores del cliente. Completá la columna{' '}
                    <code className="bg-teal-100 px-1 rounded">cluster_name</code> para cada fila.
                    Podés repetir el mismo nombre en múltiples filas para asignarle varios proveedores.
                  </p>
                  <button
                    type="button"
                    onClick={() => downloadTemplate(clientName, clientProviders)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-file-excel-line"></i>
                    Descargar plantilla ({clientProviders.length} proveedores)
                  </button>
                </div>
              </div>

              {/* Column reference */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-600">Columnas de la plantilla</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {[
                    { col: 'cluster_name', req: true, desc: 'Nombre del cluster. Repetir en cada fila del mismo cluster.' },
                    { col: 'cluster_description', req: false, desc: 'Descripción opcional del cluster.' },
                    { col: 'provider_id', req: true, desc: 'ID del proveedor. Viene precargado — no modificar.' },
                    { col: 'provider_name', req: false, desc: 'Nombre del proveedor. Solo referencia visual.' },
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
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Drop zone */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Paso 2 — Subí el Excel completado</p>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                    dragOver ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 mx-auto mb-3">
                    <i className="ri-upload-2-line text-gray-400 text-lg"></i>
                  </div>
                  <p className="text-sm font-medium text-gray-700">Arrastrá o hacé click para seleccionar</p>
                  <p className="text-xs text-gray-400 mt-1">Formato: .xlsx</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleInputChange}
                  />
                </div>
                {parsing && (
                  <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
                    Procesando archivo…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === 'preview' && parseResult && (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <i className="ri-file-excel-line text-teal-500 w-4 h-4 flex items-center justify-center"></i>
                <span className="font-medium truncate">{file?.name}</span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
                >
                  <i className="ri-refresh-line"></i>
                  Cambiar archivo
                </button>
              </div>

              {/* Missing columns error */}
              {parseResult.missingColumns && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <i className="ri-error-warning-line text-red-500 mt-0.5"></i>
                  <div>
                    <p className="text-sm font-medium text-red-700">Columnas requeridas no encontradas</p>
                    <p className="text-xs text-red-500 mt-1">
                      El archivo debe contener las columnas <code className="bg-red-100 px-1 rounded">cluster_name</code> y{' '}
                      <code className="bg-red-100 px-1 rounded">provider_id</code>. Usá la plantilla descargada.
                    </p>
                  </div>
                </div>
              )}

              {/* Summary pills */}
              {!parseResult.missingColumns && (
                <div className="flex flex-wrap gap-2">
                  <Pill color="teal" icon="ri-stack-line" label={`${validGroups.length} cluster${validGroups.length !== 1 ? 's' : ''} válidos`} />
                  {hasExistingConflicts && (
                    <Pill color="amber" icon="ri-alert-line" label={`${parseResult.groups.filter((g) => g.isExisting).length} ya existen`} />
                  )}
                  {parseResult.errors.length > 0 && (
                    <Pill color="red" icon="ri-error-warning-line" label={`${parseResult.errors.length} error${parseResult.errors.length !== 1 ? 'es' : ''}`} />
                  )}
                  {parseResult.skippedEmptyRows > 0 && (
                    <Pill color="gray" icon="ri-subtract-line" label={`${parseResult.skippedEmptyRows} filas vacías omitidas`} />
                  )}
                </div>
              )}

              {/* Clusters list */}
              {!parseResult.missingColumns && parseResult.groups.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-600">Clusters detectados</p>
                    <p className="text-xs text-gray-400">{parseResult.groups.length} total</p>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                    {parseResult.groups.map((g) => (
                      <div key={g.name} className="flex items-start gap-3 px-4 py-3">
                        <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-teal-50 shrink-0 mt-0.5">
                          <i className="ri-stack-line text-teal-500 text-xs"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800 truncate">{g.name}</span>
                            {g.isExisting && (
                              <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">
                                Ya existe
                              </span>
                            )}
                            {g.providerIds.length === 0 && (
                              <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full font-medium">
                                Sin proveedores válidos
                              </span>
                            )}
                          </div>
                          {g.description && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">{g.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-gray-500">
                              <i className="ri-truck-line mr-1 text-gray-400"></i>
                              {g.providerIds.length} proveedor{g.providerIds.length !== 1 ? 'es' : ''}
                            </span>
                            {g.duplicatesOmitted > 0 && (
                              <span className="text-xs text-amber-500">
                                <i className="ri-filter-line mr-1"></i>
                                {g.duplicatesOmitted} duplicado{g.duplicatesOmitted !== 1 ? 's' : ''} omitido{g.duplicatesOmitted !== 1 ? 's' : ''}
                              </span>
                            )}
                            {g.invalidProviders > 0 && (
                              <span className="text-xs text-red-500">
                                <i className="ri-error-warning-line mr-1"></i>
                                {g.invalidProviders} inválido{g.invalidProviders !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mode selector for existing clusters */}
              {hasExistingConflicts && validGroups.some((g) => g.isExisting) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <i className="ri-alert-line text-amber-500"></i>
                    <p className="text-sm font-medium text-amber-800">Clusters que ya existen — ¿qué hacemos?</p>
                  </div>
                  <div className="space-y-2">
                    {(
                      [
                        { value: 'add', label: 'Agregar proveedores', desc: 'Agrega los del Excel al cluster existente sin borrar los actuales.' },
                        { value: 'replace', label: 'Reemplazar proveedores', desc: 'Elimina los proveedores actuales y los reemplaza con los del Excel.' },
                        { value: 'skip', label: 'Omitir clusters existentes', desc: 'No toca los clusters que ya existen.' },
                      ] as { value: ExistingMode; label: string; desc: string }[]
                    ).map((opt) => (
                      <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="existingMode"
                          value={opt.value}
                          checked={existingMode === opt.value}
                          onChange={() => setExistingMode(opt.value)}
                          className="mt-1 accent-teal-600"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                          <p className="text-xs text-gray-500">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {parseResult.errors.length > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-2">
                    <i className="ri-error-warning-line text-red-500 text-sm"></i>
                    <p className="text-xs font-medium text-red-700">{parseResult.errors.length} error{parseResult.errors.length !== 1 ? 'es' : ''} encontrado{parseResult.errors.length !== 1 ? 's' : ''} (filas omitidas)</p>
                  </div>
                  <div className="divide-y divide-red-50 max-h-40 overflow-y-auto">
                    {parseResult.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 px-4 py-2">
                        <span className="text-xs font-mono text-red-400 shrink-0">F{err.row}</span>
                        <p className="text-xs text-red-600">{err.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import error */}
              {importError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 flex items-center gap-2">
                  <i className="ri-error-warning-line"></i>
                  {importError}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === 'done' && importResult && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-teal-50 mx-auto mb-3">
                  <i className="ri-checkbox-circle-line text-teal-500 text-2xl"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-900">¡Importación completada!</h3>
                <p className="text-sm text-gray-400 mt-1">Los clusters fueron creados/actualizados correctamente.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ResultCard
                  icon="ri-add-circle-line"
                  color="teal"
                  value={importResult.created}
                  label="Clusters creados"
                />
                <ResultCard
                  icon="ri-refresh-line"
                  color="amber"
                  value={importResult.updated}
                  label="Clusters actualizados"
                />
                <ResultCard
                  icon="ri-truck-line"
                  color="teal"
                  value={importResult.providersInserted}
                  label="Proveedores insertados"
                />
                <ResultCard
                  icon="ri-skip-forward-line"
                  color="gray"
                  value={importResult.skipped}
                  label="Clusters omitidos"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          {step === 'upload' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancelar
              </button>
              <span className="text-xs text-gray-400">Descargá la plantilla, completala y subila</span>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                ← Volver
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving || parseResult?.missingColumns || validGroups.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    Guardando…
                  </>
                ) : (
                  <>
                    <i className="ri-check-line"></i>
                    Confirmar carga ({validGroups.length} cluster{validGroups.length !== 1 ? 's' : ''})
                  </>
                )}
              </button>
            </>
          )}

          {step === 'done' && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Nueva carga
              </button>
              <button
                type="button"
                onClick={() => { onDone(); onClose(); }}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Listo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Pill({ color, icon, label }: { color: 'teal' | 'amber' | 'red' | 'gray'; icon: string; label: string }) {
  const cls: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${cls[color]}`}>
      <i className={`${icon} text-xs`}></i>
      {label}
    </span>
  );
}

function ResultCard({
  icon,
  color,
  value,
  label,
}: {
  icon: string;
  color: 'teal' | 'amber' | 'gray';
  value: number;
  label: string;
}) {
  const cls: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
    gray: 'bg-gray-100 text-gray-500',
  };
  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 ${cls[color]}`}>
      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/60">
        <i className={`${icon} text-lg`}></i>
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs mt-1 opacity-80">{label}</p>
      </div>
    </div>
  );
}