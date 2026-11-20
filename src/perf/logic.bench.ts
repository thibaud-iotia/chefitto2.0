/**
 * Benchmarks de la logique métier : `npm run bench`. Informatifs (pas de seuil : la vitesse dépend de la machine) ;
 * les garde-fous déterministes sont dans `complexity.test.ts`.
 * « référence » = l'implémentation d'origine, sans index ni cache, pour mesurer le gain.
 */
import { test } from 'vitest';
import * as icons from '../domain/foodIcons';
import * as logic from '../domain/logic';
import type { FridgeItem, Recipe } from '../domain/types';
import { bigFridge, bigRecipes } from '../test/bigData';

// Copies locales : un import ESM passe par un getter du module runner à chaque appel, ce qui fausserait la mesure.
const { foodIcon } = icons;
const { filterRecipes, matchPct, normalize, rankBySuggestion } = logic;

/* ---------- Implémentations d'origine (référence) ---------- */
function naiveHas(fridge: readonly Pick<FridgeItem, 'name'>[], ingredient: string): boolean {
  const b = normalize(ingredient);
  if (!b) return false;
  return fridge.some((f) => {
    const a = normalize(f.name);
    return a.length > 0 && (a.includes(b) || b.includes(a));
  });
}
const naiveScore = (r: Recipe, fridge: FridgeItem[]) =>
  r.ingredients.length ? r.ingredients.filter((i) => naiveHas(fridge, i)).length / r.ingredients.length : 0;
function naiveRank(recipes: Recipe[], fridge: FridgeItem[]) {
  return recipes
    .map((r, i) => ({ r, i, s: naiveScore(r, fridge) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}
function naiveFilter(recipes: Recipe[], query: string, favorites: string[]) {
  const q = normalize(query);
  return recipes.filter((r) => favorites.includes(r.id) && (!q || normalize(r.name).includes(q)));
}

const recipes = bigRecipes(500);
const fridge = bigFridge(100);
const many = bigRecipes(1000);
const favorites = many.filter((_, i) => i % 2 === 0).map((r) => r.id);

test('accueil : classement + score de chaque carte (500 recettes × 100 aliments)', async ({ bench }) => {
  await bench.compare(
    bench('référence', () => {
      naiveRank(recipes, fridge);
      for (const r of recipes) Math.round(naiveScore(r, fridge) * 100);
    }),
    bench('nouveau frigo à chaque fois (aliment ajouté / retiré)', () => {
      const f = [...fridge];
      rankBySuggestion(recipes, f);
      for (const r of recipes) matchPct(r, f);
    }),
    bench('même frigo (re-rendu)', () => {
      rankBySuggestion(recipes, fridge);
      for (const r of recipes) matchPct(r, fridge);
    }),
  );
});

test('recherche dans les favoris (1000 recettes, 500 favoris)', async ({ bench }) => {
  await bench.compare(
    bench('référence', () => {
      naiveFilter(many, 'tomate', favorites);
    }),
    bench('actuelle', () => {
      filterRecipes(many, { category: 'fav', query: 'tomate', favorites });
    }),
  );
});

test('icône des aliments (100 aliments, re-rendu du frigo)', async ({ bench }) => {
  await bench('foodIcon', () => {
    for (const f of fridge) foodIcon(f.name, f.category);
  }).run();
});
