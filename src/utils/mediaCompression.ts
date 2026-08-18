/**
 * Utilidades para comprimir imágenes y notas de voz en el cliente,
 * de modo que viajen más rápido con datos móviles. Cuando el usuario
 * elige "máxima calidad", se saltea la compresión y se envía el original.
 */

export interface CompressImageOptions {
  /** Dimensión máxima (ancho o alto) en píxeles. */
  maxDimension?: number;
  /** Calidad de compresión (0..1). */
  quality?: number;
}

export function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Carga una imagen desde un object URL, con soporte amplio de navegadores. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = src;
  });
}

/**
 * Comprime una imagen redimensionándola a una dimensión máxima y
 * re-codificándola como JPEG. Si la compresión no reduce el tamaño
 * (imagen ya chica o formato sin mejora), devuelve el archivo original.
 */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  const { maxDimension = 1600, quality = 0.72 } = options;

  // Los GIF animados no se re-codifican (perderían la animación).
  if (file.type === 'image/gif') return file;

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await loadImage(objectUrl);

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return file;

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // JPEG no tiene canal alfa: pintamos fondo blanco para evitar transparencias negras.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob) return file;

    // Si no logramos reducir el tamaño, mandamos el original.
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagen';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Devuelve el bitrate de grabación para notas de voz.
 * En modo comprimido usamos un bitrate bajo para que el audio pese poco;
 * en máxima calidad usamos un bitrate más alto.
 */
export function voiceNoteBitrate(highQuality: boolean): number {
  return highQuality ? 128000 : 48000;
}