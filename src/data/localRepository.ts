import { SEED_FRIDGE, SEED_RECIPES } from '../domain/seed';
import { planKey } from '../domain/logic';
import { clampServings, DEFAULT_HOUSEHOLD, DEFAULT_SERVINGS } from '../domain/servings';
import type { FoodCategory, FridgeItem, Profile, Recipe, RecipeDraft, User, UserData } from '../domain/types';
import { RepositoryError, type Repository } from './repository';

/**
 * Mode démo : données dans localStorage, auth simulée (aucun mot de passe stocké).
 * Utile hors-ligne, pour les tests e2e et tant que Supabase n'est pas configuré.
 */
const PREFIX = 'chefitto:v1';
const SESSION_KEY = `${PREFIX}:session`;
const dataKey = (userId: string) => `${PREFIX}:data:${userId}`;

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new RepositoryError('Stockage local indisponible');
  }
}

/** Id déterministe par email : se reconnecter avec le même email retrouve ses données. */
function userIdFor(email: string): string {
  let h = 0;
  for (const c of email.toLowerCase()) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return `local-${(h >>> 0).toString(36)}`;
}

/** Données enregistrées par une version précédente : champs ajoutés depuis complétés par leur valeur par défaut. */
function upgrade(d: UserData): UserData {
  return {
    ...d,
    profile: { ...d.profile, household: clampServings(d.profile?.household) ?? DEFAULT_HOUSEHOLD },
    recipes: (d.recipes ?? []).map((r) => ({ ...r, servings: clampServings(r.servings) ?? DEFAULT_SERVINGS })),
  };
}

export class LocalRepository implements Repository {
  readonly mode = 'local' as const;
  private listeners = new Set<(u: User | null) => void>();

  constructor(private readonly latencyMs = 0) {}

  private async tick(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private emit(u: User | null) {
    this.listeners.forEach((l) => l(u));
  }

  private load(user: User): UserData {
    const existing = read<UserData>(dataKey(user.id));
    if (existing) return upgrade(existing);
    const fresh: UserData = {
      profile: { name: user.email.split('@')[0] ?? '', email: user.email, household: DEFAULT_HOUSEHOLD },
      recipes: SEED_RECIPES.map((r) => ({ ...r, id: uid() })),
      favorites: [],
      fridge: SEED_FRIDGE.map((f) => ({ ...f, id: uid() })),
      plan: {},
    };
    write(dataKey(user.id), fresh);
    return fresh;
  }

  private mutate(user: User, fn: (d: UserData) => void): void {
    const d = this.load(user);
    fn(d);
    write(dataKey(user.id), d);
  }

  async getAccessToken(): Promise<string | null> {
    return null;
  }

  async getUser(): Promise<User | null> {
    return read<User>(SESSION_KEY);
  }

  onAuthChange(cb: (user: User | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async signIn(email: string): Promise<User> {
    await this.tick();
    const e = email.trim().toLowerCase();
    const user = { id: userIdFor(e), email: e };
    write(SESSION_KEY, user);
    this.emit(user);
    return user;
  }

  async signUp(email: string): Promise<User> {
    return this.signIn(email);
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    this.emit(null);
  }

  async resetPassword(): Promise<void> {
    await this.tick();
  }

  async loadAll(user: User): Promise<UserData> {
    await this.tick();
    return structuredClone(this.load(user));
  }

  async updateProfile(user: User, profile: Profile): Promise<void> {
    await this.tick();
    this.mutate(user, (d) => {
      d.profile = { ...profile };
    });
  }

  async addRecipe(user: User, draft: RecipeDraft): Promise<Recipe> {
    await this.tick();
    const recipe: Recipe = { ...draft, id: uid() };
    this.mutate(user, (d) => {
      d.recipes.unshift(recipe);
    });
    return recipe;
  }

  async setRecipeImage(user: User, recipeId: string, imageUrl: string | null): Promise<void> {
    await this.tick();
    this.mutate(user, (d) => {
      d.recipes = d.recipes.map((r) => (r.id === recipeId ? { ...r, imageUrl } : r));
    });
  }

  async setFavorite(user: User, recipeId: string, on: boolean): Promise<void> {
    await this.tick();
    this.mutate(user, (d) => {
      d.favorites = d.favorites.filter((id) => id !== recipeId);
      if (on) d.favorites.push(recipeId);
    });
  }

  async addFridgeItem(user: User, name: string, category: FoodCategory): Promise<FridgeItem> {
    await this.tick();
    const item: FridgeItem = { id: uid(), name, category };
    this.mutate(user, (d) => {
      d.fridge.unshift(item);
    });
    return item;
  }

  async addFridgeItems(user: User, items: readonly { name: string; category: FoodCategory }[]): Promise<FridgeItem[]> {
    await this.tick();
    const created = items.map((i) => ({ id: uid(), name: i.name, category: i.category }));
    this.mutate(user, (d) => {
      d.fridge.unshift(...created);
    });
    return created;
  }

  async removeFridgeItem(user: User, id: string): Promise<void> {
    await this.tick();
    this.mutate(user, (d) => {
      d.fridge = d.fridge.filter((f) => f.id !== id);
    });
  }

  async setPlanEntry(user: User, day: number, meal: number, recipeId: string | null): Promise<void> {
    await this.tick();
    this.mutate(user, (d) => {
      const k = planKey(day, meal);
      if (recipeId) d.plan[k] = recipeId;
      else delete d.plan[k];
    });
  }
}
