import * as XLSX from 'xlsx';
import type { ProviderCargoTimeProfile } from '@/types/catalog';
import type { Warehouse } from '@/types/warehouse';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedTimeProfileRow {
  rowIndex: number;
  /** provider_code from Excel */
  providerCode: string;
  /** provider name (informative, for display only) */
  providerName: string;
  /** cargo type name from Excel */
  cargoTypeName: string;
  /** warehouse name from Excel (empty = global) */
  warehouseName: string;
  /** avg_minutes (editable) */
  avgMinutes: number | null;
  /** seconds_per_unit (editable, optional) */
  secondsPerUnit: number | null;
  /** "Sí" or "No" — informative */
  providerActiveLabel: string;
  /** source — informative */
  source: string;

  // ── Resolved after validation ──
  providerId?: string;
  cargoTypeId?: string;
  warehouseId?: string | null;
  providerIsActive?: boolean;
  profileExists?: boolean;
}

export interface TimeProfileValidationError {
  rowIndex: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface TimeProfileParseResult {
  rows: ParsedTimeProfileRow[];
  errors: TimeProfileValidationError[];
  missingColumns: boolean;
}

// ── Header normalization ─────────────────────────────────────────────────────

function normalize(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const COLUMN_MAP: Record<string, string> = {
  'codigo proveedor': 'providerCode',
  'proveedor': 'providerName',
  'tipo de carga': 'cargoTypeName',
  'almacen': 'warehouseName',
  'tiempo promedio (min)': 'avgMinutes',
  'tiempo promedio': 'avgMinutes',
  'segundos por unidad': 'secondsPerUnit',
  'proveedor activo': 'providerActiveLabel',
  'origen': 'source',
};

const REQUIRED_COLUMNS = ['providerCode', 'cargoTypeName', 'avgMinutes'];

// ── Parse Excel file ─────────────────────────────────────────────────────────

export function parseTimeProfileExcel(file: File): Promise<TimeProfileParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve({ rows: [], errors: [], missingColumns: false });
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        const jsonRows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          raw: false,
        });

        if (jsonRows.length === 0) {
          resolve({ rows: [], errors: [], missingColumns: false });
          return;
        }

        // Build header index map
        const firstRow = jsonRows[0];
        const headerMap: Record<string, string> = {}; // normalized → original key
        for (const key of Object.keys(firstRow)) {
          const norm = normalize(key);
          if (COLUMN_MAP[norm]) {
            headerMap[COLUMN_MAP[norm]] = key;
          }
        }

        // Check required columns
        const missing = REQUIRED_COLUMNS.filter((col) => !headerMap[col]);
        if (missing.length > 0) {
          resolve({ rows: [], errors: [], missingColumns: true });
          return;
        }

        const rows: ParsedTimeProfileRow[] = [];
        const errors: TimeProfileValidationError[] = [];

        for (let i = 0; i < jsonRows.length; i++) {
          const raw = jsonRows[i];
          const rowNum = i + 2; // header + 1-indexed

          const providerCode = (raw[headerMap['providerCode']] ?? '').toString().trim();
          const providerName = (raw[headerMap['providerName']] ?? '').toString().trim();
          const cargoTypeName = (raw[headerMap['cargoTypeName']] ?? '').toString().trim();
          const warehouseName = (raw[headerMap['warehouseName']] ?? '').toString().trim();
          const avgMinutesRaw = (raw[headerMap['avgMinutes']] ?? '').toString().trim();
          const secondsPerUnitRaw = (raw[headerMap['secondsPerUnit']] ?? '').toString().trim();
          const providerActiveLabel = (raw[headerMap['providerActiveLabel']] ?? '').toString().trim();
          const source = (raw[headerMap['source']] ?? '').toString().trim();

          // Skip completely empty rows
          if (!providerCode && !providerName && !cargoTypeName && !avgMinutesRaw) continue;

          // Validate required fields
          if (!providerCode) {
            errors.push({ rowIndex: rowNum, message: 'Código Proveedor vacío', severity: 'error' });
          }
          if (!cargoTypeName) {
            errors.push({ rowIndex: rowNum, message: 'Tipo de carga vacío', severity: 'error' });
          }

          let avgMinutes: number | null = null;
          if (avgMinutesRaw) {
            const parsed = parseFloat(avgMinutesRaw.replace(',', '.'));
            if (isNaN(parsed) || parsed <= 0) {
              errors.push({ rowIndex: rowNum, message: 'Tiempo promedio inválido (debe ser número positivo)', severity: 'error' });
            } else {
              avgMinutes = parsed;
            }
          } else {
            errors.push({ rowIndex: rowNum, message: 'Tiempo promedio vacío', severity: 'error' });
          }

          let secondsPerUnit: number | null = null;
          if (secondsPerUnitRaw) {
            const parsed = parseFloat(secondsPerUnitRaw.replace(',', '.'));
            if (isNaN(parsed) || parsed < 0) {
              errors.push({ rowIndex: rowNum, message: 'Segundos por unidad inválido (debe ser número >= 0)', severity: 'error' });
            } else {
              secondsPerUnit = parsed;
            }
          }

          rows.push({
            rowIndex: rowNum,
            providerCode,
            providerName,
            cargoTypeName,
            warehouseName,
            avgMinutes,
            secondsPerUnit,
            providerActiveLabel,
            source,
          });
        }

        // Deduplicate within the file: same (providerCode, cargoTypeName, warehouseName)
        const seenKeys = new Set<string>();
        for (const row of rows) {
          const key = `${row.providerCode}|||${row.cargoTypeName}|||${row.warehouseName}`;
          if (seenKeys.has(key)) {
            errors.push({
              rowIndex: row.rowIndex,
              message: `Duplicado dentro del Excel: ${row.providerCode} / ${row.cargoTypeName} / ${row.warehouseName || 'Global'}`,
              severity: 'warning',
            });
          } else {
            seenKeys.add(key);
          }
        }

        resolve({ rows, errors, missingColumns: false });
      } catch {
        resolve({
          rows: [],
          errors: [{ rowIndex: 0, message: 'Error al leer el archivo Excel. Verificá que sea formato .xlsx o .xls válido.', severity: 'error' }],
          missingColumns: false,
        });
      }
    };
    reader.onerror = () => {
      resolve({
        rows: [],
        errors: [{ rowIndex: 0, message: 'No se pudo leer el archivo.', severity: 'error' }],
        missingColumns: false,
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Export to Excel ──────────────────────────────────────────────────────────

export interface ExportTimeProfileRow {
  providerCode: string;
  providerName: string;
  cargoTypeName: string;
  warehouseName: string;
  avgMinutes: number;
  secondsPerUnit: number | null;
  providerActive: string;
  source: string;
}

export function exportTimeProfilesToExcel(
  rows: ExportTimeProfileRow[],
  fileName = 'perfiles_tiempo.xlsx',
): void {
  const sheetData = [
    [
      'Código Proveedor',
      'Proveedor',
      'Tipo de Carga',
      'Almacén',
      'Tiempo Promedio (min)',
      'Segundos por Unidad',
      'Proveedor Activo',
      'Origen',
    ],
    ...rows.map((r) => [
      r.providerCode,
      r.providerName,
      r.cargoTypeName,
      r.warehouseName,
      r.avgMinutes,
      r.secondsPerUnit ?? '',
      r.providerActive,
      r.source,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws['!cols'] = [
    { wch: 20 },
    { wch: 35 },
    { wch: 25 },
    { wch: 25 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Perfiles de Tiempo');
  XLSX.writeFile(wb, fileName);
}

// ── Generate template ────────────────────────────────────────────────────────

export function generateTimeProfileTemplate(): void {
  const sheetData = [
    [
      'Código Proveedor',
      'Proveedor',
      'Tipo de Carga',
      'Almacén',
      'Tiempo Promedio (min)',
      'Segundos por Unidad',
      'Proveedor Activo',
      'Origen',
    ],
    ['PROV-001', 'Proveedor Ejemplo A', 'Contenedor 40', 'Almacén Central', '45', '120', 'Sí', 'manual'],
    ['PROV-002', 'Proveedor Ejemplo B', 'Carga Suelta', '', '30', '', 'Sí', 'manual'],
    ['PROV-003', 'Proveedor Inactivo', 'Contenedor 20', 'Almacén Norte', '35', '90', 'No', 'manual'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws['!cols'] = [
    { wch: 20 },
    { wch: 35 },
    { wch: 25 },
    { wch: 25 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Perfiles de Tiempo');
  XLSX.writeFile(wb, 'plantilla_perfiles_tiempo.xlsx');
}