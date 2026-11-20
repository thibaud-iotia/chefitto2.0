export const RECIPE_CATEGORIES = ['Entrées', 'Plats', 'Desserts', 'Boissons'] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export const FOOD_CATEGORIES = ['Légume', 'Fruit', 'Viande', 'Poisson', 'Autre'] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export const LEVELS = ['Facile', 'Moyen', 'Difficile'] as const;
export type Level = (typeof LEVELS)[number];

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;
export const MEALS = ['Midi', 'Soir'] as const;
export const SLOTS_PER_WEEK = DAYS.length * MEALS.length;

export interface Recipe {
  id: string;
  name: string;
  category: RecipeCategory;
  price: string;
  timeMin: number;
  level: Level;
  description: string;
  ingredients: string[];
  steps: string[];
  /** Nombre de personnes pour lesquelles les quantités des ingrédients sont écrites (1–50). */
  servings: number;
  /**
   * Photo du plat (https). Reprise de la page importée, ou trouvée automatiquement par nom.
   * Absente (`undefined` / `null`) tant qu'aucune photo n'a été trouvée : on affiche l'illustration.
   */
  imageUrl?: string | null;
}

export type RecipeDraft = Omit<Recipe, 'id'>;

export interface FridgeItem {
  id: string;
  name: string;
  category: FoodCategory;
}

/** Clé `AAAA-MM-JJ:repas` (voir `planKey`) → id de recette. */
export type Plan = Record<string, string>;

export interface Profile {
  name: string;
  email: string;
  /** Taille du foyer : nombre de personnes proposé par défaut (nouvelle recette, fiche recette). */
  household: number;
}

export interface User {
  id: string;
  email: string;
}

export interface UserData {
  profile: Profile;
  recipes: Recipe[];
  favorites: string[];
  fridge: FridgeItem[];
  plan: Plan;
}

export interface ImportTemplate {
  name: string;
  timeMin: number;
  category: RecipeCategory;
  ingredients: string[];
  steps: string[];
}
