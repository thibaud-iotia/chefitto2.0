import { createStore } from 'zustand/vanilla';
import { capitalize, planKey, sameFood, withoutRecipes } from '../domain/logic';
import { clampServings, DEFAULT_HOUSEHOLD } from '../domain/servings';
import type { FoodCategory, FridgeItem, Plan, Profile, Recipe, RecipeDraft, User } from '../domain/types';
import type { Repository } from '../data/repository';
import { defaultImporter, type RecipeImporter } from '../data/recipeImport';
import { createImageFinder, type ImageFinder } from '../data/recipeImages';
import { defaultScanner, type FridgeScanner } from '../data/fridgeScan';

export type Sheet = { type: 'pick'; day: number; meal: number } | { type: 'plan'; recipeId: string } | null;

export interface AppState {
  status: 'booting' | 'anon' | 'loading' | 'ready' | 'error';
  error: string | null;
  user: User | null;
  profile: Profile;
  recipes: Recipe[];
  favorites: string[];
  fridge: FridgeItem[];
  plan: Plan;
  toast: { id: number; text: string } | null;
  sheet: Sheet;
  /** Bascule vers l'écran d'auth après le splash (sans compte). */
  splashSeen: boolean;
  /** Recherche / import de recettes en ligne (dépendance, non réactive). */
  importer: RecipeImporter;
  /** Détection d'aliments sur photo (dépendance, non réactive). */
  scanner: FridgeScanner;
}

export interface AppActions {
  init(): Promise<void>;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string): Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<string | null>;
  reload(): Promise<void>;
  toggleFavorite(recipeId: string): Promise<void>;
  addFridgeItem(name: string, category: FoodCategory): Promise<boolean>;
  /**
   * Ajout groupé (aliments détectés sur photo). Ignore les noms vides, les doublons et ce qui est déjà au frigo.
   * Renvoie le nombre d'aliments ajoutés (0 en cas d'échec, avec un message).
   */
  addFridgeItems(items: readonly { name: string; category: FoodCategory }[]): Promise<number>;
  removeFridgeItem(id: string): Promise<void>;
  setPlanEntry(day: number, meal: number, recipeId: string | null): Promise<void>;
  addRecipe(draft: RecipeDraft): Promise<Recipe | null>;
  /** Modifie une recette (mise à jour optimiste). `false` en cas d'échec, avec un message. */
  updateRecipe(recipeId: string, draft: RecipeDraft): Promise<boolean>;
  /** Supprime des recettes, et avec elles leurs favoris et créneaux du planning. `false` en cas d'échec. */
  deleteRecipes(recipeIds: readonly string[]): Promise<boolean>;
  /**
   * Cherche et mémorise une photo pour une recette qui n'en a pas (une seule tentative par session).
   * Avec `brokenUrl` : la photo actuelle ne se charge plus, on en cherche une autre.
   */
  ensureRecipeImage(recipeId: string, brokenUrl?: string): Promise<void>;
  updateProfile(profile: Profile): Promise<void>;
  flash(text: string): void;
  openSheet(sheet: Exclude<Sheet, null>): void;
  closeSheet(): void;
  setSplashSeen(): void;
}

export type AppStore = ReturnType<typeof createAppStore>;

const EMPTY: Pick<AppState, 'profile' | 'recipes' | 'favorites' | 'fridge' | 'plan'> = {
  profile: { name: '', email: '', household: DEFAULT_HOUSEHOLD },
  recipes: [],
  favorites: [],
  fridge: [],
  plan: {},
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur inattendue');

export function createAppStore(
  repo: Repository,
  importer: RecipeImporter = defaultImporter(repo.mode, () => repo.getAccessToken()),
  images: ImageFinder = createImageFinder(importer),
  scanner: FridgeScanner = defaultScanner(repo.mode, () => repo.getAccessToken()),
) {
  let toastSeq = 0;
  /** Recherches de photo déjà lancées cette session (`id` ou `id|urlCassée`). */
  const imageLookups = new Set<string>();
  /** Photos qui ne se chargent plus : jamais reproposées. */
  const brokenImages = new Set<string>();
  let loading: Promise<void> | null = null;
  let unsubscribe: (() => void) | null = null;

  return createStore<AppState & AppActions>()((set, get) => {
    const fail = (e: unknown) => get().flash(errMsg(e));

    const load = (user: User): Promise<void> => {
      // Dé-duplique les chargements concurrents (événement auth + init).
      if (loading && get().user?.id === user.id) return loading;
      set({ user, status: 'loading', error: null });
      loading = repo
        .loadAll(user)
        .then((data) => {
          if (get().user?.id === user.id) set({ ...data, status: 'ready' });
        })
        .catch((e) => set({ status: 'error', error: errMsg(e) }))
        .finally(() => {
          loading = null;
        });
      return loading;
    };

    /** Applique un patch local, appelle le serveur, restaure si échec. Renvoie `true` si le serveur a accepté. */
    const optimistic = async (patch: (s: AppState) => Partial<AppState>, call: (u: User) => Promise<unknown>): Promise<boolean> => {
      const user = get().user;
      if (!user) return false;
      const before = get();
      const snapshot = { recipes: before.recipes, favorites: before.favorites, fridge: before.fridge, plan: before.plan, profile: before.profile };
      set(patch(before));
      try {
        await call(user);
        return true;
      } catch (e) {
        set(snapshot);
        fail(e);
        return false;
      }
    };

    return {
      status: 'booting',
      error: null,
      user: null,
      ...EMPTY,
      toast: null,
      sheet: null,
      splashSeen: false,
      importer,
      scanner,

      async init() {
        unsubscribe?.();
        unsubscribe = repo.onAuthChange((u) => {
          if (u && u.id !== get().user?.id) void load(u);
          if (!u && get().user) set({ user: null, status: 'anon', ...EMPTY, sheet: null });
        });
        try {
          const user = await repo.getUser();
          if (user) await load(user);
          else set({ status: 'anon' });
        } catch (e) {
          set({ status: 'anon', error: errMsg(e) });
        }
      },

      async signIn(email, password) {
        try {
          const user = await repo.signIn(email, password);
          await load(user);
          return null;
        } catch (e) {
          return errMsg(e);
        }
      },

      async signUp(email, password) {
        try {
          const user = await repo.signUp(email, password);
          if (!user) return { error: null, needsConfirm: true };
          await load(user);
          return { error: null, needsConfirm: false };
        } catch (e) {
          return { error: errMsg(e), needsConfirm: false };
        }
      },

      async signOut() {
        try {
          await repo.signOut();
        } finally {
          set({ user: null, status: 'anon', ...EMPTY, sheet: null });
        }
      },

      async resetPassword(email) {
        try {
          await repo.resetPassword(email);
          return null;
        } catch (e) {
          return errMsg(e);
        }
      },

      async reload() {
        const u = get().user;
        if (u) await load(u);
      },

      async toggleFavorite(recipeId) {
        const on = !get().favorites.includes(recipeId);
        await optimistic(
          (s) => ({ favorites: on ? [...s.favorites, recipeId] : s.favorites.filter((id) => id !== recipeId) }),
          (u) => repo.setFavorite(u, recipeId, on),
        );
      },

      async addFridgeItem(rawName, category) {
        const name = capitalize(rawName);
        const user = get().user;
        if (!name) {
          get().flash('Saisissez un aliment');
          return false;
        }
        if (!user) return false;
        const tempId = `tmp-${Date.now()}`;
        set((s) => ({ fridge: [{ id: tempId, name, category }, ...s.fridge] }));
        try {
          const item = await repo.addFridgeItem(user, name, category);
          set((s) => ({ fridge: s.fridge.map((f) => (f.id === tempId ? item : f)) }));
          return true;
        } catch (e) {
          set((s) => ({ fridge: s.fridge.filter((f) => f.id !== tempId) }));
          fail(e);
          return false;
        }
      },

      async addFridgeItems(raw) {
        const user = get().user;
        if (!user) return 0;
        const items: { name: string; category: FoodCategory }[] = [];
        for (const r of raw) {
          const name = capitalize(r.name);
          if (!name || get().fridge.some((f) => sameFood(f.name, name)) || items.some((i) => sameFood(i.name, name))) continue;
          items.push({ name, category: r.category });
        }
        if (items.length === 0) return 0;
        const tempIds = items.map((_, i) => `tmp-${Date.now()}-${i}`);
        set((s) => ({ fridge: [...items.map((it, i) => ({ id: tempIds[i]!, ...it })), ...s.fridge] }));
        try {
          const created = await repo.addFridgeItems(user, items);
          const byTemp = new Map(tempIds.map((t, i) => [t, created[i]]));
          set((s) => ({ fridge: s.fridge.map((f) => byTemp.get(f.id) ?? f) }));
          return items.length;
        } catch (e) {
          const temp = new Set(tempIds);
          set((s) => ({ fridge: s.fridge.filter((f) => !temp.has(f.id)) }));
          fail(e);
          return 0;
        }
      },

      async removeFridgeItem(id) {
        await optimistic(
          (s) => ({ fridge: s.fridge.filter((f) => f.id !== id) }),
          (u) => repo.removeFridgeItem(u, id),
        );
      },

      async setPlanEntry(day, meal, recipeId) {
        await optimistic(
          (s) => {
            const plan = { ...s.plan };
            if (recipeId) plan[planKey(day, meal)] = recipeId;
            else delete plan[planKey(day, meal)];
            return { plan, sheet: null };
          },
          (u) => repo.setPlanEntry(u, day, meal, recipeId),
        );
      },

      async addRecipe(draft) {
        const user = get().user;
        if (!user) return null;
        try {
          const recipe = await repo.addRecipe(user, draft);
          set((s) => ({ recipes: [recipe, ...s.recipes] }));
          return recipe;
        } catch (e) {
          fail(e);
          return null;
        }
      },

      updateRecipe(recipeId, draft) {
        return optimistic(
          (s) => ({ recipes: s.recipes.map((r) => (r.id === recipeId ? { ...draft, id: recipeId } : r)) }),
          (u) => repo.updateRecipe(u, recipeId, draft),
        );
      },

      deleteRecipes(recipeIds) {
        const ids = new Set(recipeIds);
        if (ids.size === 0) return Promise.resolve(true);
        return optimistic(
          (s) => ({ recipes: s.recipes.filter((r) => !ids.has(r.id)), ...withoutRecipes(s.plan, s.favorites, ids), sheet: null }),
          (u) => repo.deleteRecipes(u, [...ids]),
        );
      },

      async ensureRecipeImage(recipeId, brokenUrl) {
        const user = get().user;
        const recipe = get().recipes.find((r) => r.id === recipeId);
        if (!user || !recipe) return;
        if (brokenUrl) {
          if (recipe.imageUrl !== brokenUrl) return;
          brokenImages.add(brokenUrl);
        } else if (recipe.imageUrl) {
          return;
        }
        const key = brokenUrl ? `${recipeId}|${brokenUrl}` : recipeId;
        if (imageLookups.has(key)) return;
        imageLookups.add(key);

        let found: string | null;
        try {
          found = await images.find(recipe, brokenImages);
        } catch {
          imageLookups.delete(key); // hors ligne / service indisponible : on réessaiera au prochain affichage
          return;
        }
        const current = get().recipes.find((r) => r.id === recipeId);
        // Recette supprimée, utilisateur changé ou photo modifiée entre-temps : on ne touche à rien.
        if (!current || current.imageUrl !== recipe.imageUrl || get().user?.id !== user.id) return;
        if (!found && !brokenUrl) return;
        const imageUrl = found ?? null;
        set((s) => ({ recipes: s.recipes.map((r) => (r.id === recipeId ? { ...r, imageUrl } : r)) }));
        // Non bloquant : en cas d'échec, la photo reste affichée et sera recherchée à la prochaine session.
        await repo.setRecipeImage(user, recipeId, imageUrl).catch(() => undefined);
      },

      updateProfile(input) {
        const profile = {
          name: input.name.trim(),
          email: input.email.trim(),
          household: clampServings(input.household) ?? get().profile.household,
        };
        return optimistic(
          () => ({ profile }),
          (u) => repo.updateProfile(u, profile),
        ).then((ok) => {
          if (ok) get().flash('Profil mis à jour');
        });
      },

      flash(text) {
        set({ toast: { id: ++toastSeq, text } });
      },
      openSheet(sheet) {
        set({ sheet });
      },
      closeSheet() {
        set({ sheet: null });
      },
      setSplashSeen() {
        set({ splashSeen: true });
      },
    };
  });
}
