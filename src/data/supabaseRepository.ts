import type { SupabaseClient, User as SbUser } from '@supabase/supabase-js';
import { planKey } from '../domain/logic';
import { SEED_FRIDGE, SEED_RECIPES } from '../domain/seed';
import type {
  FoodCategory,
  FridgeItem,
  Level,
  Plan,
  Profile,
  Recipe,
  RecipeCategory,
  RecipeDraft,
  User,
  UserData,
} from '../domain/types';
import { RepositoryError, friendlyAuthError, type Repository } from './repository';

interface RecipeRow {
  id: string;
  name: string;
  category: string;
  price: string;
  time_min: number;
  level: string;
  description: string;
  ingredients: string[];
  steps: string[];
}

export const toRecipe = (r: RecipeRow): Recipe => ({
  id: r.id,
  name: r.name,
  category: r.category as RecipeCategory,
  price: r.price,
  timeMin: r.time_min,
  level: r.level as Level,
  description: r.description,
  ingredients: r.ingredients ?? [],
  steps: r.steps ?? [],
});

export const toRecipeRow = (d: RecipeDraft) => ({
  name: d.name,
  category: d.category,
  price: d.price,
  time_min: d.timeMin,
  level: d.level,
  description: d.description,
  ingredients: d.ingredients,
  steps: d.steps,
});

const toUser = (u: SbUser): User => ({ id: u.id, email: u.email ?? '' });

function check<D>(res: { data?: D | null; error: { message: string } | null }): D {
  if (res.error) throw new RepositoryError(friendlyAuthError(res.error.message));
  return res.data as D;
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;

  constructor(private readonly sb: SupabaseClient) {}

  async getUser(): Promise<User | null> {
    const { data } = await this.sb.auth.getSession();
    return data.session?.user ? toUser(data.session.user) : null;
  }

  onAuthChange(cb: (user: User | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => cb(session?.user ? toUser(session.user) : null));
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new RepositoryError(friendlyAuthError(error.message));
    if (!data.user) throw new RepositoryError('Connexion impossible');
    return toUser(data.user);
  }

  async signUp(email: string, password: string): Promise<User | null> {
    const data = check(await this.sb.auth.signUp({ email: email.trim(), password }));
    // Si la confirmation email est activée, pas de session tant que l'email n'est pas validé.
    return data.session && data.user ? toUser(data.user) : null;
  }

  async signOut(): Promise<void> {
    check(await this.sb.auth.signOut());
  }

  async resetPassword(email: string): Promise<void> {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;
    check(await this.sb.auth.resetPasswordForEmail(email.trim(), { redirectTo }));
  }

  /**
   * Insère les données de départ une seule fois. La « réservation » (update seeded=false → true)
   * est atomique côté Postgres : deux appels concurrents ne peuvent pas seeder deux fois.
   */
  private async seedIfNeeded(user: User): Promise<Profile> {
    let profile = check(
      await this.sb.from('profiles').select('name,email').eq('id', user.id).maybeSingle<Profile>(),
    );
    if (!profile) {
      // Trigger absent : on crée le profil nous-mêmes.
      profile = { name: user.email.split('@')[0] ?? '', email: user.email };
      check(await this.sb.from('profiles').upsert({ id: user.id, ...profile }, { onConflict: 'id', ignoreDuplicates: true }));
    }
    const claimed = check(
      await this.sb.from('profiles').update({ seeded: true }).eq('id', user.id).eq('seeded', false).select('id'),
    ) as { id: string }[];
    if (claimed.length > 0) {
      check(await this.sb.from('recipes').insert(SEED_RECIPES.map(toRecipeRow)));
      check(await this.sb.from('fridge_items').insert(SEED_FRIDGE));
    }
    return { name: profile.name, email: profile.email };
  }

  async loadAll(user: User): Promise<UserData> {
    const profile = await this.seedIfNeeded(user);
    const [recipes, favorites, fridge, plan] = await Promise.all([
      this.sb.from('recipes').select('*').order('created_at', { ascending: false }),
      this.sb.from('favorites').select('recipe_id'),
      this.sb.from('fridge_items').select('id,name,category').order('created_at', { ascending: false }),
      this.sb.from('plan_entries').select('day,meal,recipe_id'),
    ]);
    const planMap: Plan = {};
    for (const p of check(plan) as { day: number; meal: number; recipe_id: string }[]) planMap[planKey(p.day, p.meal)] = p.recipe_id;
    return {
      profile,
      recipes: (check(recipes) as RecipeRow[]).map(toRecipe),
      favorites: (check(favorites) as { recipe_id: string }[]).map((f) => f.recipe_id),
      fridge: check(fridge) as FridgeItem[],
      plan: planMap,
    };
  }

  async updateProfile(user: User, profile: Profile): Promise<void> {
    check(await this.sb.from('profiles').update({ name: profile.name, email: profile.email }).eq('id', user.id));
  }

  async addRecipe(_user: User, draft: RecipeDraft): Promise<Recipe> {
    const row = check(await this.sb.from('recipes').insert(toRecipeRow(draft)).select('*').single<RecipeRow>());
    return toRecipe(row);
  }

  async setFavorite(user: User, recipeId: string, on: boolean): Promise<void> {
    if (on) check(await this.sb.from('favorites').upsert({ user_id: user.id, recipe_id: recipeId }));
    else check(await this.sb.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId));
  }

  async addFridgeItem(_user: User, name: string, category: FoodCategory): Promise<FridgeItem> {
    return check(
      await this.sb.from('fridge_items').insert({ name, category }).select('id,name,category').single<FridgeItem>(),
    );
  }

  async removeFridgeItem(_user: User, id: string): Promise<void> {
    check(await this.sb.from('fridge_items').delete().eq('id', id));
  }

  async setPlanEntry(user: User, day: number, meal: number, recipeId: string | null): Promise<void> {
    if (recipeId) check(await this.sb.from('plan_entries').upsert({ user_id: user.id, day, meal, recipe_id: recipeId }));
    else check(await this.sb.from('plan_entries').delete().eq('user_id', user.id).eq('day', day).eq('meal', meal));
  }
}
