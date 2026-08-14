import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface MediaPreviewModalProps {
  url: string;
  type: 'image' | 'video';
  name: string;
  onClose: () => void;
}

export default function MediaPreviewModal({ url, type, name, onClose }: MediaPreviewModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10004] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="relative w-full h-full flex flex-col items-center justify-center px-4 py-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          title="Cerrar"
        >
          <i className="ri-close-line text-white text-xl"></i>
        </button>

        {type === 'image' ? (
          <img src={url} alt={name} className="max-h-[80vh] max-w-full object-contain rounded-lg" />
        ) : (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-[80vh] max-w-full rounded-lg bg-black"
          />
        )}

        <p className="text-white/70 text-sm mt-3 max-w-full truncate px-8 text-center">{name}</p>
      </div>
    </div>,
    document.body
  );
}