import { useEffect } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export function ConfirmModal({
  isOpen,
  type,
  title,
  message,
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  showCancel = false
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const iconConfig = {
    success: {
      icon: 'ri-checkbox-circle-line',
      bgColor: 'bg-green-100',
      textColor: 'text-green-600',
      borderColor: 'border-green-200'
    },
    warning: {
      icon: 'ri-alert-line',
      bgColor: 'bg-amber-100',
      textColor: 'text-amber-600',
      borderColor: 'border-amber-200'
    },
    error: {
      icon: 'ri-error-warning-line',
      bgColor: 'bg-red-100',
      textColor: 'text-red-600',
      borderColor: 'border-red-200'
    },
    info: {
      icon: 'ri-information-line',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-600',
      borderColor: 'border-blue-200'
    }
  };

  const config = iconConfig[type];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]"
      onClick={(e) => {
        if (e.target === e.currentTarget && onCancel) {
          onCancel();
        }
      }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Contenido */}
        <div className="p-6">
          {/* Icono */}
          <div className="flex justify-center mb-4">
            <div
              className={`w-16 h-16 rounded-full ${config.bgColor} border-2 ${config.borderColor} flex items-center justify-center`}
            >
              <i className={`${config.icon} text-3xl ${config.textColor}`}></i>
            </div>
          </div>

          {/* Título */}
          <h3 className="text-xl font-bold text-gray-900 text-center mb-2">{title}</h3>

          {/* Mensaje */}
          <p className="text-sm text-gray-600 text-center leading-relaxed">{message}</p>
        </div>

        {/* Botones */}
        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-3">
          {showCancel && onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium whitespace-nowrap"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
              type === 'success'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : type === 'warning'
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : type === 'error'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
