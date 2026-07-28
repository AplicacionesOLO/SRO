import { useState } from 'react';
import type { ComplianceTechnicalContext } from '@/types/compliance';

interface ComplianceTechnicalContextProps {
  context: ComplianceTechnicalContext | null;
}

function JsonViewer({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!data) {
    return (
      <div className="border border-gray-100 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <i className="ri-braces-line text-gray-400 text-sm"></i>
          <span className="text-xs font-medium text-gray-600">{label}</span>
          <span className="text-[10px] text-gray-400 italic">null</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <i className="ri-braces-line text-teal-600 text-sm"></i>
          <span className="text-xs font-medium text-gray-700">{label}</span>
          <span className="text-[10px] text-gray-400">{Object.keys(data).length} keys</span>
        </div>
        <i className={`ri-${expanded ? 'arrow-up-s' : 'arrow-down-s'}-line text-gray-400`}></i>
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <pre className="text-xs font-mono text-gray-700 bg-gray-50 p-2 rounded overflow-x-auto max-h-64">
            {JSON.stringify(data, null, 2)}
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            }}
            className="mt-1 text-[10px] text-teal-600 hover:text-teal-800 cursor-pointer inline-flex items-center gap-1"
          >
            <i className="ri-clipboard-line w-3 h-3 flex items-center justify-center"></i>
            Copiar
          </button>
        </div>
      )}
    </div>
  );
}

export default function ComplianceTechnicalContext({ context }: ComplianceTechnicalContextProps) {
  const [expanded, setExpanded] = useState(false);

  if (!context) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
        <i className="ri-code-line text-3xl text-gray-300"></i>
        <p className="mt-2 text-sm text-gray-500">Contexto técnico no disponible</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-0 cursor-pointer"
      >
        <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <i className="ri-code-s-slash-line text-teal-600"></i>
          Contexto Técnico
        </h4>
        <i className={`ri-${expanded ? 'arrow-up-s' : 'arrow-down-s'}-line text-gray-400`}></i>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-gray-500 mb-1">
            <span className="font-medium">resolved_warehouse_id:</span>
            <span className="font-mono ml-1">{context.resolvedWarehouseId || 'NULL'}</span>
          </div>
          <div className="text-xs text-gray-500 mb-1">
            <span className="font-medium">Reglas aplicables:</span>
            <span className="ml-1">{context.applicableRules.join(', ')}</span>
          </div>
          <JsonViewer data={context.reservationContext} label="Reservation Context" />
          <JsonViewer data={context.conditionsJson} label="Conditions JSON" />
          <JsonViewer data={context.evaluatedJson} label="Evaluated JSON" />
          <JsonViewer data={context.resolutionJson} label="Resolution JSON" />
          <JsonViewer data={context.incidentPayload} label="Incident Payload" />
          <JsonViewer data={context.notificationPayload} label="Notification Payload" />
        </div>
      )}
    </div>
  );
}