import type { Recipe } from './types';

/** Longueur maximale acceptée pour une URL d'image (même borne que la contrainte SQL). */
export const MAX_IMAGE_URL_LENGTH = 2048;

/**
 * URL d'image affichable, ou `null`.
 * - `https:` uniquement (l'app est servie en HTTPS : pas de contenu mixte) ; `http:` est promu en `https:`,
 *   comme le font déjà les navigateurs pour les images ;
 * - pas d'identifiants dans l'URL, longueur bornée.
 */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_IMAGE_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
  const out = url.toString();
  return out.length <= MAX_IMAGE_URL_LENGTH ? out : null;
}

/** CDN d'images de Marmiton : la taille est encodée dans le nom (`…_w225h225c1cx960cy540….webp`). */
const AFCDN_SIZE = /^(https:\/\/assets\.afcdn\.com\/recipe\/\d+\/\d+_)w\d+h\d+(?:c1)?(cx\d+cy\d+)/i;
const PX_STEP = 60;
const PX_MAX = 1200;

/**
 * Variante carrée de `px` pixels quand le CDN sait redimensionner (Marmiton : 10 Ko au lieu de 70 Ko
 * pour une vignette). Les autres URL sont renvoyées telles quelles.
 */
export function sizedImageUrl(url: string, px: number): string {
  const m = AFCDN_SIZE.exec(url);
  if (!m) return url;
  const n = Math.min(PX_MAX, Math.max(PX_STEP, Math.ceil(px / PX_STEP) * PX_STEP));
  return url.replace(AFCDN_SIZE, `$1w${n}h${n}c1$2`);
}

/** `srcset` 1x/2x/3x pour une image affichée sur `cssPx` pixels, ou `undefined` si le CDN est inconnu. */
export function imageSrcSet(url: string, cssPx: number): string | undefined {
  if (!AFCDN_SIZE.test(url)) return undefined;
  return [1, 2, 3].map((d) => `${sizedImageUrl(url, cssPx * d)} ${d}x`).join(', ');
}

const NOT_AN_INGREDIENT = new Set(['—', '-', '']);

/**
 * Requêtes de recherche d'une photo pour une recette, de la plus précise à la plus large :
 * le nom du plat, puis ses deux premiers ingrédients (utile pour « Veggie tomato mix »).
 */
export function imageQueries(recipe: Pick<Recipe, 'name' | 'ingredients'>): string[] {
  const name = recipe.name.replace(/\s+/g, ' ').trim();
  const ingredients = recipe.ingredients
    .map((i) => i.replace(/\s+/g, ' ').trim())
    .filter((i) => !NOT_AN_INGREDIENT.has(i) && i.length <= 40)
    .slice(0, 2)
    .join(' ');
  const out: string[] = [];
  for (const q of [name, ingredients]) {
    if (q.length >= 2 && !out.some((x) => x.toLowerCase() === q.toLowerCase())) out.push(q.slice(0, 80));
  }
  return out;
}
