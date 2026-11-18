import { clampServings, DEFAULT_SERVINGS, MAX_SERVINGS, MIN_SERVINGS } from '../../supabase/functions/_shared/servings.ts';

export { clampServings, DEFAULT_SERVINGS, MAX_SERVINGS, MIN_SERVINGS };
export { parseServings } from '../../supabase/functions/_shared/servings.ts';

/** Taille du foyer tant que l'utilisateur ne l'a pas réglée dans son profil. */
export const DEFAULT_HOUSEHOLD = 2;

/** « 1 personne », « 4 personnes ». */
export function servingsLabel(n: number): string {
  return `${n} personne${n > 1 ? 's' : ''}`;
}

/* ---------- Recalcul des quantités ---------- */

const GLYPHS: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };
/** Fractions « de cuisine » vers lesquelles on arrondit les petites quantités. */
const NICE: [number, string][] = [
  [0, ''],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [1, ''],
];

const G = '[½¼¾⅓⅔⅛]';
/** « 1 1/2 », « 1 ½ », « 1/2 », « ½ », « 1,5 », « 200 ». */
const QTY = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*${G}|\\d+\\/\\d+|${G}|\\d+(?:[.,]\\d+)?)`;
/** Quantité ou plage (« 2-3 », « 2 à 3 », « 2 ou 3 »). */
const AMOUNT = `${QTY}(?:\\s*[-–]\\s*${QTY}|\\s+(?:à|ou)\\s+${QTY})?`;
/** Quantité en tête (« 200 g de farine ») ou après un libellé (« Farine : 200 g »). Pas de chiffre collé derrière. */
const LEADING = new RegExp(`^(\\s*|[^:\\d]{1,60}:\\s*)(${AMOUNT})(?![\\d/.,])`);

function parseQty(raw: string): number | null {
  const t = raw.trim();
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null;
  m = new RegExp(`^(\\d+)\\s*(${G})$`).exec(t);
  if (m) return Number(m[1]) + GLYPHS[m[2]!]!;
  m = /^(\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  if (t in GLYPHS) return GLYPHS[t]!;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const decimalFr = (v: number, digits: number) => String(Number(v.toFixed(digits))).replace('.', ',');

/**
 * Quantité lisible en cuisine :
 * - ≥ 100 : arrondie à 5 près (333 g → 335 g) ; ≥ 10 : entier ;
 * - en dessous : écriture décimale si l'original l'était (« 0,75 l »), sinon fraction usuelle (« 1 ½ », « ⅓ »),
 *   ou une décimale quand aucune fraction ne tombe juste.
 */
export function formatQuantity(v: number, decimal = false): string {
  if (v >= 100) return String(Math.round(v / 5) * 5);
  if (v >= 10) return String(Math.round(v));
  if (decimal) return decimalFr(v, v < 1 ? 2 : 1);
  const whole = Math.floor(v);
  const [frac, glyph] = NICE.reduce((best, cur) => (Math.abs(cur[0] - (v - whole)) < Math.abs(best[0] - (v - whole)) ? cur : best));
  if (Math.abs(frac - (v - whole)) > 0.05 || (whole === 0 && frac === 0)) return decimalFr(v, v < 0.1 ? 2 : 1);
  const w = whole + (frac === 1 ? 1 : 0);
  if (!glyph) return String(w);
  return w ? `${w} ${glyph}` : glyph;
}

/**
 * Ingrédient recalculé pour `factor` fois plus de personnes : seule la quantité de tête est modifiée
 * (« 1 boîte de 400 g » → « 2 boîtes… » garde « 400 g »). Texte sans quantité lisible : inchangé.
 */
export function scaleIngredient(text: string, factor: number): string {
  if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return text;
  const m = LEADING.exec(text);
  if (!m) return text;
  const [whole, prefix, amount] = m as unknown as [string, string, string];
  const parts = amount.split(/(\s*[-–]\s*|\s+(?:à|ou)\s+)/);
  const scaled: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i % 2 === 1) {
      scaled.push(part); // séparateur de plage
      continue;
    }
    const q = parseQty(part);
    if (q === null) return text;
    scaled.push(formatQuantity(q * factor, /[.,]/.test(part)));
  }
  return prefix + scaled.join('') + text.slice(whole.length);
}

/** Facteur de recalcul pour passer de la recette (`base` personnes) à `target` personnes. */
export function servingsFactor(base: number, target: number): number {
  return base > 0 && target > 0 ? target / base : 1;
}
