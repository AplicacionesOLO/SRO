import type { ComplianceTimelineEvent, TimelineEventType } from '@/types/compliance';

interface ReservationComplianceTimelineProps {
  events: ComplianceTimelineEvent[];
  isDemo?: boolean;
}

const typeConfig: Record<TimelineEventType, { icon: string; color: string; dot: string }> = {
  reservation_created: { icon: 'ri-calendar-event-line', color: 'text-blue-500', dot: 'bg-blue-500' },
  arrival: { icon: 'ri-truck-line', color: 'text-teal-500', dot: 'bg-teal-500' },
  check_in: { icon: 'ri-login-box-line', color: 'text-emerald-500', dot: 'bg-emerald-500' },
  status_change: { icon: 'ri-arrow-left-right-line', color: 'text-violet-500', dot: 'bg-violet-500' },
  rule_evaluation: { icon: 'ri-scales-line', color: 'text-amber-500', dot: 'bg-amber-500' },
  transition_allowed: { icon: 'ri-check-line', color: 'text-emerald-500', dot: 'bg-emerald-500' },
  transition_blocked: { icon: 'ri-forbid-line', color: 'text-red-500', dot: 'bg-red-500' },
  incident_created: { icon: 'ri-error-warning-line', color: 'text-red-500', dot: 'bg-red-500' },
  notification_sent: { icon: 'ri-notification-3-line', color: 'text-cyan-500', dot: 'bg-cyan-500' },
  comment_added: { icon: 'ri-chat-1-line', color: 'text-gray-500', dot: 'bg-gray-500' },
  override_requested: { icon: 'ri-shield-flash-line', color: 'text-orange-500', dot: 'bg-orange-500' },
  override_applied: { icon: 'ri-shield-check-line', color: 'text-amber-500', dot: 'bg-amber-500' },
  incident_resolved: { icon: 'ri-check-double-line', color: 'text-emerald-500', dot: 'bg-emerald-500' },
  system: { icon: 'ri-settings-3-line', color: 'text-gray-500', dot: 'bg-gray-500' },
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export default function ReservationComplianceTimeline({ events, isDemo }: ReservationComplianceTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
        <i className="ri-history-line text-3xl text-gray-300"></i>
        <p className="mt-2 text-sm text-gray-500">Sin actividad registrada</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <i className="ri-history-line text-teal-600"></i>
          Timeline de Cumplimiento
        </h4>
        {isDemo && (
          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Demo</span>
        )}
      </div>

      <div className="relative pl-6 border-l-2 border-gray-200 space-y-0">
        {events.map((event, idx) => {
          const conf = typeConfig[event.type];
          return (
            <div key={event.id} className={`relative pb-4 ${idx === events.length - 1 ? '' : ''}`} style={{ animationDelay: `${idx * 60}ms` }}>
              {/* Dot */}
              <div className={`absolute -left-[25px] w-3 h-3 rounded-full ${conf.dot} border-2 border-white ring-2 ring-gray-100`}></div>

              {/* Content */}
              <div className="bg-gray-50 rounded-lg p-3 ml-2">
                <div className="flex items-center gap-2 mb-1">
                  <i className={`${conf.icon} ${conf.color} text-sm`}></i>
                  <span className="text-xs font-medium text-gray-700">{event.description}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span>{formatTimestamp(event.timestamp)}</span>
                  {event.actorName && (
                    <span className="text-gray-500 font-medium">{event.actorName}</span>
                  )}
                  <span className="text-teal-500">{event.source}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}