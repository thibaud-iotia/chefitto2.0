import { addDays, isIsoDate, type IsoDate } from './calendar';
import {
  FOOD_CATEGORIES,
  MEALS,
  type FoodCategory,
  type FridgeItem,
  type Level,
  type Plan,
  type Recipe,
  type RecipeCategory,
  type RecipeDraft,
} from './types';
import { safeImageUrl } from './images';
import { clampServings, DEFAULT_SERVINGS } from './servings';

/** Minuscule, sans accents ni ligatures, espaces normalisés. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type FridgeList = readonly Pick<FridgeItem, 'name'>[];

/**
 * Index d'un frigo : noms normalisés une seule fois, réponses mémorisées par ingrédient.
 * Clé = le tableau lui-même (le store le remplace à chaque modification, jamais muté) : un nouveau frigo
 * repart d'un index vide, l'ancien est libéré avec lui (WeakMap).
 */
interface FridgeIndex {
  names: string[];
  answers: Map<string, boolean>;
}
const fridgeIndexes = new WeakMap<FridgeList, FridgeIndex>();

function fridgeIndex(fridge: FridgeList): FridgeIndex {
  let ix = fridgeIndexes.get(fridge);
  if (!ix) {
    ix = { names: fridge.map((f) => normalize(f.name)).filter(Boolean), answers: new Map() };
    fridgeIndexes.set(fridge, ix);
  }
  return ix;
}

/** Ingrédients normalisés une seule fois par texte (bornée : les textes viennent des recettes de l'utilisateur). */
const normalizedText = new Map<string, string>();
const NORMALIZED_MAX = 5000;
function normalizeCached(s: string): string {
  let n = normalizedText.get(s);
  if (n === undefined) {
    if (normalizedText.size >= NORMALIZED_MAX) normalizedText.clear();
    n = normalize(s);
    normalizedText.set(s, n);
  }
  return n;
}

/** Un ingrédient est « au frigo » si un aliment le contient ou y est contenu (ex. « Tomate » ↔ « Tomates cerises »). */
export function hasIngredient(fridge: FridgeList, ingredient: string): boolean {
  const ix = fridgeIndex(fridge);
  let ok = ix.answers.get(ingredient);
  if (ok === undefined) {
    const b = normalizeCached(ingredient);
    ok = b.length > 0 && ix.names.some((a) => a.includes(b) || b.includes(a));
    ix.answers.set(ingredient, ok);
  }
  return ok;
}

export function matchScore(recipe: Pick<Recipe, 'ingredients'>, fridge: readonly Pick<FridgeItem, 'name'>[]): number {
  if (recipe.ingredients.length === 0) return 0;
  return recipe.ingredients.filter((i) => hasIngredient(fridge, i)).length / recipe.ingredients.length;
}

export function matchPct(recipe: Pick<Recipe, 'ingredients'>, fridge: readonly Pick<FridgeItem, 'name'>[]): number {
  return Math.round(matchScore(recipe, fridge) * 100);
}

export function haveCount(recipe: Pick<Recipe, 'ingredients'>, fridge: readonly Pick<FridgeItem, 'name'>[]): number {
  return recipe.ingredients.filter((i) => hasIngredient(fridge, i)).length;
}

export type BadgeTone = 'success' | 'warning' | 'neutral';
export function badgeTone(pct: number): BadgeTone {
  if (pct >= 70) return 'success';
  if (pct >= 40) return 'warning';
  return 'neutral';
}

export type RingTone = 'accent' | 'amber' | 'brand';
export function ringTone(pct: number): RingTone {
  if (pct >= 70) return 'accent';
  if (pct >= 40) return 'amber';
  return 'brand';
}

export const COOKABLE_THRESHOLD = 0.7;

/** Tri stable décroissant par score frigo. */
export function rankBySuggestion<T extends Pick<Recipe, 'ingredients'>>(recipes: readonly T[], fridge: readonly Pick<FridgeItem, 'name'>[]): T[] {
  return recipes
    .map((r, i) => ({ r, i, s: matchScore(r, fridge) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

export function cookableCount(recipes: readonly Recipe[], fridge: readonly FridgeItem[]): number {
  return recipes.filter((r) => matchScore(r, fridge) >= COOKABLE_THRESHOLD).length;
}

export type CategoryFilter = 'all' | 'fav' | RecipeCategory;

export function filterRecipes(
  recipes: readonly Recipe[],
  opts: { category: CategoryFilter; query: string; favorites: readonly string[] },
): Recipe[] {
  const q = normalize(opts.query);
  const favs = opts.category === 'fav' ? new Set(opts.favorites) : null;
  return recipes.filter((r) => {
    const catOk = opts.category === 'all' ? true : favs ? favs.has(r.id) : r.category === opts.category;
    return catOk && (!q || normalizedName(r).includes(q));
  });
}

/** Nom normalisé d'une recette, calculé une fois par objet (une recette modifiée est un nouvel objet). */
const recipeNames = new WeakMap<Pick<Recipe, 'name'>, string>();
function normalizedName(r: Pick<Recipe, 'name'>): string {
  let n = recipeNames.get(r);
  if (n === undefined) {
    n = normalize(r.name);
    recipeNames.set(r, n);
  }
  return n;
}

export function groupFridge(items: readonly FridgeItem[]): { category: FoodCategory; items: FridgeItem[] }[] {
  return FOOD_CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter(
    (g) => g.items.length > 0,
  );
}

export function formatTime(min: number): string {
  return `${min} min`;
}

/** Même aliment, au pluriel près (« Tomates » = « Tomate », « Poireaux » = « Poireau ») ; « Lait » ≠ « Laitue ». */
export function sameFood(a: string, b: string): boolean {
  const ka = foodKey(a);
  return ka.length > 0 && ka === foodKey(b);
}

/** Clé de comparaison d'un aliment : normalisé, chaque mot au singulier (« Poireaux » → « poireau »). */
export function foodKey(s: string): string {
  return normalize(s)
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
    .join(' ');
}

export function capitalize(s: string): string {
  const t = s.trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/* ---------- Planning ---------- */

/** Clé d'un créneau : `AAAA-MM-JJ:repas` (repas 0 = midi, 1 = soir). */
export function planKey(date: IsoDate, meal: number): string {
  return `${date}:${meal}`;
}

const PLAN_KEY_RE = /^(\d{4}-\d{2}-\d{2}):([01])$/;

/** Date et repas d'une clé du planning ; `null` si la clé n'est pas au format daté. */
export function parsePlanKey(key: string): { date: IsoDate; meal: number } | null {
  const m = PLAN_KEY_RE.exec(key);
  return m && isIsoDate(m[1]) ? { date: m[1], meal: Number(m[2]) } : null;
}

/** Créneaux remplis parmi les `dates` données (recettes supprimées ignorées si `recipeIds` est fourni). */
export function plannedCount(plan: Plan, dates: readonly IsoDate[], recipeIds?: ReadonlySet<string>): number {
  let n = 0;
  for (const date of dates)
    for (let meal = 0; meal < MEALS.length; meal++) {
      const id = plan[planKey(date, meal)];
      if (id && (!recipeIds || recipeIds.has(id))) n++;
    }
  return n;
}

/** Repas prévus à partir d'aujourd'hui (inclus). */
export function upcomingCount(plan: Plan, today: IsoDate, recipeIds?: ReadonlySet<string>): number {
  return Object.entries(plan).filter(([key, id]) => {
    const slot = parsePlanKey(key);
    return slot && slot.date >= today && (!recipeIds || recipeIds.has(id));
  }).length;
}

export function dayHasMeal(plan: Plan, date: IsoDate): boolean {
  return MEALS.some((_, meal) => Boolean(plan[planKey(date, meal)]));
}

/**
 * Ancien planning « semaine type » (clés `jour-repas`, jour 0 = lundi) → repas datés de la semaine
 * commençant le lundi `week`. Les clés déjà datées sont gardées, les clés inconnues ignorées.
 */
export function datedPlan(plan: Readonly<Record<string, string>>, week: IsoDate): Plan {
  const out: Plan = {};
  for (const [key, id] of Object.entries(plan)) {
    if (typeof id !== 'string' || !id) continue;
    if (parsePlanKey(key)) out[key] = id;
    const legacy = /^([0-6])-([01])$/.exec(key);
    if (legacy) out[planKey(addDays(week, Number(legacy[1])), Number(legacy[2]))] ??= id;
  }
  return out;
}

/* ---------- Formulaire nouvelle recette ---------- */

/** Infos reprises d'une recette importée, non éditées dans le formulaire. */
export interface ImportMeta {
  timeMin: number;
  level: Level;
  price: string;
  source: { name: string; url: string } | null;
}

export interface RecipeForm {
  name: string;
  category: RecipeCategory;
  ingredients: string;
  description: string;
  steps: string[];
  meta: ImportMeta | null;
  /** Nombre de personnes ; `null` tant qu'il n'est ni importé ni réglé : on propose alors la taille du foyer. */
  servings: number | null;
  /** Photo de la recette importée ; sinon une photo sera cherchée automatiquement après l'ajout. */
  imageUrl: string | null;
}

export const EMPTY_FORM: RecipeForm = {
  name: '',
  category: 'Plats',
  ingredients: '',
  description: '',
  steps: [''],
  meta: null,
  servings: null,
  imageUrl: null,
};

/** Un élément par ligne si le texte en contient plusieurs (recettes importées, « 1,5 l de lait »), sinon séparés par des virgules. */
export function splitList(s: string): string[] {
  return s
    .split(/\r?\n/.test(s.trim()) ? /\r?\n/ : ',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export type DraftResult = { ok: true; draft: RecipeDraft } | { ok: false; error: string };

/** `defaultServings` : taille du foyer, si le formulaire n'a pas de nombre de personnes. */
export function buildRecipeDraft(form: RecipeForm, defaultServings: number = DEFAULT_SERVINGS): DraftResult {
  const name = form.name.trim();
  if (!name) return { ok: false, error: 'Donnez un nom au plat' };
  const ingredients = splitList(form.ingredients);
  const steps = form.steps.map((s) => s.trim()).filter(Boolean);
  return {
    ok: true,
    draft: {
      name,
      category: form.category,
      price: form.meta?.price ?? '—',
      timeMin: form.meta?.timeMin ?? Math.max(10, steps.length * 10),
      level: form.meta?.level ?? 'Facile',
      description: form.description.trim() || 'Ma recette.',
      ingredients: ingredients.length ? ingredients : ['—'],
      steps: steps.length ? steps : ['Bon appétit !'],
      servings: clampServings(form.servings) ?? clampServings(defaultServings) ?? DEFAULT_SERVINGS,
      imageUrl: safeImageUrl(form.imageUrl),
    },
  };
}

/**
 * Formulaire pré-rempli pour modifier une recette existante. Temps, niveau et coût sont conservés
 * (non éditables dans le formulaire) ; les valeurs de remplissage de `buildRecipeDraft` redeviennent vides.
 */
export function recipeToForm(r: Recipe): RecipeForm {
  const ingredients = r.ingredients.filter((i) => i.trim() && i !== '—');
  return {
    name: r.name,
    category: r.category,
    ingredients: ingredients.join('\n'),
    description: r.description === 'Ma recette.' ? '' : r.description,
    steps: r.steps.length ? [...r.steps] : [''],
    meta: { timeMin: r.timeMin, level: r.level, price: r.price, source: null },
    servings: r.servings,
    imageUrl: safeImageUrl(r.imageUrl),
  };
}

/** Ids présents dans le plan et les favoris, sans les recettes supprimées. */
export function withoutRecipes(plan: Plan, favorites: readonly string[], ids: ReadonlySet<string>): { plan: Plan; favorites: string[] } {
  return {
    plan: Object.fromEntries(Object.entries(plan).filter(([, id]) => !ids.has(id))),
    favorites: favorites.filter((id) => !ids.has(id)),
  };
}

export function moveItem<T>(arr: readonly T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || index >= arr.length || j < 0 || j >= arr.length) return arr.slice();
  const out = arr.slice();
  [out[index], out[j]] = [out[j]!, out[index]!];
  return out;
}

export function removeStep(steps: readonly string[], index: number): string[] {
  const out = steps.filter((_, i) => i !== index);
  return out.length ? out : [''];
}

/* ---------- Validation auth ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuth(
  mode: 'login' | 'signup',
  v: { email: string; password: string; confirm?: string },
): string | null {
  if (!EMAIL_RE.test(v.email.trim())) return 'Email invalide';
  if (v.password.length < 6) return 'Mot de passe : 6 caractères minimum';
  if (mode === 'signup' && v.password !== v.confirm) return 'Les mots de passe ne correspondent pas';
  return null;
}
