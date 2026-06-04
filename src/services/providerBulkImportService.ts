import { supabase } from '../lib/supabase';
import type { ParsedExcelRow } from '../utils/excelParser';

/**
 * Statuses de validación de filas:
 * - valid:             nuevo proveedor, listo para insertar
 * - duplicate_file:   nombre repetido dentro del mismo archivo
 * - invalid_warehouse: almacén no encontrado en la org
 * - error:            error genérico de parsing
 */
export type RowStatus = 'valid' | 'duplicate_file' | 'invalid_warehouse' | 'error';

export interface ValidatedRow {
  rowIndex: number;
  nombre: string;
  codigo?: string;
  almacenesInput: string[];
  almacenesResolved: { id: string; name: string }[];
  almacenesNotFound: string[];
  activo: boolean;
  status: RowStatus;
  reason?: string;
}

export interface BulkImportResult {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: { nombre: string; reason: string }[];
}

export interface ImportProgress {
  total: number;
  processed: number;
  created: number;
  failed: number;
  skipped: number;
  percent: number;
  currentBatch: number;
  totalBatches: number;
}

export const providerBulkImportService = {
  /**
   * Normaliza un nombre para comparación de duplicados dentro del archivo.
   * Ahora usa llave compuesta: nombre + codigo.
   */
  _normalizeForLookup(name: string, code?: string): string {
    return `${name.trim().toLowerCase()}|${(code || '').trim().toLowerCase()}`;
  },

  /**
   * Valida las filas del Excel contra almacenes.
   * Retorna cada fila con su estado y los ids de almacenes resueltos.
   * Detecta duplicados en el archivo por nombre + codigo (llave compuesta).
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

    // 2. Detectar duplicados dentro del archivo por nombre + codigo
    const fileKeys = new Map<string, number>();
    for (const row of rows) {
      const key = providerBulkImportService._normalizeForLookup(row.nombre, row.codigo);
      fileKeys.set(key, (fileKeys.get(key) ?? 0) + 1);
    }

    // 3. Validar cada fila
    const validated: ValidatedRow[] = rows.map((row) => {
      const lookupKey = providerBulkImportService._normalizeForLookup(row.nombre, row.codigo);

      // Duplicado en archivo (más de una ocurrencia de la misma llave compuesta)
      if ((fileKeys.get(lookupKey) ?? 0) > 1) {
        return {
          rowIndex: row.rowIndex,
          nombre: row.nombre,
          codigo: row.codigo,
          almacenesInput: row.almacenes,
          almacenesResolved: [],
          almacenesNotFound: [],
          activo: row.activo,
          status: 'duplicate_file' as RowStatus,
          reason: 'Nombre + código duplicado dentro del archivo',
        };
      }

      // Resolver almacenes
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
          codigo: row.codigo,
          almacenesInput: row.almacenes,
          almacenesResolved: resolved,
          almacenesNotFound: notFound,
          activo: row.activo,
          status: 'invalid_warehouse' as RowStatus,
          reason: `Almacén(es) no encontrado(s): ${notFound.join(', ')}`,
        };
      }

      // Nuevo proveedor — ya no se detectan duplicados en BD por nombre
      return {
        rowIndex: row.rowIndex,
        nombre: row.nombre,
        codigo: row.codigo,
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
   * Procesa los rows válidos en batches pequeños.
   * Cada fila se inserta como proveedor nuevo (no hay restricción única de nombre).
   */
  async importValidRows(
    orgId: string,
    validatedRows: ValidatedRow[],
    onProgress?: (progress: ImportProgress) => void,
    batchSize = 50,
  ): Promise<BulkImportResult> {
    const actionable = validatedRows.filter((r) => r.status === 'valid');
    const skipped = validatedRows.filter((r) => r.status !== 'valid').length;

    const result: BulkImportResult = {
      attempted: actionable.length,
      succeeded: 0,
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
          // Insertar proveedor nuevo
          const { data: newProvider, error: insErr } = await supabase
            .from('providers')
            .insert({
              org_id: orgId,
              name: row.nombre.trim(),
              provider_code: row.codigo?.trim() || null,
              active: row.activo,
            })
            .select('id')
            .maybeSingle();

          if (insErr) {
            result.failed++;
            result.errors.push({ nombre: row.nombre, reason: insErr.message });
            processed++;
            continue;
          }

          if (!newProvider) {
            result.failed++;
            result.errors.push({ nombre: row.nombre, reason: 'Error al crear proveedor: respuesta vacía' });
            processed++;
            continue;
          }

          const targetProviderId = newProvider.id;

          // Asignar almacenes (upsert = merge)
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

          result.succeeded++;
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