import type { SupabaseClient, User as SbUser } from '@supabase/supabase-js';
import { safeImageUrl } from '../domain/images';
import { planKey } from '../domain/logic';
import { clampServings, DEFAULT_HOUSEHOLD, DEFAULT_SERVINGS } from '../domain/servings';
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
  /** Absente si la migration `image_url` n'a pas encore été appliquée. */
  image_url?: string | null;
  /** Absente si la migration `servings` n'a pas encore été appliquée. */
  servings?: number | null;
}

interface ProfileRow {
  name: string;
  email: string;
  /** Absente si la migration `household` n'a pas encore été appliquée. */
  household?: number | null;
}

const toProfile = (p: ProfileRow): Profile => ({
  name: p.name ?? '',
  email: p.email ?? '',
  household: clampServings(p.household) ?? DEFAULT_HOUSEHOLD,
});

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
  servings: clampServings(r.servings) ?? DEFAULT_SERVINGS,
  imageUrl: safeImageUrl(r.image_url),
});

export const toRecipeRow = (d: RecipeDraft) => {
  const imageUrl = safeImageUrl(d.imageUrl);
  return {
    name: d.name,
    category: d.category,
    price: d.price,
    time_min: d.timeMin,
    level: d.level,
    description: d.description,
    ingredients: d.ingredients,
    steps: d.steps,
    servings: clampServings(d.servings) ?? DEFAULT_SERVINGS,
    // Colonne omise quand il n'y a pas de photo : les insertions marchent même avant la migration `image_url`.
    ...(imageUrl ? { image_url: imageUrl } : {}),
  };
};

/**
 * Colonnes ajoutées après la première version du schéma. Tant que `schema.sql` n'a pas été ré-exécuté,
 * PostgREST refuse toute écriture qui les mentionne (« Could not find the 'servings' column… ») :
 * on réessaie sans elles plutôt que de perdre la recette ou le profil.
 */
const OPTIONAL_COLUMNS = ['image_url', 'servings', 'household'] as const;

/** Colonne optionnelle citée par l'erreur, encore présente dans les lignes envoyées. */
function missingColumn(e: { message: string } | null, rows: readonly Record<string, unknown>[]): string | null {
  const m = e?.message.toLowerCase() ?? '';
  if (!m.includes('column')) return null; // ex. violation de contrainte : vraie erreur, rien à retirer
  return OPTIONAL_COLUMNS.find((c) => m.includes(c) && rows.some((r) => c in r)) ?? null;
}

const without = <T extends Record<string, unknown>>(rows: T[], column: string): T[] =>
  rows.map((r) => {
    const copy = { ...r };
    delete copy[column];
    return copy;
  });

/** Exécute `run`, en retirant une à une les colonnes optionnelles que la base ne connaît pas encore. */
async function withOptionalColumns<T extends Record<string, unknown>, R extends { error: { message: string } | null }>(
  rows: T[],
  run: (rows: T[]) => PromiseLike<R>,
): Promise<R> {
  let res = await run(rows);
  for (let i = 0; i < OPTIONAL_COLUMNS.length; i++) {
    const column = missingColumn(res.error, rows);
    if (!column) break;
    rows = without(rows, column);
    res = await run(rows);
  }
  return res;
}

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

  async getAccessToken(): Promise<string | null> {
    const { data } = await this.sb.auth.getSession();
    return data.session?.access_token ?? null;
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
    // `*` plutôt qu'une liste : la colonne `household` peut ne pas exister encore.
    let profile = check(await this.sb.from('profiles').select('*').eq('id', user.id).maybeSingle<ProfileRow>());
    if (!profile) {
      // Trigger absent : on crée le profil nous-mêmes.
      profile = { name: user.email.split('@')[0] ?? '', email: user.email };
      check(
        await this.sb
          .from('profiles')
          .upsert({ id: user.id, name: profile.name, email: profile.email }, { onConflict: 'id', ignoreDuplicates: true }),
      );
    }
    const claimed = check(
      await this.sb.from('profiles').update({ seeded: true }).eq('id', user.id).eq('seeded', false).select('id'),
    ) as { id: string }[];
    if (claimed.length > 0) {
      check(await withOptionalColumns(SEED_RECIPES.map(toRecipeRow), (rows) => this.sb.from('recipes').insert(rows)));
      check(await this.sb.from('fridge_items').insert(SEED_FRIDGE));
    }
    return toProfile(profile);
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
    const row = { name: profile.name, email: profile.email, household: clampServings(profile.household) ?? DEFAULT_HOUSEHOLD };
    check(await withOptionalColumns([row], ([r]) => this.sb.from('profiles').update(r!).eq('id', user.id)));
  }

  async addRecipe(_user: User, draft: RecipeDraft): Promise<Recipe> {
    // Front déployé avant la migration SQL : la recette est enregistrée sans photo / nombre de personnes plutôt que perdue.
    const res = await withOptionalColumns([toRecipeRow(draft)], ([row]) =>
      this.sb.from('recipes').insert(row!).select('*').single<RecipeRow>(),
    );
    return toRecipe(check(res));
  }

  async setRecipeImage(_user: User, recipeId: string, imageUrl: string | null): Promise<void> {
    check(await this.sb.from('recipes').update({ image_url: safeImageUrl(imageUrl) }).eq('id', recipeId));
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

  async addFridgeItems(_user: User, items: readonly { name: string; category: FoodCategory }[]): Promise<FridgeItem[]> {
    if (items.length === 0) return [];
    const rows = items.map((i) => ({ name: i.name, category: i.category }));
    return check(await this.sb.from('fridge_items').insert(rows).select('id,name,category')) as FridgeItem[];
  }

  async removeFridgeItem(_user: User, id: string): Promise<void> {
    check(await this.sb.from('fridge_items').delete().eq('id', id));
  }

  async setPlanEntry(user: User, day: number, meal: number, recipeId: string | null): Promise<void> {
    if (recipeId) check(await this.sb.from('plan_entries').upsert({ user_id: user.id, day, meal, recipe_id: recipeId }));
    else check(await this.sb.from('plan_entries').delete().eq('user_id', user.id).eq('day', day).eq('meal', meal));
  }
}
