import { create } from 'zustand';
import { EMPTY_FORM, moveItem, removeStep, type RecipeForm } from '../domain/logic';
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
      form: { ...s.form, name: t.name, category: t.category, ingredients: t.ingredients.join(', '), steps: [...t.steps] },
    })),
  reset: (category) => set({ form: { ...EMPTY_FORM, category: category ?? EMPTY_FORM.category } }),
}));
