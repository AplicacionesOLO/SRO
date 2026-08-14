import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  onPickFromGallery: () => void;
}

export default function CameraCapture({ onCapture, onClose, onPickFromGallery }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      setStarting(true);
      setError(null);
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('No se pudo acceder a la cámara. Revisá que le hayas dado permiso al navegador.');
      } finally {
        setStarting(false);
      }
    },
    [stopStream]
  );

  useEffect(() => {
    startCamera('environment');
    return () => stopStream();
  }, [startCamera, stopStream]);

  const switchCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      },
      'image/jpeg',
      0.85
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[10005] bg-black flex flex-col">
      <div className="relative flex-1 min-h-0">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <span className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-3">
              <i className="ri-camera-off-line text-white text-2xl"></i>
            </span>
            <p className="text-white text-sm leading-relaxed max-w-xs">{error}</p>
          </div>
        ) : (
          <>
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <i className="ri-loader-4-line text-white text-3xl animate-spin"></i>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
            />
          </>
        )}

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          title="Cerrar cámara"
        >
          <i className="ri-close-line text-white text-2xl"></i>
        </button>
      </div>

      <div className="h-28 bg-black flex items-center justify-center gap-10 flex-shrink-0">
        <button
          onClick={switchCamera}
          disabled={starting || !!error}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-40"
          title="Cambiar cámara"
        >
          <i className="ri-camera-switch-line text-white text-2xl"></i>
        </button>

        <button
          onClick={capture}
          disabled={starting || !!error}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer disabled:opacity-40"
          title="Tomar foto"
        >
          <span className="w-14 h-14 rounded-full border-2 border-black"></span>
        </button>

        <button
          onClick={onPickFromGallery}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          title="Elegir de la galería"
        >
          <i className="ri-image-line text-white text-2xl"></i>
        </button>
      </div>
    </div>,
    document.body
  );
}