import type { SupabaseClient, User as SbUser } from '@supabase/supabase-js';
import { safeImageUrl } from '../domain/images';
import { daysBetween, toIsoDate, weekStart, type IsoDate } from '../domain/calendar';
import { datedPlan, planKey } from '../domain/logic';
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

/** Table du planning daté. Absente tant que `schema.sql` n'a pas été ré-exécuté (base créée avant le planning sur plusieurs semaines). */
const PLAN_TABLE = 'planned_meals';
/** Ancienne « semaine type » (jour 0-6, sans date), lue et écrite tant que `PLAN_TABLE` n'existe pas. */
const LEGACY_PLAN_TABLE = 'plan_entries';
export const LEGACY_PLAN_MESSAGE = 'Mettez à jour la base (supabase/schema.sql) pour planifier au-delà de cette semaine';

/** Table inconnue de PostgREST (`PGRST205`, « Could not find the table ») ou de Postgres (`42P01`, « does not exist »). */
function isMissingTable(e: { message: string; code?: string } | null, table: string): boolean {
  if (!e) return false;
  if (e.code === 'PGRST205' || e.code === '42P01') return true;
  const m = e.message.toLowerCase();
  return m.includes(table) && (m.includes('could not find the table') || m.includes('does not exist'));
}

const toUser = (u: SbUser): User => ({ id: u.id, email: u.email ?? '' });

function check<D>(res: { data?: D | null; error: { message: string } | null }): D {
  if (res.error) throw new RepositoryError(friendlyAuthError(res.error.message));
  return res.data as D;
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;

  /** `true` si la base n'a pas encore la table du planning daté : on retombe sur la semaine type (semaine en cours seulement). */
  private legacyPlan = false;

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
      this.loadPlan(),
    ]);
    return {
      profile,
      recipes: (check(recipes) as RecipeRow[]).map(toRecipe),
      favorites: (check(favorites) as { recipe_id: string }[]).map((f) => f.recipe_id),
      fridge: check(fridge) as FridgeItem[],
      plan,
    };
  }

  private async loadPlan(): Promise<Plan> {
    const res = await this.sb.from(PLAN_TABLE).select('meal_date,meal,recipe_id');
    this.legacyPlan = isMissingTable(res.error, PLAN_TABLE);
    if (!this.legacyPlan) {
      const plan: Plan = {};
      for (const p of check(res) as { meal_date: IsoDate; meal: number; recipe_id: string }[]) plan[planKey(p.meal_date, p.meal)] = p.recipe_id;
      return plan;
    }
    // Front déployé avant la migration SQL : la semaine type est affichée comme la semaine en cours.
    const legacy: Record<string, string> = {};
    for (const p of check(await this.sb.from(LEGACY_PLAN_TABLE).select('day,meal,recipe_id')) as { day: number; meal: number; recipe_id: string }[])
      legacy[`${p.day}-${p.meal}`] = p.recipe_id;
    return datedPlan(legacy, weekStart(toIsoDate()));
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

  async updateRecipe(_user: User, recipeId: string, draft: RecipeDraft): Promise<void> {
    // `image_url` explicite (même `null`) : une modification ne doit pas laisser une ancienne photo.
    const row: Record<string, unknown> = { ...toRecipeRow(draft), image_url: safeImageUrl(draft.imageUrl) };
    const updated = check(
      await withOptionalColumns([row], ([r]) => this.sb.from('recipes').update(r!).eq('id', recipeId).select('id')),
    ) as { id: string }[] | null;
    // RLS : 0 ligne si la recette a été supprimée (autre appareil) ou n'appartient pas à l'utilisateur.
    if (!updated?.length) throw new RepositoryError('Recette introuvable');
  }

  async deleteRecipes(_user: User, recipeIds: readonly string[]): Promise<void> {
    if (recipeIds.length === 0) return;
    // Favoris et créneaux du planning : `on delete cascade` côté Postgres.
    check(await this.sb.from('recipes').delete().in('id', [...recipeIds]));
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

  async setPlanEntry(user: User, date: IsoDate, meal: number, recipeId: string | null): Promise<void> {
    if (this.legacyPlan) return this.setLegacyPlanEntry(user, date, meal, recipeId);
    if (recipeId) check(await this.sb.from(PLAN_TABLE).upsert({ user_id: user.id, meal_date: date, meal, recipe_id: recipeId }));
    else check(await this.sb.from(PLAN_TABLE).delete().eq('user_id', user.id).eq('meal_date', date).eq('meal', meal));
  }

  /** Base non migrée : seule la semaine en cours existe (jour 0 = lundi). */
  private async setLegacyPlanEntry(user: User, date: IsoDate, meal: number, recipeId: string | null): Promise<void> {
    const day = daysBetween(weekStart(toIsoDate()), date);
    if (day < 0 || day > 6) throw new RepositoryError(LEGACY_PLAN_MESSAGE);
    if (recipeId) check(await this.sb.from(LEGACY_PLAN_TABLE).upsert({ user_id: user.id, day, meal, recipe_id: recipeId }));
    else check(await this.sb.from(LEGACY_PLAN_TABLE).delete().eq('user_id', user.id).eq('day', day).eq('meal', meal));
  }
}
