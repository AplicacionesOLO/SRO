import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const BUCKET = 'casetilla-fotos';

// ─── Custom event para bridgear gap de re-montajes tardíos ────────────────
// Cuando Android hace UNMOUNT antes de que termine el upload, el nuevo
// instance montado escucha este evento y se rehidrata con las URLs.
const PHOTO_UPLOADED_EVENT = 'casetilla:photo-uploaded';

interface PhotoUploadedEventDetail {
  sessionKey: string;
  urls: string[];
}
// ─────────────────────────────────────────────────────────────────────────

interface PhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

interface PhotoUploaderProps {
  orgId: string;
  folder: string;
  onChange: (urls: string[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
  /** URLs de fotos ya subidas — permite restaurar el estado visual tras un remount */
  initialUrls?: string[];
  /**
   * Clave de sessionStorage donde el uploader persiste las URLs subidas de forma
   * INMEDIATA (sin depender del ciclo React). Soluciona la race condition de Android
   * donde el unmount ocurre antes de que el useEffect del padre pueda escribir.
   */
  sessionKey?: string;
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function compressImage(file: File, maxWidth = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas no disponible')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('Compresión fallida')); },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Error cargando imagen')); };
    img.src = objectUrl;
  });
}

async function uploadPhotoToStorage(
  file: File,
  orgId: string,
  folder: string
): Promise<string> {
  const compressed = await compressImage(file);
  const path = `${orgId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

export default function PhotoUploader({
  orgId,
  folder,
  onChange,
  maxPhotos = 5,
  disabled = false,
  initialUrls = [],
  sessionKey,
}: PhotoUploaderProps) {
  // Inicializar desde initialUrls > sessionStorage[sessionKey] > []
  const [photos, setPhotos] = useState<PhotoItem[]>(() => {
    if (initialUrls.length) {
      return initialUrls.map((url) => ({
        id: genId(),
        file: new File([], 'restored.jpg', { type: 'image/jpeg' }),
        previewUrl: url,
        uploadedUrl: url,
        status: 'done' as const,
      }));
    }
    // Fallback: leer desde sessionStorage[sessionKey] si el padre no tenía datos
    if (sessionKey) {
      try {
        const raw = sessionStorage.getItem(sessionKey);
        if (raw) {
          const urls = JSON.parse(raw) as string[];
          if (urls.length) {
            return urls.map((url) => ({
              id: genId(),
              file: new File([], 'restored.jpg', { type: 'image/jpeg' }),
              previewUrl: url,
              uploadedUrl: url,
              status: 'done' as const,
            }));
          }
        }
      } catch { /* ignore */ }
    }
    return [];
  });

  const [bucketReady, setBucketReady] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  /** Indica si este instance todavía está montado en el DOM */
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Listener: rehidratación tardía vía custom event ──────────────────────
  // Si Android hace UNMOUNT mientras el upload estaba en curso, cuando la
  // Promise resuelve despacha este evento y el nuevo instance (ya montado)
  // actualiza su estado visual sin depender del padre.
  useEffect(() => {
    if (!sessionKey) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PhotoUploadedEventDetail>).detail;
      if (detail.sessionKey !== sessionKey) return;

      setPhotos(detail.urls.map((url) => ({
        id: genId(),
        file: new File([], 'restored.jpg', { type: 'image/jpeg' }),
        previewUrl: url,
        uploadedUrl: url,
        status: 'done' as const,
      })));

      onChange(detail.urls);
    };

    window.addEventListener(PHOTO_UPLOADED_EVENT, handler);
    return () => window.removeEventListener(PHOTO_UPLOADED_EVENT, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  useEffect(() => {
    supabase.functions.invoke('fix-casetilla-storage-rls')
      .then(() => setBucketReady(true))
      .catch(() => setBucketReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncUrls = (updated: PhotoItem[]) => {
    const urls = updated
      .filter((p) => p.status === 'done' && p.uploadedUrl)
      .map((p) => p.uploadedUrl!);
    onChange(urls);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    // Resetear el input para permitir re-selección del mismo archivo
    e.target.value = '';

    const remaining = maxPhotos - photos.length;
    const toProcess = files.slice(0, remaining);

    const newItems: PhotoItem[] = toProcess.map((file) => ({
      id: genId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'uploading' as const,
    }));

    setPhotos((prev) => [...prev, ...newItems]);

    await Promise.all(
      newItems.map((item) =>
        uploadPhotoToStorage(item.file, orgId, folder)
          .then((url) => {
            if (sessionKey) {
              try {
                const existing = sessionStorage.getItem(sessionKey);
                const prevUrls: string[] = existing ? JSON.parse(existing) as string[] : [];
                const merged = [...prevUrls.filter((u) => u !== url), url];
                sessionStorage.setItem(sessionKey, JSON.stringify(merged));

                // Despachar el evento SOLO si el componente ya no está montado
                // (escenario de remount de Android). En flujo normal el setPhotos
                // funcional de abajo es suficiente y evita reemplazar ítems en curso.
                if (!mountedRef.current) {
                  window.dispatchEvent(new CustomEvent<PhotoUploadedEventDetail>(PHOTO_UPLOADED_EVENT, {
                    detail: { sessionKey, urls: merged }
                  }));
                }
              } catch { /* noop */ }
            }

            // Solo actualizar state si el componente sigue montado
            if (!mountedRef.current) return;

            setPhotos((prev) => {
              const updated = prev.map((p) =>
                p.id === item.id ? { ...p, status: 'done' as const, uploadedUrl: url } : p
              );
              syncUrls(updated);
              return updated;
            });
          })
          .catch((err) => {
            if (!mountedRef.current) return;
            setPhotos((prev) => {
              const updated = prev.map((p) =>
                p.id === item.id
                  ? { ...p, status: 'error' as const, errorMsg: String(err?.message ?? err) }
                  : p
              );
              syncUrls(updated);
              return updated;
            });
          })
      )
    );
  };

  const retryUpload = async (item: PhotoItem) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading', errorMsg: undefined } : p))
    );
    try {
      const url = await uploadPhotoToStorage(item.file, orgId, folder);
      setPhotos((prev) => {
        const updated = prev.map((p) =>
          p.id === item.id ? { ...p, status: 'done' as const, uploadedUrl: url } : p
        );
        syncUrls(updated);
        return updated;
      });
    } catch (err) {
      setPhotos((prev) => {
        const updated = prev.map((p) =>
          p.id === item.id
            ? { ...p, status: 'error' as const, errorMsg: String((err as any)?.message ?? err) }
            : p
        );
        syncUrls(updated);
        return updated;
      });
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      const updated = prev.filter((p) => p.id !== id);
      syncUrls(updated);
      return updated;
    });
  };

  const openCamera = () => cameraInputRef.current?.click();
  const openGallery = () => galleryInputRef.current?.click();

  const isUploading = photos.some((p) => p.status === 'uploading');
  const canAdd = photos.length < maxPhotos && !disabled && bucketReady;

  return (
    <div className="space-y-3">
      {/* Input cámara */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
        disabled={disabled || !bucketReady}
      />

      {/* Input galería */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        className="hidden"
        onChange={handleFileSelect}
        disabled={disabled || !bucketReady}
      />

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-gray-700 shrink-0">
          Fotos{' '}
          <span className="text-gray-400 font-normal text-xs">
            ({photos.length}/{maxPhotos})
          </span>
          {isUploading && (
            <span className="ml-2 text-xs text-teal-600 inline-flex items-center gap-1">
              <i className="ri-loader-4-line animate-spin text-xs"></i>
              Subiendo...
            </span>
          )}
        </label>

        {canAdd && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={openCamera}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-camera-line text-sm"></i>
              Cámara
            </button>
            <button
              type="button"
              onClick={openGallery}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-image-2-line text-sm"></i>
              Galería
            </button>
          </div>
        )}
      </div>

      {/* Zona vacía */}
      {photos.length === 0 ? (
        <div className="w-full border-2 border-dashed border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            <button
              type="button"
              onClick={() => canAdd && openCamera()}
              disabled={!canAdd}
              className="py-6 flex flex-col items-center gap-2 text-gray-400 hover:bg-teal-50 hover:text-teal-500 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <i className="ri-camera-line text-2xl"></i>
              </div>
              <span className="text-sm font-medium">Tomar foto</span>
              <span className="text-xs text-gray-300">Abre la cámara</span>
            </button>
            <button
              type="button"
              onClick={() => canAdd && openGallery()}
              disabled={!canAdd}
              className="py-6 flex flex-col items-center gap-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <i className="ri-image-2-line text-2xl"></i>
              </div>
              <span className="text-sm font-medium">Elegir imagen</span>
              <span className="text-xs text-gray-300">Desde galería</span>
            </button>
          </div>
          <div className="text-center pb-2 text-xs text-gray-300">
            Máx. {maxPhotos} fotos · JPG, PNG, HEIC
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
            >
              <img
                src={photo.previewUrl}
                alt="Vista previa"
                className="w-full h-full object-cover"
              />

              {photo.status === 'uploading' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="w-6 h-6 flex items-center justify-center">
                    <i className="ri-loader-4-line text-white text-xl animate-spin"></i>
                  </div>
                </div>
              )}

              {photo.status === 'error' && (
                <div className="absolute inset-0 bg-red-500/20 flex flex-col items-center justify-center gap-1 p-1">
                  <div className="w-5 h-5 flex items-center justify-center">
                    <i className="ri-error-warning-line text-red-600 text-lg"></i>
                  </div>
                  <button
                    type="button"
                    onClick={() => retryUpload(photo)}
                    className="text-xs text-red-700 font-medium bg-white/80 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {photo.status === 'done' && (
                <div className="absolute top-1 left-1 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center">
                  <i className="ri-check-line text-white text-xs"></i>
                </div>
              )}

              {photo.status !== 'uploading' && !disabled && (
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors"
                >
                  <i className="ri-close-line text-white text-xs"></i>
                </button>
              )}
            </div>
          ))}

          {canAdd && (
            <>
              <button
                type="button"
                onClick={openCamera}
                className="aspect-square rounded-lg border-2 border-dashed border-teal-200 flex flex-col items-center justify-center gap-1 text-teal-400 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-camera-line text-xl"></i>
                </div>
                <span className="text-xs">Cámara</span>
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-image-2-line text-xl"></i>
                </div>
                <span className="text-xs">Galería</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
