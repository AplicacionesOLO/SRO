import { useState } from 'react';
import { createPortal } from 'react-dom';
import PhotoViewer from '../../../components/base/PhotoViewer';

/**
 * Miniaturas de fotos que abren el visor. El visor se monta en el elemento de pantalla
 * completa (si lo hay) para que también se vea con la escena en pantalla completa.
 */
export default function PhotoStrip({ label, icon, photos, max = 6 }: { label: string; icon: string; photos: string[]; max?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const shown = photos.slice(0, max);
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-gray-600">
        <i className={icon}></i>
        {label}
        <span className="font-normal text-gray-400">· {photos.length}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((url, idx) => (
          <button
            key={url}
            onClick={() => setOpen(idx)}
            className="relative h-14 w-14 overflow-hidden rounded-md border border-gray-200 hover:border-teal-500 cursor-pointer"
            title={`Ver foto ${idx + 1} de ${photos.length}`}
          >
            <img src={url} alt={`${label} ${idx + 1}`} loading="lazy" className="h-full w-full object-cover" />
            {idx === shown.length - 1 && photos.length > shown.length && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-bold text-white">
                +{photos.length - shown.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {open !== null &&
        createPortal(
          <PhotoViewer photos={photos} isOpen initialIndex={open} onClose={() => setOpen(null)} />,
          (document.fullscreenElement as HTMLElement | null) ?? document.body
        )}
    </div>
  );
}
