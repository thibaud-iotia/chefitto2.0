import type { ScanImage } from './fridgeScan';

/** Grand côté conseillé pour la vision Claude : au-delà, l'image est réduite côté API (envoi inutile). */
export const MAX_EDGE = 1568;
const QUALITY = 0.82;

/** Dimensions réduites (proportions conservées) pour tenir dans `max` × `max`. Jamais d'agrandissement. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* format non géré par createImageBitmap (ex. HEIC sur certains navigateurs) : repli <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Impossible de lire cette photo. Essayez au format JPEG.');
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('Lecture de la photo impossible'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Redimensionne et recompresse une photo en JPEG (~200–400 Ko) avant l'envoi :
 * upload rapide en 4G, coût d'analyse réduit, orientation EXIF appliquée, métadonnées (GPS…) supprimées.
 */
export async function prepareImage(file: Blob): Promise<ScanImage> {
  const img = await decode(file);
  try {
    const { width, height } = fitWithin(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Traitement de la photo impossible sur cet appareil');
    ctx.drawImage(img.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('Traitement de la photo impossible sur cet appareil');
    return { mediaType: 'image/jpeg', data: await toBase64(blob) };
  } finally {
    img.close();
  }
}
