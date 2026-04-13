import { supabase } from '../lib/supabase';
import type { ParsedExcelRow } from '../utils/excelParser';

/**
 * Statuses de validación de filas:
 * - valid:             nuevo proveedor, listo para insertar
 * - update_warehouses: proveedor ya existe en BD → solo se actualizarán sus almacenes (merge)
 * - duplicate_file:   nombre repetido dentro del mismo archivo
 * - invalid_warehouse: almacén no encontrado en la org
 * - error:            error genérico de parsing
 */
export type RowStatus = 'valid' | 'update_warehouses' | 'duplicate_file' | 'duplicate_db' | 'invalid_warehouse' | 'error';

export interface ValidatedRow {
  rowIndex: number;
  nombre: string;
  almacenesInput: string[];
  almacenesResolved: { id: string; name: string }[];
  almacenesNotFound: string[];
  activo: boolean;
  status: RowStatus;
  reason?: string;
  /** ID del proveedor existente cuando status === 'update_warehouses' */
  existingProviderId?: string;
}

export interface BulkImportResult {
  attempted: number;
  succeeded: number;
  updated: number;
  failed: number;
  skipped: number;
  errors: { nombre: string; reason: string }[];
}

export interface ImportProgress {
  total: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  percent: number;
  currentBatch: number;
  totalBatches: number;
}

export const providerBulkImportService = {
  /**
   * Normaliza un nombre para comparación: trim + lowercase.
   * IMPORTANTE — replica exactamente el índice único de la BD:
   *   CREATE UNIQUE INDEX providers_org_name_uniq ON providers (org_id, lower(TRIM(BOTH FROM name)))
   *
   * TRIM en PostgreSQL (y .trim() en JS) solo eliminan espacios al inicio y al final.
   * Los dobles espacios INTERNOS se preservan tal cual en el índice.
   * Por eso NO colapsamos dobles espacios aquí: si el nombre en BD tiene "MATO  SUPLIDORES"
   * el índice almacena "mato  suplidores" y el Excel limpio "MATO SUPLIDORES" produce
   * "mato suplidores" — son distintos y NO colisionan en el índice.
   *
   * El lookup de existingMap usa esta misma normalización para que:
   *   BD "MATO  SUPLIDORES" → key "mato  suplidores"
   *   Excel "MATO SUPLIDORES"  → key "mato suplidores"
   * → No coinciden → entra como 'valid' → intenta INSERT → 23505 (los dobles espacios
   *   no colapsan en el índice tampoco, así que SÍ habría colisión si la BD aceptara
   *   tanto versión con dobles como sin... pero resulta que el índice SÍ distingue ambas).
   *
   * Conclusión real: los dobles espacios internos NO causan el 23505 porque el índice
   * los preserva y distingue versión con doble vs simple espacio como registros distintos.
   * El 23505 viene de una causa diferente — ver análisis completo en importValidRows.
   *
   * La normalización correcta es: trim() + toLowerCase() únicamente, sin colapsar
   * espacios internos, para que el lookup JS sea fiel a lo que el índice PG almacena.
   */
  _normalizeForLookup(name: string): string {
    return name.trim().toLowerCase();
  },

  /**
   * Valida las filas del Excel contra almacenes y proveedores existentes.
   * Retorna cada fila con su estado y los ids de almacenes resueltos.
   */
  async validateRows(
    orgId: string,
    rows: ParsedExcelRow[],
  ): Promise<ValidatedRow[]> {
    if (rows.length === 0) return [];

    // 1. Cargar todos los almacenes de la org
    const { data: warehouseData, error: wErr } = await supabase
      .from('warehouses')
      .select('id, name')
      .eq('org_id', orgId);

    if (wErr) throw wErr;

    const warehouseMap = new Map<string, { id: string; name: string }>();
    for (const w of warehouseData ?? []) {
      warehouseMap.set(w.name.trim().toLowerCase(), { id: w.id, name: w.name });
    }

    // 2. Cargar proveedores existentes (id + name) para detectar duplicados en BD y hacer merge.
    // IMPORTANTE: Supabase limita a 1000 filas por defecto. Esta org tiene >2000 proveedores,
    // por lo que se necesita paginar. Sin esto, los proveedores en posición >1000 no se detectan
    // como existentes y entran como 'valid' → INSERT → 23505 providers_org_name_uniq.
    let existingProviders: { id: string; name: string }[] = [];
    let pErr: { message: string } | null = null;
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: pageErr } = await supabase
        .from('providers')
        .select('id, name')
        .eq('org_id', orgId)
        .range(from, from + pageSize - 1);
      if (pageErr) { pErr = pageErr; break; }
      existingProviders = existingProviders.concat(page ?? []);
      if ((page ?? []).length < pageSize) break;
      from += pageSize;
    }

    if (pErr) throw pErr;

    // Mapa: nombre normalizado (colapso de dobles espacios + lowercase) → { id, name }
    // IMPORTANTE: usamos _normalizeForLookup en lugar de solo .trim().toLowerCase()
    // porque la BD tiene nombres con dobles espacios internos (ej: "MATO  SUPLIDORES  C.A.")
    // y el Excel viene con espacios simples → sin colapso de espacios los trata como nuevos.
    const existingMap = new Map<string, { id: string; name: string }>(
      (existingProviders ?? []).map((p: { id: string; name: string }) => [
        providerBulkImportService._normalizeForLookup(p.name),
        { id: p.id, name: p.name },
      ]),
    );

    // 3. Detectar duplicados dentro del archivo
    const fileNames = new Map<string, number>();
    for (const row of rows) {
      const key = providerBulkImportService._normalizeForLookup(row.nombre);
      fileNames.set(key, (fileNames.get(key) ?? 0) + 1);
    }

    // 4. Validar cada fila
    const validated: ValidatedRow[] = rows.map((row) => {
      const nameKey = providerBulkImportService._normalizeForLookup(row.nombre);

      // Duplicado en archivo (más de una ocurrencia del mismo nombre normalizado)
      if ((fileNames.get(nameKey) ?? 0) > 1) {
        return {
          rowIndex: row.rowIndex,
          nombre: row.nombre,
          almacenesInput: row.almacenes,
          almacenesResolved: [],
          almacenesNotFound: [],
          activo: row.activo,
          status: 'duplicate_file' as RowStatus,
          reason: 'Nombre duplicado dentro del archivo',
        };
      }

      // Resolver almacenes primero (necesario tanto para 'valid' como para 'update_warehouses')
      const resolved: { id: string; name: string }[] = [];
      const notFound: string[] = [];

      for (const warehouseName of row.almacenes) {
        const found = warehouseMap.get(warehouseName.trim().toLowerCase());
        if (found) {
          resolved.push(found);
        } else {
          notFound.push(warehouseName);
        }
      }

      if (notFound.length > 0) {
        return {
          rowIndex: row.rowIndex,
          nombre: row.nombre,
          almacenesInput: row.almacenes,
          almacenesResolved: resolved,
          almacenesNotFound: notFound,
          activo: row.activo,
          status: 'invalid_warehouse' as RowStatus,
          reason: `Almacén(es) no encontrado(s): ${notFound.join(', ')}`,
        };
      }

      // Proveedor ya existe en BD → merge de almacenes (NO se rechaza)
      const existing = existingMap.get(nameKey);
      if (existing) {
        return {
          rowIndex: row.rowIndex,
          nombre: row.nombre,
          almacenesInput: row.almacenes,
          almacenesResolved: resolved,
          almacenesNotFound: [],
          activo: row.activo,
          status: 'update_warehouses' as RowStatus,
          reason: 'Proveedor ya existe — se agregarán los almacenes indicados',
          existingProviderId: existing.id,
        };
      }

      // Nuevo proveedor
      return {
        rowIndex: row.rowIndex,
        nombre: row.nombre,
        almacenesInput: row.almacenes,
        almacenesResolved: resolved,
        almacenesNotFound: [],
        activo: row.activo,
        status: 'valid' as RowStatus,
      };
    });

    return validated;
  },

  /**
   * Procesa los rows accionables en batches pequeños.
   * - 'valid':            inserta proveedor nuevo + relaciones de almacén
   * - 'update_warehouses': proveedor ya existe → hace upsert de almacenes (merge, no reemplaza)
   *
   * Llama a onProgress después de cada batch con el estado actualizado.
   * El porcentaje se calcula sobre filas REALMENTE procesadas / total accionable.
   */
  async importValidRows(
    orgId: string,
    validatedRows: ValidatedRow[],
    onProgress?: (progress: ImportProgress) => void,
    batchSize = 50,
  ): Promise<BulkImportResult> {
    const actionable = validatedRows.filter(
      (r) => r.status === 'valid' || r.status === 'update_warehouses',
    );
    const skipped = validatedRows.filter(
      (r) => r.status !== 'valid' && r.status !== 'update_warehouses',
    ).length;

    const result: BulkImportResult = {
      attempted: actionable.length,
      succeeded: 0,
      updated: 0,
      failed: 0,
      skipped,
      errors: [],
    };

    const totalBatches = Math.ceil(actionable.length / batchSize) || 1;
    let processed = 0;

    const emitProgress = (currentBatch: number) => {
      if (!onProgress) return;
      const percent = actionable.length === 0
        ? 100
        : Math.round((processed / actionable.length) * 100);
      onProgress({
        total: actionable.length,
        processed,
        created: result.succeeded,
        updated: result.updated,
        failed: result.failed,
        skipped,
        percent,
        currentBatch,
        totalBatches,
      });
    };

    // Emitir estado inicial
    emitProgress(0);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batch = actionable.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize);

      for (const row of batch) {
        try {
          let targetProviderId: string;
          const isNew = row.status === 'valid';

          if (isNew) {
            // ── Caso 1: Proveedor aparentemente nuevo ──────────────────────
            const { data: newProvider, error: insErr } = await supabase
              .from('providers')
              .insert({
                org_id: orgId,
                name: row.nombre.trim(),
                active: row.activo,
              })
              .select('id')
              .maybeSingle();

            if (insErr) {
              if (insErr.code === '23505') {
                // Conflicto de índice único funcional — buscar proveedor real
                const { data: fallback, error: fbErr } = await supabase
                  .from('providers')
                  .select('id')
                  .eq('org_id', orgId)
                  .ilike('name', row.nombre.trim())
                  .maybeSingle();

                if (fbErr || !fallback) {
                  const { data: allProviders, error: allErr } = await supabase
                    .from('providers')
                    .select('id, name')
                    .eq('org_id', orgId)
                    .limit(5000);

                  const normalized = providerBulkImportService._normalizeForLookup(row.nombre);
                  const fallback2 = allErr
                    ? null
                    : (allProviders ?? []).find(
                        (p: { id: string; name: string }) =>
                          providerBulkImportService._normalizeForLookup(p.name) === normalized,
                      ) ?? null;

                  if (!fallback2) {
                    result.failed++;
                    result.errors.push({
                      nombre: row.nombre,
                      reason: `Conflicto de nombre único y no se pudo recuperar el proveedor existente: ${insErr.message}`,
                    });
                    processed++;
                    continue;
                  }
                  targetProviderId = fallback2.id;
                } else {
                  targetProviderId = fallback.id;
                }
              } else {
                result.failed++;
                result.errors.push({ nombre: row.nombre, reason: insErr.message });
                processed++;
                continue;
              }
            } else if (!newProvider) {
              result.failed++;
              result.errors.push({ nombre: row.nombre, reason: 'Error al crear proveedor: respuesta vacía' });
              processed++;
              continue;
            } else {
              targetProviderId = newProvider.id;
            }
          } else {
            // ── Caso 2: Proveedor existente — solo actualizar almacenes ────
            targetProviderId = row.existingProviderId!;
          }

          // ── Asignar almacenes (upsert = merge) ──────────────────────────
          if (row.almacenesResolved.length > 0) {
            const pwRows = row.almacenesResolved.map((w) => ({
              org_id: orgId,
              provider_id: targetProviderId,
              warehouse_id: w.id,
            }));

            const { error: pwErr } = await supabase
              .from('provider_warehouses')
              .upsert(pwRows, { onConflict: 'org_id,provider_id,warehouse_id' });

            if (pwErr) {
              result.failed++;
              result.errors.push({ nombre: row.nombre, reason: `Error al asignar almacenes: ${pwErr.message}` });
              processed++;
              continue;
            }
          }

          if (isNew) {
            result.succeeded++;
          } else {
            result.updated++;
          }
          processed++;
        } catch (err: unknown) {
          result.failed++;
          result.errors.push({ nombre: row.nombre, reason: String(err) });
          processed++;
        }
      }

      // Emitir progreso al terminar cada batch
      emitProgress(batchIdx + 1);

      // Pequeña pausa para permitir que React re-renderice el progreso
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return result;
  },
};
