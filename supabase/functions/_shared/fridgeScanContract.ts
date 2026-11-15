// Contrat de l'API `fridge-scan`, sans dépendance : importable par l'app (bundle navigateur) comme par le serveur.

export const MAX_IMAGES = 4;
/** Limite de l'API Claude par image (octets décodés). Le client redimensionne bien en dessous (~300 Ko). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Garde-fou sur le corps JSON (4 images base64 + marge). */
export const MAX_BODY_BYTES = Math.ceil((MAX_IMAGES * MAX_IMAGE_BYTES * 4) / 3) + 64 * 1024;

/** Copie de `src/domain/types.ts` (le bundle Deno ne sort pas de `supabase/functions`) ; égalité testée. */
export const SCAN_CATEGORIES = ['Légume', 'Fruit', 'Viande', 'Poisson', 'Autre'] as const;
export type ScanCategory = (typeof SCAN_CATEGORIES)[number];

export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type ScanMediaType = (typeof MEDIA_TYPES)[number];

export interface ScanImage {
  mediaType: ScanMediaType;
  /** Base64 sans préfixe `data:`. */
  data: string;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface DetectedFood {
  name: string;
  category: ScanCategory;
  confidence: Confidence;
}

export type ScanResponseBody = { items: DetectedFood[] } | { error: string };
