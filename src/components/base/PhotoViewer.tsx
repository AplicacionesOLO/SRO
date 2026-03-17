import { useState, useEffect, useCallback } from 'react';

interface PhotoViewerProps {
  photos: string[];
  isOpen: boolean;
  initialIndex?: number;
  onClose: () => void;
}

export default function PhotoViewer({ photos, isOpen, initialIndex = 0, onClose }: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setIsLoading(true);
  }, [initialIndex, isOpen]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
    setIsLoading(true);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    setIsLoading(true);
  }, [photos.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, goNext, goPrev]);

  if (!isOpen || photos.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Container */}
      <div
        className="relative flex flex-col items-center w-full h-full max-w-4xl mx-auto px-4 py-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-4 z-10">
          <span className="text-white/70 text-sm font-medium">
            {currentIndex + 1} / {photos.length}
          </span>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-white text-xl"></i>
          </button>
        </div>

        {/* Image area */}
        <div className="flex-1 flex items-center justify-center w-full relative mt-10">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
          <img
            key={photos[currentIndex]}
            src={photos[currentIndex]}
            alt={`Foto ${currentIndex + 1}`}
            onLoad={() => setIsLoading(false)}
            onError={() => setIsLoading(false)}
            className={`max-h-[70vh] max-w-full object-contain rounded-lg transition-opacity duration-200 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          />
        </div>

        {/* Navigation arrows */}
        {photos.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 transition-colors cursor-pointer"
            >
              <i className="ri-arrow-left-s-line text-white text-2xl"></i>
            </button>
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 transition-colors cursor-pointer"
            >
              <i className="ri-arrow-right-s-line text-white text-2xl"></i>
            </button>
          </>
        )}

        {/* Thumbnails strip */}
        {photos.length > 1 && (
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1 max-w-full">
            {photos.map((url, idx) => (
              <button
                key={url}
                onClick={() => { setCurrentIndex(idx); setIsLoading(true); }}
                className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                  idx === currentIndex
                    ? 'border-white opacity-100'
                    : 'border-transparent opacity-50 hover:opacity-75'
                }`}
              >
                <img
                  src={url}
                  alt={`Miniatura ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
