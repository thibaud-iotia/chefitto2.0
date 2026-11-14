import {
  FOOD_CATEGORIES,
  type FoodCategory,
  type FridgeItem,
  type Plan,
  type Recipe,
  type RecipeCategory,
  type RecipeDraft,
} from './types';

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

/** Un ingrédient est « au frigo » si un aliment le contient ou y est contenu (ex. « Tomate » ↔ « Tomates cerises »). */
export function hasIngredient(fridge: readonly Pick<FridgeItem, 'name'>[], ingredient: string): boolean {
  const b = normalize(ingredient);
  if (!b) return false;
  return fridge.some((f) => {
    const a = normalize(f.name);
    return a.length > 0 && (a.includes(b) || b.includes(a));
  });
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
  return recipes.filter((r) => {
    const catOk =
      opts.category === 'all' ? true : opts.category === 'fav' ? opts.favorites.includes(r.id) : r.category === opts.category;
    return catOk && (!q || normalize(r.name).includes(q));
  });
}

export function groupFridge(items: readonly FridgeItem[]): { category: FoodCategory; items: FridgeItem[] }[] {
  return FOOD_CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter(
    (g) => g.items.length > 0,
  );
}

export function formatTime(min: number): string {
  return `${min} min`;
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

export function planKey(day: number, meal: number): string {
  return `${day}-${meal}`;
}

export function plannedCount(plan: Plan, recipeIds?: ReadonlySet<string>): number {
  return Object.values(plan).filter((id) => !recipeIds || recipeIds.has(id)).length;
}

export function dayHasMeal(plan: Plan, day: number): boolean {
  return Boolean(plan[planKey(day, 0)] || plan[planKey(day, 1)]);
}

/** Lundi = 0 … Dimanche = 6. */
export function weekdayIndex(date: Date = new Date()): number {
  return (date.getDay() + 6) % 7;
}

/* ---------- Formulaire nouvelle recette ---------- */

export interface RecipeForm {
  name: string;
  category: RecipeCategory;
  ingredients: string;
  description: string;
  steps: string[];
}

export const EMPTY_FORM: RecipeForm = { name: '', category: 'Plats', ingredients: '', description: '', steps: [''] };

export function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export type DraftResult = { ok: true; draft: RecipeDraft } | { ok: false; error: string };

export function buildRecipeDraft(form: RecipeForm): DraftResult {
  const name = form.name.trim();
  if (!name) return { ok: false, error: 'Donnez un nom au plat' };
  const ingredients = splitList(form.ingredients);
  const steps = form.steps.map((s) => s.trim()).filter(Boolean);
  return {
    ok: true,
    draft: {
      name,
      category: form.category,
      price: '—',
      timeMin: Math.max(10, steps.length * 10),
      level: 'Facile',
      description: form.description.trim() || 'Ma recette.',
      ingredients: ingredients.length ? ingredients : ['—'],
      steps: steps.length ? steps : ['Bon appétit !'],
    },
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
