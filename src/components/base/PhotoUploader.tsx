import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const BUCKET = 'casetilla-fotos';
const PHOTO_UPLOADED_EVENT = 'casetilla:photo-uploaded';

interface PhotoUploadedEventDetail {
  sessionKey: string;
  urls: string[];
}

export interface PhotoItem {
  id: string;
  /** objectURL para preview inmediato, o URL remota cuando done */
  previewUrl: string;
  uploadedUrl?: string;
  status: 'uploading' | 'done' | 'error';
  errorMsg?: string;
  /** Guardamos el File solo para retry — no afecta el render */
  _file?: File;
}

interface PhotoUploaderProps {
  orgId: string;
  folder: string;
  /** Recibe el array completo de PhotoItem en vuelo — incluyendo uploading */
  onChange: (photos: PhotoItem[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
  initialUrls?: string[];
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
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Error cargando imagen')); };
    img.src = objectUrl;
  });
}

async function uploadPhotoToStorage(file: File, orgId: string, folder: string): Promise<string> {
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
  // ── Ref estable para onChange — nunca stale closure en Promises ──────────
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // ── Estado principal ─────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<PhotoItem[]>(() => {
    // Restaurar desde sessionStorage (fotos subidas en sesión actual, remount de Android)
    if (sessionKey) {
      try {
        const raw = sessionStorage.getItem(sessionKey);
        if (raw) {
          const urls = JSON.parse(raw) as string[];
          if (urls.length) {
            return urls.map((url) => ({
              id: genId(),
              previewUrl: url,
              uploadedUrl: url,
              status: 'done' as const,
            }));
          }
        }
      } catch { /* ignore */ }
    }
    // Restaurar desde initialUrls (fotos ya subidas previamente)
    if (initialUrls.length) {
      return initialUrls.map((url) => ({
        id: genId(),
        previewUrl: url,
        uploadedUrl: url,
        status: 'done' as const,
      }));
    }
    return [];
  });

  const [bucketReady, setBucketReady] = useState(false);
  const mountedRef = useRef(true);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Preparar bucket ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.functions.invoke('fix-casetilla-storage-rls')
      .then(() => setBucketReady(true))
      .catch(() => setBucketReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rehidratación vía custom event (Android remount tras cámara) ─────────
  useEffect(() => {
    if (!sessionKey) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PhotoUploadedEventDetail>).detail;
      if (detail.sessionKey !== sessionKey) return;
      const restored: PhotoItem[] = detail.urls.map((url) => ({
        id: genId(),
        previewUrl: url,
        uploadedUrl: url,
        status: 'done' as const,
      }));
      setPhotos(restored);
      onChangeRef.current(restored);
    };
    window.addEventListener(PHOTO_UPLOADED_EVENT, handler);
    return () => window.removeEventListener(PHOTO_UPLOADED_EVENT, handler);
  }, [sessionKey]);

  // ── Notificar al padre de forma segura (fuera del render cycle) ──────────
  const notifyParent = useCallback((updatedPhotos: PhotoItem[]) => {
    setTimeout(() => {
      if (mountedRef.current) {
        onChangeRef.current(updatedPhotos);
      }
    }, 0);
  }, []);

  // ── Subir una foto y actualizar solo su celda ────────────────────────────
  const uploadOne = useCallback((item: PhotoItem) => {
    if (!item._file) return;

    uploadPhotoToStorage(item._file, orgId, folder)
      .then((url) => {
        // Persistir en sessionStorage ANTES del setState
        if (sessionKey) {
          try {
            const raw = sessionStorage.getItem(sessionKey);
            const prevUrls: string[] = raw ? (JSON.parse(raw) as string[]) : [];
            const merged = [...prevUrls.filter((u) => u !== url), url];
            sessionStorage.setItem(sessionKey, JSON.stringify(merged));

            if (!mountedRef.current) {
              // Componente desmontado (Android remount) — notificar vía event
              window.dispatchEvent(new CustomEvent<PhotoUploadedEventDetail>(PHOTO_UPLOADED_EVENT, {
                detail: { sessionKey, urls: merged },
              }));
              return;
            }
          } catch { /* noop */ }
        }

        if (!mountedRef.current) return;

        // Actualizar SOLO esta foto — setState funcional lee prev más reciente
        setPhotos((prev) => {
          const old = prev.find((p) => p.id === item.id);
          if (old?.previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(old.previewUrl);
          }
          const updated = prev.map((p) =>
            p.id === item.id
              ? { ...p, status: 'done' as const, uploadedUrl: url, previewUrl: url, _file: undefined }
              : p,
          );
          notifyParent(updated);
          return updated;
        });
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setPhotos((prev) => {
          const updated = prev.map((p) =>
            p.id === item.id
              ? { ...p, status: 'error' as const, errorMsg: String((err as Error)?.message ?? err) }
              : p,
          );
          notifyParent(updated);
          return updated;
        });
      });
  }, [orgId, folder, sessionKey, notifyParent]);

  // ── handleFileSelect: captura y preview ANTES del upload ────────────────
  // REGLA DE ORO:
  //   1. Los PhotoItem se crean con objectURL FUERA del setter funcional.
  //   2. El setter solo recibe el array ya construido — nunca crea datos.
  //   3. El upload arranca DESPUÉS de confirmar que el state fue aplicado.
  //   4. El padre se notifica INMEDIATAMENTE con los items en 'uploading'.
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Resetear input INMEDIATAMENTE — permite nueva captura sin esperar upload
    e.target.value = '';
    if (!files.length) return;

    // ── PASO 1: leer cuántas fotos hay AHORA de forma síncrona ──────────────
    // Usamos un snapshot del estado actual para calcular cuántas caben.
    // Esto es seguro porque handleFileSelect corre en el event handler (síncronamente),
    // no en un efecto asíncrono — el estado no puede cambiar en medio.
    setPhotos((prev) => {
      const remaining = maxPhotos - prev.length;
      if (remaining <= 0) return prev;

      const toProcess = files.slice(0, remaining);

      // ── PASO 2: crear items con objectURL — DENTRO del setter pero
      // los objectURLs son válidos porque files[] sigue vivo en este scope ──
      const newItems: PhotoItem[] = toProcess.map((file) => ({
        id: genId(),
        previewUrl: URL.createObjectURL(file),
        status: 'uploading' as const,
        _file: file,
      }));

      const nextState = [...prev, ...newItems];

      // ── PASO 3: notificar al padre con el estado completo (incluye uploading)
      // y arrancar los uploads — ambos en microtask para que React procese
      // el setState antes, garantizando que newItems están en el DOM ──────────
      setTimeout(() => {
        // Notificar al padre
        if (mountedRef.current) {
          onChangeRef.current(nextState);
        }
        // Arrancar upload de cada item — en este punto React ya aplicó el setState
        // y newItems es un array cerrado (no depende del setter funcional)
        newItems.forEach((item) => uploadOne(item));
      }, 0);

      return nextState;
    });
  };

  const retryUpload = (item: PhotoItem) => {
    if (!item._file) return;
    setPhotos((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading', errorMsg: undefined } : p)),
    );
    uploadOne(item);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl);
      const updated = prev.filter((p) => p.id !== id);
      notifyParent(updated);
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
