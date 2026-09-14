import * as XLSX from 'xlsx';
import type { ForecastResult } from '@/types/manpowerForecast';

function formatDuration(hours: number | null | undefined): string {
  if (hours == null) return '';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function allocationLabel(
  items: Array<{ category_name: string; quantity: number }>
): string {
  if (!items.length) return '—';
  return items.map((i) => `${i.quantity}× ${i.category_name}`).join(', ');
}

/**
 * Exporta el pronóstico a un archivo Excel con dos hojas:
 * - "Pronóstico por reserva"
 * - "Agregación diaria"
 */
export function exportForecastToExcel(result: ForecastResult): void {
  const reservationRows = result.reservations.map((f) => ({
    Fecha: f.reservation.start_datetime.slice(0, 10),
    Hora: f.reservation.start_datetime.slice(11, 16),
    'Almacén': f.warehouse_name || '—',
    'País': f.country_name || '—',
    'Tipo de carga': f.cargo_type_name || '—',
    'Proveedor': f.provider_name || '—',
    'Placa': f.reservation.truck_plate || '—',
    'Bultos': f.bultos ?? '',
    'Aplica regla': f.matched ? 'Sí' : 'No',
    'Motivo': f.match_reason || '',
    'Recursos mínimos': allocationLabel(f.min_resources),
    'Recursos recomendados': allocationLabel(f.recommended_resources),
    'Duración mínima': formatDuration(f.min_duration_hours),
    'Duración recomendada': formatDuration(f.recommended_duration_hours),
  }));

  const dailyRows: Array<Record<string, string | number>> = [];
  for (const d of result.daily) {
    if (d.categories.length === 0) {
      dailyRows.push({
        Fecha: d.date,
        'Almacén': d.warehouse_name,
        'País': d.country_name,
        'Citas': d.reservation_count,
        'Bultos': d.total_bultos,
        'Categoría': '—',
        'Necesario mín.': '',
        'Necesario rec.': '',
        'Stock': '',
        'Faltante': '',
        'Requiere externo': d.requires_external ? 'Sí' : 'No',
        'Alertas': d.external_reasons.join(' | '),
      });
    } else {
      for (const c of d.categories) {
        dailyRows.push({
          Fecha: d.date,
          'Almacén': d.warehouse_name,
          'País': d.country_name,
          'Citas': d.reservation_count,
          'Bultos': d.total_bultos,
          'Categoría': c.category_name,
          'Necesario mín.': c.needed_min,
          'Necesario rec.': c.needed_rec,
          'Stock': c.stock_loaded ? c.stock : 'Sin stock',
          'Faltante': c.deficit,
          'Requiere externo': d.requires_external ? 'Sí' : 'No',
          'Alertas': d.external_reasons.join(' | '),
        });
      }
    }
  }

  // Franjas horarias: desglose de cada bloque dentro del día
  const blockRows: Array<Record<string, string | number>> = [];
  for (const d of result.daily) {
    for (const b of d.blocks) {
      if (b.categories.length === 0) {
        blockRows.push({
          Fecha: d.date,
          'Almacén': d.warehouse_name,
          'País': d.country_name,
          'Franja horaria': b.label,
          'Citas': b.reservation_count,
          'Bultos': b.total_bultos,
          'Personas (pico)': `${b.peak_personas_min} / ${b.peak_personas_rec}`,
          'Categoría': '—',
          'Necesario mín.': '',
          'Necesario rec.': '',
          'Stock': '',
          'Faltante': '',
        });
      } else {
        for (const c of b.categories) {
          blockRows.push({
            Fecha: d.date,
            'Almacén': d.warehouse_name,
            'País': d.country_name,
            'Franja horaria': b.label,
            'Citas': b.reservation_count,
            'Bultos': b.total_bultos,
            'Personas (pico)': `${b.peak_personas_min} / ${b.peak_personas_rec}`,
            'Categoría': c.category_name,
            'Necesario mín.': c.needed_min,
            'Necesario rec.': c.needed_rec,
            'Stock': c.stock_loaded ? c.stock : 'Sin stock',
            'Faltante': c.deficit,
          });
        }
      }
    }
  }

  // Sustituciones: apilador como reemplazo de carretilla (ya descontado del stock)
  const substitutionRows: Array<Record<string, string | number>> = [];
  for (const d of result.daily) {
    for (const b of d.blocks) {
      for (const s of b.substitutions) {
        substitutionRows.push({
          Fecha: d.date,
          'Almacén': d.warehouse_name,
          'País': d.country_name,
          'Franja horaria': b.label,
          'Faltante de': s.from_category_name,
          'Cantidad': s.quantity,
          'Reemplazo con': s.to_category_name,
        });
      }
    }
  }

  const wb = XLSX.utils.book_new();

  const wsRes = XLSX.utils.json_to_sheet(reservationRows.length ? reservationRows : [{ Aviso: 'Sin reservas en el rango seleccionado' }]);
  XLSX.utils.book_append_sheet(wb, wsRes, 'Pronóstico por reserva');

  const wsDaily = XLSX.utils.json_to_sheet(dailyRows.length ? dailyRows : [{ Aviso: 'Sin agregación diaria' }]);
  XLSX.utils.book_append_sheet(wb, wsDaily, 'Agregación diaria');

  const wsBlocks = XLSX.utils.json_to_sheet(blockRows.length ? blockRows : [{ Aviso: 'Sin franjas horarias' }]);
  XLSX.utils.book_append_sheet(wb, wsBlocks, 'Franjas horarias');

  const wsSubs = XLSX.utils.json_to_sheet(substitutionRows.length ? substitutionRows : [{ Aviso: 'Sin sustituciones' }]);
  XLSX.utils.book_append_sheet(wb, wsSubs, 'Sustituciones');

  const filename = `pronostico_manpower_${result.start_date}_${result.end_date}.xlsx`;
  XLSX.writeFile(wb, filename);
}