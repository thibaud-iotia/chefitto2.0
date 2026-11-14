import { createStore } from 'zustand/vanilla';
import { capitalize, planKey } from '../domain/logic';
import type { FoodCategory, FridgeItem, Plan, Profile, Recipe, RecipeDraft, User } from '../domain/types';
import type { Repository } from '../data/repository';
import { defaultImporter, type RecipeImporter } from '../data/recipeImport';

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
  removeFridgeItem(id: string): Promise<void>;
  setPlanEntry(day: number, meal: number, recipeId: string | null): Promise<void>;
  addRecipe(draft: RecipeDraft): Promise<Recipe | null>;
  updateProfile(profile: Profile): Promise<void>;
  flash(text: string): void;
  openSheet(sheet: Exclude<Sheet, null>): void;
  closeSheet(): void;
  setSplashSeen(): void;
}

export type AppStore = ReturnType<typeof createAppStore>;

const EMPTY: Pick<AppState, 'profile' | 'recipes' | 'favorites' | 'fridge' | 'plan'> = {
  profile: { name: '', email: '' },
  recipes: [],
  favorites: [],
  fridge: [],
  plan: {},
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur inattendue');

export function createAppStore(repo: Repository, importer: RecipeImporter = defaultImporter(repo.mode, () => repo.getAccessToken())) {
  let toastSeq = 0;
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

    /** Applique un patch local, appelle le serveur, restaure si échec. */
    const optimistic = async (patch: (s: AppState) => Partial<AppState>, call: (u: User) => Promise<unknown>) => {
      const user = get().user;
      if (!user) return;
      const before = get();
      const snapshot = { recipes: before.recipes, favorites: before.favorites, fridge: before.fridge, plan: before.plan, profile: before.profile };
      set(patch(before));
      try {
        await call(user);
      } catch (e) {
        set(snapshot);
        fail(e);
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

      toggleFavorite(recipeId) {
        const on = !get().favorites.includes(recipeId);
        return optimistic(
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

      removeFridgeItem(id) {
        return optimistic(
          (s) => ({ fridge: s.fridge.filter((f) => f.id !== id) }),
          (u) => repo.removeFridgeItem(u, id),
        );
      },

      setPlanEntry(day, meal, recipeId) {
        return optimistic(
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

      updateProfile(profile) {
        return optimistic(
          () => ({ profile: { name: profile.name.trim(), email: profile.email.trim() } }),
          (u) => repo.updateProfile(u, profile),
        ).then(() => get().flash('Profil mis à jour'));
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
