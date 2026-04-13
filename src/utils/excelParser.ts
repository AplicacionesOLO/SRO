import * as XLSX from 'xlsx';

export interface ParsedExcelRow {
  rowIndex: number;
  nombre: string;
  almacenes: string[];
  activo: boolean;
  raw: Record<string, unknown>;
}

export interface ExcelParseResult {
  rows: ParsedExcelRow[];
  errors: string[];
}

const EXPECTED_HEADERS = ['nombre', 'almacenes', 'activo'];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const str = String(val).trim().toLowerCase();
  return str === 'true' || str === '1' || str === 'si' || str === 'sí' || str === 'yes';
}

function parseWarehouses(val: unknown): string[] {
  if (val === null || val === undefined || String(val).trim() === '') return [];
  return String(val)
    .split(/[|,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function parseProvidersExcel(file: File): Promise<ExcelParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          return resolve({ rows: [], errors: ['El archivo no contiene hojas.'] });
        }
        const sheet = workbook.Sheets[sheetName];
        const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          raw: false,
        });

        if (jsonRows.length === 0) {
          return resolve({ rows: [], errors: ['El archivo está vacío o no tiene filas de datos.'] });
        }

        // Validar encabezados
        const firstRow = jsonRows[0];
        const headers = Object.keys(firstRow).map(normalizeHeader);
        if (!headers.includes('nombre')) {
          return resolve({
            rows: [],
            errors: ['Columna "nombre" no encontrada. Verificá que el encabezado exista en la primera fila.'],
          });
        }

        // Detectar columnas reales
        const colMap: Record<string, string> = {};
        for (const key of Object.keys(firstRow)) {
          const norm = normalizeHeader(key);
          if (EXPECTED_HEADERS.includes(norm)) {
            colMap[norm] = key;
          }
        }

        const rows: ParsedExcelRow[] = [];
        for (let i = 0; i < jsonRows.length; i++) {
          const raw = jsonRows[i];
          const nombre = String(raw[colMap['nombre']] ?? '').trim();
          if (!nombre) continue; // saltar filas vacías

          const almacenesRaw = colMap['almacenes'] ? raw[colMap['almacenes']] : '';
          const activoRaw = colMap['activo'] ? raw[colMap['activo']] : true;

          rows.push({
            rowIndex: i + 2, // +2: encabezado en fila 1, datos desde fila 2
            nombre,
            almacenes: parseWarehouses(almacenesRaw),
            activo: parseBoolean(activoRaw),
            raw,
          });
        }

        resolve({ rows, errors: [] });
      } catch (err: unknown) {
        reject(new Error('Error al leer el archivo Excel: ' + String(err)));
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
}

export function generateProviderTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    ['nombre', 'almacenes', 'activo'],
    ['Proveedor Ejemplo A', 'Almacén Central|Almacén Norte', 'true'],
    ['Proveedor Ejemplo B', 'Almacén Central', 'true'],
    ['Proveedor Inactivo', '', 'false'],
  ]);

  // Ajustar anchos de columna
  ws['!cols'] = [{ wch: 30 }, { wch: 40 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
  XLSX.writeFile(wb, 'plantilla_proveedores.xlsx');
}
