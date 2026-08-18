import { useState } from 'react';

interface SendQualityModalProps {
  open: boolean;
  kind: 'photo' | 'voice';
  onClose: () => void;
  onChoose: (highQuality: boolean) => void | Promise<void>;
}

export default function SendQualityModal({
  open,
  kind,
  onClose,
  onChoose,
}: SendQualityModalProps) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const isVoice = kind === 'voice';
  const title = isVoice ? 'Calidad de grabación' : 'Calidad de envío';
  const subtitle = isVoice
    ? '¿Cómo querés grabar la nota de voz?'
    : '¿Cómo querés enviar estas fotos?';

  const handlePick = async (highQuality: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await onChoose(highQuality);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-xl p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-base font-semibold text-gray-800">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer flex-shrink-0"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => handlePick(false)}
            disabled={busy}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-60 text-left"
          >
            <span className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <i className="ri-timer-flash-line text-lg text-emerald-600"></i>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-800">Comprimir</span>
              <span className="block text-xs text-gray-500">Más liviano · ideal para datos móviles</span>
            </span>
            {busy && <i className="ri-loader-4-line animate-spin text-emerald-600 flex-shrink-0"></i>}
          </button>

          <button
            onClick={() => handlePick(true)}
            disabled={busy}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-60 text-left"
          >
            <span className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <i className="ri-star-line text-lg text-amber-600"></i>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-800">Máxima calidad</span>
              <span className="block text-xs text-gray-500">Archivo original · más pesado</span>
            </span>
            {busy && <i className="ri-loader-4-line animate-spin text-amber-600 flex-shrink-0"></i>}
          </button>
        </div>
      </div>
    </div>
  );
}