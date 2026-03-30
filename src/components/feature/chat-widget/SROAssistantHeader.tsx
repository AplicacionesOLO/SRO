interface SROAssistantHeaderProps {
  title: string;
  onClose: () => void;
  onNewSession: () => void;
  sending: boolean;
}

export default function SROAssistantHeader({
  title,
  onClose,
  onNewSession,
  sending,
}: SROAssistantHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-teal-700 rounded-t-2xl flex-shrink-0">
      <div className="w-7 h-7 flex items-center justify-center bg-white/20 rounded-full flex-shrink-0">
        <i className="ri-robot-2-line text-white text-sm"></i>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{title}</p>
        <p className="text-xs text-teal-200 truncate flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          SRObot · Asistente Documental
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onNewSession}
          disabled={sending}
          title="Nueva conversación"
          className="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-40"
        >
          <i className="ri-add-line text-base"></i>
        </button>
        <button
          onClick={onClose}
          title="Cerrar"
          className="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:bg-white/20 transition-colors cursor-pointer"
        >
          <i className="ri-close-line text-base"></i>
        </button>
      </div>
    </div>
  );
}
