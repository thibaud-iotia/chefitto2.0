// Nombre de personnes d'une recette. Sans dépendance : importé par l'Edge Function `recipe-import` (Deno)
// comme par l'app (bundle navigateur), pour que l'import et l'affichage lisent le même nombre.

export const MIN_SERVINGS = 1;
/** Même borne que la contrainte SQL (`recipes.servings`, `profiles.household`). */
export const MAX_SERVINGS = 50;
/** Recette sans nombre de personnes connu (saisie ancienne, page sans `recipeYield`). */
export const DEFAULT_SERVINGS = 4;

/** Entier dans les bornes, sinon `null` (les décimales sont arrondies : « 2,5 » → 3). */
export function clampServings(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+(?:[.,]\d+)?\s*$/.test(value) ? Number(value.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= MIN_SERVINGS && r <= MAX_SERVINGS ? r : null;
}

/**
 * Unités qui désignent des convives. « 1 gâteau », « 20 cookies » ou « 1 litre » ne sont pas des personnes :
 * on ne s'en sert pas comme base de calcul des quantités.
 */
const PEOPLE = /^(?:personnes?|pers\b|parts?|portions?|couverts?|convives?|assiettes?|adultes?|people|persons?|servings?)/;

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lit le nombre de personnes d'un `recipeYield` schema.org (ou d'un texte saisi) :
 * `4`, `"4"`, `"4 personnes"`, `"Pour 6 parts"`, `"4-6 pers."` (→ 4), `["4", "4 personnes"]`, `{ value: 4 }`.
 * Renvoie `null` si aucun nombre de convives n'est lisible (« 1 gâteau », « 12 crêpes », vide…).
 */
export function parseServings(value: unknown, depth = 0): number | null {
  if (depth > 3 || value === null || value === undefined) return null;
  if (typeof value === 'number') return clampServings(value);
  if (Array.isArray(value)) {
    for (const v of value) {
      const n = parseServings(v, depth + 1);
      if (n !== null) return n;
    }
    return null;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return parseServings(o.value ?? o['@value'] ?? o.text ?? o.name, depth + 1);
  }
  if (typeof value !== 'string') return null;
  const m = /^(?:pour|serves?|for|environ|env\.?)?\s*(\d{1,3})(?:\s*(?:-|–|à|a|ou|to)\s*\d{1,3})?\s*(.*)$/.exec(fold(value));
  if (!m) return null;
  const rest = m[2]!;
  return rest === '' || PEOPLE.test(rest) ? clampServings(Number(m[1])) : null;
}
