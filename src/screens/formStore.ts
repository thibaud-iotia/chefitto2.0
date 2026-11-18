import { create } from 'zustand';
import type { ImportedRecipe } from '../data/recipeImport';
import { safeImageUrl } from '../domain/images';
import { EMPTY_FORM, moveItem, removeStep, type RecipeForm } from '../domain/logic';
import { clampServings, parseServings } from '../domain/servings';
import type { ImportTemplate, RecipeCategory } from '../domain/types';

/** Brouillon de recette, conservé quand on passe par l'écran « Importer ». */
interface FormState {
  form: RecipeForm;
  set<K extends keyof RecipeForm>(key: K, value: RecipeForm[K]): void;
  setStep(i: number, text: string): void;
  addStep(): void;
  moveStep(i: number, dir: -1 | 1): void;
  removeStep(i: number): void;
  importTemplate(t: ImportTemplate): void;
  importRecipe(r: ImportedRecipe): void;
  /** Oublie la source importée (temps, niveau, prix, photo repassent aux valeurs par défaut). */
  clearMeta(): void;
  reset(category?: RecipeCategory): void;
}

export const useRecipeForm = create<FormState>((set) => ({
  form: EMPTY_FORM,
  set: (key, value) => set((s) => ({ form: { ...s.form, [key]: value } })),
  setStep: (i, text) => set((s) => ({ form: { ...s.form, steps: s.form.steps.map((x, j) => (j === i ? text : x)) } })),
  addStep: () => set((s) => ({ form: { ...s.form, steps: [...s.form.steps, ''] } })),
  moveStep: (i, dir) => set((s) => ({ form: { ...s.form, steps: moveItem(s.form.steps, i, dir) } })),
  removeStep: (i) => set((s) => ({ form: { ...s.form, steps: removeStep(s.form.steps, i) } })),
  importTemplate: (t) =>
    set((s) => ({
      form: {
        ...s.form,
        name: t.name,
        category: t.category,
        ingredients: t.ingredients.join('\n'),
        steps: [...t.steps],
        meta: { timeMin: t.timeMin, level: 'Facile', price: '—', source: null },
        servings: null, // modèle sans quantités : taille du foyer
        imageUrl: null,
      },
    })),
  importRecipe: (r) =>
    set({
      form: {
        name: r.name,
        category: r.category,
        ingredients: r.ingredients.join('\n'),
        description: r.description,
        steps: r.steps.length ? [...r.steps] : [''],
        meta: { timeMin: r.timeMin, level: r.level, price: r.price, source: { name: r.sourceName, url: r.sourceUrl } },
        // `servingsCount` absent : Edge Function déployée avant le nombre de personnes, on relit le texte.
        servings: clampServings(r.servingsCount) ?? parseServings(r.servings),
        imageUrl: safeImageUrl(r.imageUrl),
      },
    }),
  // La photo appartient au site source : sans la source, on la retire (une autre sera cherchée).
  clearMeta: () => set((s) => ({ form: { ...s.form, meta: null, imageUrl: null } })),
  reset: (category) => set({ form: { ...EMPTY_FORM, category: category ?? EMPTY_FORM.category } }),
}));
