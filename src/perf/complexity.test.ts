/**
 * Budget de calcul : nombre de normalisations de texte (accents, casse) effectuées par la logique métier.
 * Indépendant de la vitesse de la machine : on compte les appels à `String.prototype.normalize`
 * (`normalize()` du domaine l'appelle exactement une fois). Un algorithme quadratique ou un cache cassé
 * fait exploser le compte bien avant de se voir au chronomètre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterRecipes, haveCount, hasIngredient, matchPct, rankBySuggestion, cookableCount } from '../domain/logic';
import { bigFridge, bigRecipes } from '../test/bigData';

let normalizations: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  normalizations = vi.spyOn(String.prototype, 'normalize');
});
afterEach(() => normalizations.mockRestore());

const count = (fn: () => unknown) => {
  normalizations.mockClear();
  fn();
  return normalizations.mock.calls.length;
};

const recipes = bigRecipes(1000);
const distinctIngredients = new Set(recipes.flatMap((r) => r.ingredients)).size;

describe('score frigo', () => {
  it('classer 1000 recettes normalise chaque texte au plus une fois', () => {
    const fridge = bigFridge(100);
    // Naïf : 1000 recettes × 8 ingrédients × (1 + 100 aliments) ≈ 800 000 normalisations.
    expect(count(() => rankBySuggestion(recipes, fridge))).toBeLessThanOrEqual(distinctIngredients + fridge.length);
  });

  it('même frigo : les calculs suivants (cartes, compteurs) ne normalisent plus rien', () => {
    const fridge = bigFridge(100);
    rankBySuggestion(recipes, fridge);
    expect(
      count(() => {
        rankBySuggestion(recipes, fridge);
        cookableCount(recipes, fridge);
        for (const r of recipes) {
          matchPct(r, fridge);
          haveCount(r, fridge);
        }
      }),
    ).toBe(0);
  });

  it('nouveau frigo (aliment ajouté) : on repart de zéro, sans quadratique', () => {
    const fridge = bigFridge(100);
    rankBySuggestion(recipes, fridge);
    const next = [...fridge, { id: 'x', name: 'Topinambour', category: 'Légume' as const }];
    expect(count(() => rankBySuggestion(recipes, next))).toBeLessThanOrEqual(distinctIngredients + next.length);
  });

  it('le cache suit le contenu : un frigo différent donne un résultat différent', () => {
    expect(hasIngredient([{ name: 'Riz' }], '200 g de Riz')).toBe(true);
    expect(hasIngredient([{ name: 'Lait' }], '200 g de Riz')).toBe(false);
    expect(hasIngredient([], '200 g de Riz')).toBe(false);
  });
});

describe('recherche de recettes', () => {
  it('chaque nouvelle frappe ne normalise que la requête', () => {
    filterRecipes(recipes, { category: 'all', query: 'r', favorites: [] });
    expect(count(() => filterRecipes(recipes, { category: 'all', query: 're', favorites: [] }))).toBe(1);
    expect(count(() => filterRecipes(recipes, { category: 'Plats', query: 'tomate', favorites: [] }))).toBe(1);
  });

  it('une recette modifiée (nouvel objet) est renormalisée', () => {
    const [first, ...rest] = recipes;
    const renamed = { ...first!, name: 'Gratin dauphinois' };
    expect(filterRecipes([renamed, ...rest], { category: 'all', query: 'dauphinois', favorites: [] })).toEqual([renamed]);
  });
});
