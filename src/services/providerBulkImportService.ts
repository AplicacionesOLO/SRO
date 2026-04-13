import { supabase } from '../lib/supabase';
import type { ParsedExcelRow } from '../utils/excelParser';

export type RowStatus = 'valid' | 'duplicate_file' | 'duplicate_db' | 'invalid_warehouse' | 'error';

export interface ValidatedRow {
  rowIndex: number;
  nombre: string;
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
  errors: { nombre: string; reason: string }[];
}

export const providerBulkImportService = {
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

    // 2. Cargar nombres de proveedores existentes (para detectar duplicados DB)
    const { data: existingProviders, error: pErr } = await supabase
      .from('providers')
      .select('name')
      .eq('org_id', orgId);

    if (pErr) throw pErr;

    const existingNames = new Set(
      (existingProviders ?? []).map((p: { name: string }) => p.name.trim().toLowerCase()),
    );

    // 3. Detectar duplicados dentro del archivo
    const fileNames = new Map<string, number>();
    for (const row of rows) {
      const key = row.nombre.toLowerCase();
      fileNames.set(key, (fileNames.get(key) ?? 0) + 1);
    }

    // 4. Validar cada fila
    const validated: ValidatedRow[] = rows.map((row) => {
      const nameKey = row.nombre.trim().toLowerCase();

      // Duplicado en archivo (más de una ocurrencia)
      if ((fileNames.get(nameKey) ?? 0) > 1) {
        return {
          rowIndex: row.rowIndex,
          nombre: row.nombre,
          almacenesInput: row.almacenes,
          almacenesResolved: [],
          almacenesNotFound: [],
          activo: row.activo,
          status: 'duplicate_file',
          reason: 'Nombre duplicado dentro del archivo',
        };
      }

      // Duplicado en BD
      if (existingNames.has(nameKey)) {
        return {
          rowIndex: row.rowIndex,
          nombre: row.nombre,
          almacenesInput: row.almacenes,
          almacenesResolved: [],
          almacenesNotFound: [],
          activo: row.activo,
          status: 'duplicate_db',
          reason: 'Ya existe un proveedor con este nombre en la base de datos',
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
          almacenesInput: row.almacenes,
          almacenesResolved: resolved,
          almacenesNotFound: notFound,
          activo: row.activo,
          status: 'invalid_warehouse',
          reason: `Almacén(es) no encontrado(s): ${notFound.join(', ')}`,
        };
      }

      return {
        rowIndex: row.rowIndex,
        nombre: row.nombre,
        almacenesInput: row.almacenes,
        almacenesResolved: resolved,
        almacenesNotFound: [],
        activo: row.activo,
        status: 'valid',
      };
    });

    return validated;
  },

  /**
   * Inserta en providers y provider_warehouses los rows válidos.
   * Solo inserta filas con status === 'valid'.
   */
  async importValidRows(
    orgId: string,
    validatedRows: ValidatedRow[],
  ): Promise<BulkImportResult> {
    const toInsert = validatedRows.filter((r) => r.status === 'valid');

    const result: BulkImportResult = {
      attempted: toInsert.length,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    for (const row of toInsert) {
      try {
        // 1. Insertar proveedor
        const { data: newProvider, error: insErr } = await supabase
          .from('providers')
          .insert({
            org_id: orgId,
            name: row.nombre.trim(),
            active: row.activo,
          })
          .select('id')
          .maybeSingle();

        if (insErr || !newProvider) {
          result.failed++;
          result.errors.push({
            nombre: row.nombre,
            reason: insErr?.message ?? 'Error al crear proveedor',
          });
          continue;
        }

        // 2. Insertar relaciones provider_warehouses si hay almacenes
        if (row.almacenesResolved.length > 0) {
          const pwRows = row.almacenesResolved.map((w) => ({
            org_id: orgId,
            provider_id: newProvider.id,
            warehouse_id: w.id,
          }));

          const { error: pwErr } = await supabase
            .from('provider_warehouses')
            .insert(pwRows);

          if (pwErr) {
            // Proveedor creado pero sin almacenes — lo reportamos como error parcial
            result.failed++;
            result.errors.push({
              nombre: row.nombre,
              reason: `Proveedor creado pero error al asignar almacenes: ${pwErr.message}`,
            });
            continue;
          }
        }

        result.succeeded++;
      } catch (err: unknown) {
        result.failed++;
        result.errors.push({
          nombre: row.nombre,
          reason: String(err),
        });
      }
    }

    return result;
  },
};
