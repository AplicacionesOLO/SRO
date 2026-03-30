interface SROAssistantBubbleProps {
  isOpen: boolean;
  onClick: () => void;
  hasUnread?: boolean;
}

export default function SROAssistantBubble({ isOpen, onClick, hasUnread }: SROAssistantBubbleProps) {
  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? 'Cerrar asistente SRO' : 'Abrir asistente SRO'}
      className={`
        fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[9998]
        w-13 h-13 rounded-full
        flex items-center justify-center
        transition-all duration-200
        cursor-pointer
        ${isOpen
          ? 'bg-gray-700 hover:bg-gray-800 scale-95'
          : 'bg-teal-600 hover:bg-teal-700 hover:scale-110 active:scale-95'
        }
      `}
      style={{ width: '52px', height: '52px', boxShadow: '0 4px 20px rgba(0,0,0,0.20)' }}
    >
      <span
        className={`transition-transform duration-200 w-6 h-6 flex items-center justify-center text-white ${isOpen ? 'rotate-0' : 'rotate-0'}`}
      >
        {isOpen ? (
          <i className="ri-close-line text-xl"></i>
        ) : (
          <i className="ri-robot-2-line text-xl"></i>
        )}
      </span>
      {hasUnread && !isOpen && (
        <span className="absolute top-0.5 right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
      )}
    </button>
  );
}
