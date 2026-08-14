interface MessagingBubbleProps {
  isOpen: boolean;
  unreadCount: number;
  onClick: () => void;
}

export default function MessagingBubble({ isOpen, unreadCount, onClick }: MessagingBubbleProps) {
  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? 'Cerrar mensajería' : 'Abrir mensajería'}
      className={`
        fixed bottom-36 right-4 sm:bottom-24 sm:right-6 z-[9998]
        rounded-full flex items-center justify-center
        transition-all duration-200 cursor-pointer
        ${isOpen ? 'bg-gray-700 hover:bg-gray-800 scale-95' : 'bg-emerald-600 hover:bg-emerald-700 hover:scale-110 active:scale-95'}
      `}
      style={{ width: '52px', height: '52px', boxShadow: '0 4px 20px rgba(0,0,0,0.20)' }}
    >
      <span className="w-6 h-6 flex items-center justify-center text-white">
        {isOpen ? (
          <i className="ri-close-line text-xl"></i>
        ) : (
          <i className="ri-chat-1-line text-xl"></i>
        )}
      </span>
      {unreadCount > 0 && !isOpen && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}