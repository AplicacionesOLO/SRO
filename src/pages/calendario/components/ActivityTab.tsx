import { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ActivityLog, ActivityLogGrouped } from '../../../types/activityLog';
import { activityLogService } from '../../../services/activityLogService';

interface ActivityTabProps {
  orgId: string;
  reservationId: string;
  docks: Array<{ id: string; name: string }>;
  statuses: Array<{ id: string; name: string; color: string }>;
}

export function ActivityTab({ orgId, reservationId, docks, statuses }: ActivityTabProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderAsc, setOrderAsc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mapas rápidos para resolver IDs -> nombre
  const dockNameById = useMemo(() => {
    const map = new Map<string, string>();
    docks.forEach(d => map.set(d.id, d.name));
    return map;
  }, [docks]);

  const statusById = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    statuses.forEach(s => map.set(s.id, { name: s.name, color: s.color }));
    return map;
  }, [statuses]);

  useEffect(() => {
    if (!orgId || !reservationId) {
      setError('Falta orgId o reservationId');
      setLoading(false);
      return;
    }

    loadActivityLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, reservationId, orderAsc]);

  const loadActivityLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await activityLogService.getActivityLogs(
        orgId,
        'reservation',
        reservationId,
        orderAsc
      );

      setLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('[ActivityTab] Error loading logs:', err);
      setError(err?.message || 'Error al cargar el historial');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // Agrupa por fecha (yyyy-MM-dd) para UI
  const groupedLogs = useMemo<ActivityLogGrouped[]>(() => {
    const groups: Record<string, ActivityLog[]> = {};

    logs.forEach((log) => {
      const dateKey = format(parseISO(log.created_at), 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });

    // Respeta el orden escogido:
    // - orderAsc: días de viejo->nuevo
    // - !orderAsc: días de nuevo->viejo
    const sortedDates = Object.keys(groups).sort((a, b) => {
      if (orderAsc) return a.localeCompare(b);
      return b.localeCompare(a);
    });

    return sortedDates.map((date) => ({
      date,
      logs: groups[date].sort((a, b) => {
        // Orden dentro del día (por created_at)
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return orderAsc ? ta - tb : tb - ta;
      }),
    }));
  }, [logs, orderAsc]);

  if (!reservationId) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <i className="ri-information-line text-4xl text-gray-300 mb-3 w-10 h-10 flex items-center justify-center mx-auto"></i>
          <p className="text-sm text-gray-500">No hay reserva seleccionada.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div>
            <div className="h-4 w-40 bg-gray-100 rounded animate-pulse"></div>
            <div className="h-3 w-64 bg-gray-100 rounded mt-2 animate-pulse"></div>
          </div>
          <div className="h-8 w-40 bg-gray-100 rounded-lg animate-pulse"></div>
        </div>

        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-xl border border-gray-200 bg-white">
              <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse"></div>
              <div className="flex-1">
                <div className="h-4 w-72 bg-gray-100 rounded animate-pulse"></div>
                <div className="h-3 w-40 bg-gray-100 rounded mt-2 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <i className="ri-error-warning-line text-4xl text-red-300 mb-3 w-10 h-10 flex items-center justify-center mx-auto"></i>
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <button
            onClick={loadActivityLogs}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <i className="ri-history-line text-4xl text-gray-300 mb-3 w-10 h-10 flex items-center justify-center mx-auto"></i>
          <p className="text-sm text-gray-500">No hay actividad registrada para esta reserva</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Historial de actividad
            <span className="ml-2 text-xs font-semibold text-gray-500">({logs.length})</span>
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Cambios realizados sobre esta reserva.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadActivityLogs}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <i className="ri-refresh-line mr-1 w-4 h-4 inline-flex items-center justify-center"></i>
            Actualizar
          </button>

          <button
            onClick={() => setOrderAsc(!orderAsc)}
            className="flex items-center gap-2 text-xs text-gray-700 hover:text-gray-900 font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <i
              className={`ri-${orderAsc ? 'sort-asc' : 'sort-desc'} w-4 h-4 flex items-center justify-center`}
            ></i>
            {orderAsc ? 'Más antiguo' : 'Más reciente'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-7">
        {groupedLogs.map((group) => (
          <div key={group.date}>
            {/* Divider fecha */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-gray-200"></div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                {format(parseISO(group.date), "d 'de' MMMM yyyy", { locale: es })}
              </span>
              <div className="h-px flex-1 bg-gray-200"></div>
            </div>

            <div className="space-y-2">
              {group.logs.map((log) => (
                <ActivityRow
                  key={log.id}
                  log={log}
                  dockNameById={dockNameById}
                  statusById={statusById}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row UI                                                                     */
/* -------------------------------------------------------------------------- */
function ActivityRow({
  log,
  dockNameById,
  statusById,
}: {
  log: ActivityLog;
  dockNameById: Map<string, string>;
  statusById: Map<string, { name: string; color: string }>;
}) {
  const time = useMemo(() => format(parseISO(log.created_at), 'HH:mm'), [log.created_at]);

  const icon = getActionIcon(log);
  const colorClass = getActionColor(log);

  const description = getActivityDescription(log, dockNameById, statusById);

  const actorLabel = log.actor?.name || log.actor?.email || 'Usuario';

  return (
    <div className="flex gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50/40 transition-colors">
      <div className={`flex-shrink-0 w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center ${colorClass}`}>
        <i className={`${icon} text-base w-4 h-4 flex items-center justify-center`}></i>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-900 font-semibold truncate">
              {description.title}
            </p>
            {description.subtitle && (
              <p className="text-sm text-gray-600 truncate mt-0.5">
                {description.subtitle}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              por <span className="font-medium">{actorLabel}</span>
              {log.actor?.email && log.actor?.name && (
                <span className="text-gray-400"> ({log.actor.email})</span>
              )}
            </p>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            <time className="text-xs font-medium text-gray-600 whitespace-nowrap">
              {time}
            </time>
            <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
              {getActionLabel(log)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getActivityDescription(
  log: ActivityLog,
  dockNameById: Map<string, string>,
  statusById: Map<string, { name: string; color: string }>
): { title: string; subtitle?: JSX.Element } {
  if (log.action === 'created') {
    return { title: 'Reserva creada' };
  }

  if (log.action === 'cancelled') {
    return { title: 'Reserva cancelada' };
  }

  if (log.action === 'uncancelled') {
    return { title: 'Cancelación revertida' };
  }

  if (log.action === 'updated' && log.field) {
    const fieldLabels: Record<string, string> = {
      status_id: 'Estado',
      start_datetime: 'Fecha/hora inicio',
      end_datetime: 'Fecha/hora fin',
      dock_id: 'Andén',
      driver: 'Chofer',
      truck_plate: 'Matrícula',
      purchase_order: 'Orden de compra',
      shipper_provider: 'Proveedor',
      notes: 'Notas',
      dua: 'DUA',
      invoice: 'Factura',
      cargo_type: 'Tipo de carga',
      transport_type: 'Tipo de transporte',
      order_request_number: 'Número de pedido',
    };

    const fieldLabel = fieldLabels[log.field] || log.field.replace(/_/g, ' ');

    const oldVal = formatValue(log.field, log.old_value, dockNameById, statusById);
    const newVal = formatValue(log.field, log.new_value, dockNameById, statusById);

    // Título corto y consistente
    const title = `${fieldLabel} actualizado`;

    // Subtítulo con chips
    const subtitle = (
      <>
        <span className="px-2 py-1 rounded-md bg-gray-50 border border-gray-200 text-xs text-gray-700">
          {oldVal}
        </span>
        <i className="ri-arrow-right-line text-gray-400 w-4 h-4 flex items-center justify-center" />
        <span className="px-2 py-1 rounded-md bg-teal-50 border border-teal-200 text-xs text-teal-900">
          {newVal}
        </span>
      </>
    );

    return { title, subtitle };
  }

  return { title: 'Cambio registrado' };
}

function formatValue(
  field: string,
  value: string | null,
  dockNameById: Map<string, string>,
  statusById: Map<string, { name: string; color: string }>
): string {
  if (value === null || value === undefined || value === '') return '(vacío)';

  // Estado
  if (field === 'status_id') {
    const st = statusById.get(value);
    return st?.name || value;
  }

  // Andén
  if (field === 'dock_id') {
    return dockNameById.get(value) || value;
  }

  // Fechas
  if (field === 'start_datetime' || field === 'end_datetime') {
    try {
      return format(parseISO(value), "d 'de' MMM yyyy HH:mm", { locale: es });
    } catch {
      return value;
    }
  }

  // Booleano
  if (field === 'is_cancelled') {
    return value === 'true' ? 'Sí' : 'No';
  }

  return value;
}

function getActionIcon(log: ActivityLog): string {
  if (log.action === 'created') return 'ri-add-circle-line';
  if (log.action === 'cancelled') return 'ri-close-circle-line';
  if (log.action === 'uncancelled') return 'ri-restart-line';
  if (log.field === 'status_id') return 'ri-checkbox-circle-line';
  if (log.field === 'start_datetime' || log.field === 'end_datetime') return 'ri-calendar-line';
  if (log.field === 'dock_id') return 'ri-building-line';
  if (log.field === 'driver') return 'ri-user-line';
  if (log.field === 'truck_plate') return 'ri-truck-line';
  if (log.field === 'notes') return 'ri-file-text-line';
  return 'ri-edit-line';
}

function getActionColor(log: ActivityLog): string {
  if (log.action === 'created') return 'text-green-600';
  if (log.action === 'cancelled') return 'text-red-600';
  if (log.action === 'uncancelled') return 'text-blue-600';
  return 'text-gray-600';
}

function getActionLabel(log: ActivityLog): string {
  if (log.action === 'created') return 'Creado';
  if (log.action === 'cancelled') return 'Cancelado';
  if (log.action === 'uncancelled') return 'Reactivado';
  if (log.action === 'updated') return 'Actualizado';
  return 'Cambio';
}
