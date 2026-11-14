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
}

export type RecipeDraft = Omit<Recipe, 'id'>;

export interface FridgeItem {
  id: string;
  name: string;
  category: FoodCategory;
}

/** Clé `${day}-${meal}` → id de recette. */
export type Plan = Record<string, string>;

export interface Profile {
  name: string;
  email: string;
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
