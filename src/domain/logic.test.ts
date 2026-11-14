import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM,
  badgeTone,
  buildRecipeDraft,
  capitalize,
  cookableCount,
  dayHasMeal,
  filterRecipes,
  formatTime,
  groupFridge,
  hasIngredient,
  haveCount,
  initials,
  matchPct,
  matchScore,
  moveItem,
  normalize,
  planKey,
  plannedCount,
  rankBySuggestion,
  removeStep,
  ringTone,
  splitList,
  validateAuth,
  weekdayIndex,
} from './logic';
import type { FridgeItem, Recipe } from './types';

const fridge: FridgeItem[] = [
  { id: 'f1', name: 'Tomate', category: 'Légume' },
  { id: 'f2', name: 'Oignon', category: 'Légume' },
  { id: 'f3', name: 'Citron', category: 'Fruit' },
  { id: 'f4', name: 'Œuf', category: 'Autre' },
];

const r = (id: string, ingredients: string[], extra: Partial<Recipe> = {}): Recipe => ({
  id,
  name: `Recette ${id}`,
  category: 'Plats',
  price: '—',
  timeMin: 10,
  level: 'Facile',
  description: '',
  ingredients,
  steps: ['a'],
  ...extra,
});

describe('normalize', () => {
  it('retire accents, ligatures, casse et espaces', () => {
    expect(normalize('  Œuf  Brouillé ')).toBe('oeuf brouille');
    expect(normalize('Crème Fraîche')).toBe('creme fraiche');
  });
});

describe('hasIngredient', () => {
  it('match dans les deux sens et sans accents', () => {
    expect(hasIngredient(fridge, 'Tomates cerises')).toBe(true);
    expect(hasIngredient([{ name: 'Tomates cerises' }], 'tomate')).toBe(true);
    expect(hasIngredient(fridge, 'Oeuf')).toBe(true);
  });
  it('rejette les absents et les chaînes vides', () => {
    expect(hasIngredient(fridge, 'Poisson')).toBe(false);
    expect(hasIngredient(fridge, '   ')).toBe(false);
    expect(hasIngredient([{ name: '' }], 'Tomate')).toBe(false);
  });
});

describe('scores', () => {
  const recipe = r('1', ['Tomate', 'Oignon', 'Poisson', 'Piment']);
  it('calcule score, pourcentage et compte', () => {
    expect(matchScore(recipe, fridge)).toBe(0.5);
    expect(matchPct(recipe, fridge)).toBe(50);
    expect(haveCount(recipe, fridge)).toBe(2);
  });
  it('vaut 0 sans ingrédients', () => {
    expect(matchScore(r('x', []), fridge)).toBe(0);
  });
  it('tons selon seuils 70 / 40', () => {
    expect([badgeTone(70), badgeTone(69), badgeTone(40), badgeTone(39)]).toEqual(['success', 'warning', 'warning', 'neutral']);
    expect([ringTone(100), ringTone(50), ringTone(0)]).toEqual(['accent', 'amber', 'brand']);
  });
});

describe('rankBySuggestion / cookableCount', () => {
  const list = [r('a', ['Poisson']), r('b', ['Tomate', 'Oignon']), r('c', ['Tomate', 'Poisson']), r('d', ['Citron'])];
  it('trie par score décroissant, stable', () => {
    expect(rankBySuggestion(list, fridge).map((x) => x.id)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('compte les recettes ≥ 70 %', () => {
    expect(cookableCount(list, fridge)).toBe(2);
  });
});

describe('filterRecipes', () => {
  const list = [r('1', [], { name: 'Salade de tomate', category: 'Entrées' }), r('2', [], { name: 'Mousse', category: 'Desserts' })];
  it('filtre par catégorie, favoris et recherche', () => {
    expect(filterRecipes(list, { category: 'all', query: '', favorites: [] })).toHaveLength(2);
    expect(filterRecipes(list, { category: 'Desserts', query: '', favorites: [] }).map((x) => x.id)).toEqual(['2']);
    expect(filterRecipes(list, { category: 'fav', query: '', favorites: ['1'] }).map((x) => x.id)).toEqual(['1']);
    expect(filterRecipes(list, { category: 'all', query: 'TOMATE', favorites: [] }).map((x) => x.id)).toEqual(['1']);
  });
});

describe('groupFridge', () => {
  it('groupe dans l’ordre des catégories et omet les vides', () => {
    const g = groupFridge(fridge);
    expect(g.map((x) => x.category)).toEqual(['Légume', 'Fruit', 'Autre']);
    expect(g[0]!.items).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('formatTime / capitalize / initials / splitList', () => {
    expect(formatTime(25)).toBe('25 min');
    expect(capitalize('  poivron ')).toBe('Poivron');
    expect(capitalize('  ')).toBe('');
    expect(initials('Toto  Lacuisine Chef')).toBe('TL');
    expect(initials('')).toBe('');
    expect(splitList(' a, ,b ,c')).toEqual(['a', 'b', 'c']);
    // Une ligne par élément : les virgules internes (« 1,5 l ») sont conservées.
    expect(splitList('1,5 l de lait\r\n\n sel, poivre \n')).toEqual(['1,5 l de lait', 'sel, poivre']);
  });
});

describe('planning', () => {
  const plan = { [planKey(0, 0)]: 'a', [planKey(0, 1)]: 'b', [planKey(2, 1)]: 'zz' };
  it('compte, filtre les recettes supprimées', () => {
    expect(plannedCount(plan)).toBe(3);
    expect(plannedCount(plan, new Set(['a', 'b']))).toBe(2);
  });
  it('détecte un jour planifié', () => {
    expect(dayHasMeal(plan, 0)).toBe(true);
    expect(dayHasMeal(plan, 2)).toBe(true);
    expect(dayHasMeal(plan, 1)).toBe(false);
  });
  it('weekdayIndex : lundi = 0, dimanche = 6', () => {
    expect(weekdayIndex(new Date(2026, 10, 16))).toBe(0); // lundi
    expect(weekdayIndex(new Date(2026, 10, 15))).toBe(6); // dimanche
  });
});

describe('buildRecipeDraft', () => {
  it('exige un nom', () => {
    expect(buildRecipeDraft({ ...EMPTY_FORM, name: '  ' })).toEqual({ ok: false, error: 'Donnez un nom au plat' });
  });
  it('construit avec valeurs par défaut', () => {
    const res = buildRecipeDraft({ ...EMPTY_FORM, name: ' Pizza ', steps: ['', ' '] });
    expect(res.ok && res.draft).toMatchObject({
      name: 'Pizza',
      timeMin: 10,
      ingredients: ['—'],
      steps: ['Bon appétit !'],
      description: 'Ma recette.',
    });
  });
  it('temps = 10 min par étape', () => {
    const res = buildRecipeDraft({ ...EMPTY_FORM, name: 'X', ingredients: 'a, b', steps: ['1', '2', '3'] });
    expect(res.ok && res.draft.timeMin).toBe(30);
    expect(res.ok && res.draft.ingredients).toEqual(['a', 'b']);
  });
  it('reprend temps, niveau et prix d’une recette importée', () => {
    const meta = { timeMin: 25, level: 'Moyen' as const, price: '€', source: { name: 'marmiton.org', url: 'https://www.marmiton.org/x' } };
    const res = buildRecipeDraft({ ...EMPTY_FORM, name: 'Risotto', ingredients: '4 verres de riz\n1,5 l de bouillon', steps: ['a'], meta });
    expect(res.ok && res.draft).toMatchObject({ timeMin: 25, level: 'Moyen', price: '€', ingredients: ['4 verres de riz', '1,5 l de bouillon'] });
  });
  it('reprend la photo importée si elle est sûre', () => {
    const draft = (imageUrl: string | null) => {
      const res = buildRecipeDraft({ ...EMPTY_FORM, name: 'X', imageUrl });
      return res.ok ? res.draft.imageUrl : 'erreur';
    };
    expect(draft('https://img.test/a.webp')).toBe('https://img.test/a.webp');
    expect(draft('javascript:alert(1)')).toBeNull();
    expect(draft(null)).toBeNull();
  });
});

describe('moveItem / removeStep', () => {
  it('déplace et ignore les bornes', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 1)).toEqual(['a', 'b']);
  });
  it('garde toujours une étape', () => {
    expect(removeStep(['a', 'b'], 0)).toEqual(['b']);
    expect(removeStep(['a'], 0)).toEqual(['']);
  });
});

describe('validateAuth', () => {
  it('valide email, longueur et confirmation', () => {
    expect(validateAuth('login', { email: 'x', password: '123456' })).toBe('Email invalide');
    expect(validateAuth('login', { email: 'a@b.fr', password: '123' })).toMatch(/6 caractères/);
    expect(validateAuth('signup', { email: 'a@b.fr', password: '123456', confirm: '1234567' })).toMatch(/correspondent/);
    expect(validateAuth('signup', { email: 'a@b.fr', password: '123456', confirm: '123456' })).toBeNull();
  });
});
