import type { FoodCategory, FridgeItem, Profile, Recipe, RecipeDraft, User, UserData } from '../domain/types';

/**
 * Contrat d'accès aux données. Deux implémentations :
 * - SupabaseRepository (production)
 * - LocalRepository (mode démo hors-ligne, tests e2e, tests unitaires)
 */
export interface Repository {
  readonly mode: 'local' | 'supabase';
  getUser(): Promise<User | null>;
  onAuthChange(cb: (user: User | null) => void): () => void;
  signIn(email: string, password: string): Promise<User>;
  /** Renvoie `null` si une confirmation par email est requise. */
  signUp(email: string, password: string): Promise<User | null>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;

  /** Charge toutes les données ; insère les recettes de départ au premier appel. */
  loadAll(user: User): Promise<UserData>;
  updateProfile(user: User, profile: Profile): Promise<void>;
  addRecipe(user: User, draft: RecipeDraft): Promise<Recipe>;
  setFavorite(user: User, recipeId: string, on: boolean): Promise<void>;
  addFridgeItem(user: User, name: string, category: FoodCategory): Promise<FridgeItem>;
  removeFridgeItem(user: User, id: string): Promise<void>;
  setPlanEntry(user: User, day: number, meal: number, recipeId: string | null): Promise<void>;
}

export class RepositoryError extends Error {}

/** Traduit les erreurs Supabase courantes en messages lisibles. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Email ou mot de passe incorrect';
  if (m.includes('already registered') || m.includes('already exists')) return 'Un compte existe déjà avec cet email';
  if (m.includes('email not confirmed')) return 'Confirmez votre email avant de vous connecter';
  if (m.includes('rate limit')) return 'Trop de tentatives, réessayez plus tard';
  if (m.includes('network') || m.includes('fetch')) return 'Connexion réseau impossible';
  return message;
}
