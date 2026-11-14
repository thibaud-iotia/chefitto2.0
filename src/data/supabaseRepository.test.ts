import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseRepository, toRecipe, toRecipeRow } from './supabaseRepository';
import { friendlyAuthError } from './repository';
import { SEED_RECIPES } from '../domain/seed';

/**
 * Faux client Supabase : chaque appel `from(table)` renvoie un builder chaînable
 * qui enregistre les opérations et se résout avec la réponse programmée pour la table.
 */
type Resp = { data: unknown; error: { message: string } | null };
function fakeClient(responses: Record<string, Resp[]>, auth: Partial<Record<string, unknown>> = {}) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const from = (table: string) => {
    const entry = { table, ops: [] as [string, unknown[]][] };
    calls.push(entry);
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'order']) {
      builder[op] = (...args: unknown[]) => {
        entry.ops.push([op, args]);
        return builder;
      };
    }
    const resolve = () => {
      const queue = responses[table] ?? [];
      return Promise.resolve(queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: null, error: null }));
    };
    builder.single = resolve;
    builder.maybeSingle = resolve;
    builder.then = (onF: (v: Resp) => unknown, onR?: (e: unknown) => unknown) => resolve().then(onF, onR);
    return builder;
  };
  const client = { from, auth: { ...auth } } as unknown as SupabaseClient;
  return { client, calls };
}

const user = { id: 'u1', email: 'toto@cuisine.fr' };
const row = {
  id: 'r1',
  name: 'Tarte',
  category: 'Desserts',
  price: '—',
  time_min: 30,
  level: 'Facile',
  description: 'd',
  ingredients: ['Pomme'],
  steps: ['Cuire'],
};

describe('mapping', () => {
  it('row ↔ recipe', () => {
    const r = toRecipe(row);
    expect(r).toMatchObject({ id: 'r1', timeMin: 30, category: 'Desserts' });
    expect(toRecipeRow(r)).toMatchObject({ time_min: 30, name: 'Tarte' });
    expect(toRecipe({ ...row, ingredients: null as unknown as string[], steps: null as unknown as string[] })).toMatchObject({
      ingredients: [],
      steps: [],
    });
  });
});

describe('friendlyAuthError', () => {
  it('traduit les messages connus', () => {
    expect(friendlyAuthError('Invalid login credentials')).toBe('Email ou mot de passe incorrect');
    expect(friendlyAuthError('User already registered')).toMatch(/existe déjà/);
    expect(friendlyAuthError('Email not confirmed')).toMatch(/Confirmez/);
    expect(friendlyAuthError('email rate limit exceeded')).toMatch(/Trop de tentatives/);
    expect(friendlyAuthError('Failed to fetch')).toMatch(/réseau/);
    expect(friendlyAuthError('autre')).toBe('autre');
  });
});

describe('SupabaseRepository — auth', () => {
  it('getUser / signIn / signUp / signOut / reset', async () => {
    const sbUser = { id: 'u1', email: 'toto@cuisine.fr' };
    const unsubscribe = vi.fn();
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: sbUser } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: sbUser }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: sbUser, session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        cb('SIGNED_IN', { user: sbUser });
        cb('SIGNED_OUT', null);
        return { data: { subscription: { unsubscribe } } };
      }),
    };
    const repo = new SupabaseRepository(fakeClient({}, auth).client);
    expect(await repo.getUser()).toEqual(user);
    expect(await repo.signIn(' toto@cuisine.fr ', 'pw')).toEqual(user);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'toto@cuisine.fr', password: 'pw' });
    expect(await repo.signUp('toto@cuisine.fr', 'pw')).toBeNull(); // confirmation requise
    await repo.signOut();
    await repo.resetPassword('toto@cuisine.fr');
    const cb = vi.fn();
    repo.onAuthChange(cb)();
    expect(cb.mock.calls).toEqual([[user], [null]]);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('traduit les erreurs d’auth', async () => {
    const auth = {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } }),
    };
    const repo = new SupabaseRepository(fakeClient({}, auth).client);
    await expect(repo.signIn('a@b.fr', 'x')).rejects.toThrow('Email ou mot de passe incorrect');
  });
});

describe('SupabaseRepository — données', () => {
  it('loadAll seed au premier passage puis charge tout', async () => {
    const { client, calls } = fakeClient({
      profiles: [
        { data: { name: 'Toto', email: 'toto@cuisine.fr' }, error: null }, // select profil
        { data: [{ id: 'u1' }], error: null }, // claim seeded
      ],
      recipes: [
        { data: null, error: null }, // insert seed
        { data: [row], error: null }, // select
      ],
      fridge_items: [
        { data: null, error: null },
        { data: [{ id: 'f1', name: 'Tomate', category: 'Légume' }], error: null },
      ],
      favorites: [{ data: [{ recipe_id: 'r1' }], error: null }],
      plan_entries: [{ data: [{ day: 1, meal: 0, recipe_id: 'r1' }], error: null }],
    });
    const data = await new SupabaseRepository(client).loadAll(user);
    expect(data.profile).toEqual({ name: 'Toto', email: 'toto@cuisine.fr' });
    expect(data.recipes[0]!.id).toBe('r1');
    expect(data.favorites).toEqual(['r1']);
    expect(data.plan).toEqual({ '1-0': 'r1' });
    const seedInsert = calls.find((c) => c.table === 'recipes' && c.ops[0]![0] === 'insert');
    expect((seedInsert!.ops[0]![1][0] as unknown[]).length).toBe(SEED_RECIPES.length);
  });

  it('ne re-seed pas si déjà réservé et crée le profil si absent', async () => {
    const { client, calls } = fakeClient({
      profiles: [
        { data: null, error: null }, // pas de profil
        { data: null, error: null }, // upsert
        { data: [], error: null }, // claim : déjà seedé
      ],
      recipes: [{ data: [], error: null }],
      fridge_items: [{ data: [], error: null }],
      favorites: [{ data: [], error: null }],
      plan_entries: [{ data: [], error: null }],
    });
    const data = await new SupabaseRepository(client).loadAll(user);
    expect(data.profile.name).toBe('toto');
    expect(calls.some((c) => c.table === 'recipes' && c.ops.some(([op]) => op === 'insert'))).toBe(false);
  });

  it('mutations : recette, favori, frigo, planning, profil', async () => {
    const { client, calls } = fakeClient({
      recipes: [{ data: row, error: null }],
      fridge_items: [{ data: { id: 'f9', name: 'Kiwi', category: 'Fruit' }, error: null }],
    });
    const repo = new SupabaseRepository(client);
    expect((await repo.addRecipe(user, toRecipe(row))).id).toBe('r1');
    await repo.setFavorite(user, 'r1', true);
    await repo.setFavorite(user, 'r1', false);
    expect((await repo.addFridgeItem(user, 'Kiwi', 'Fruit')).id).toBe('f9');
    await repo.removeFridgeItem(user, 'f9');
    await repo.setPlanEntry(user, 0, 1, 'r1');
    await repo.setPlanEntry(user, 0, 1, null);
    await repo.updateProfile(user, { name: 'T', email: 'e' });
    const ops = calls.map((c) => `${c.table}:${c.ops[0]![0]}`);
    expect(ops).toEqual([
      'recipes:insert',
      'favorites:upsert',
      'favorites:delete',
      'fridge_items:insert',
      'fridge_items:delete',
      'plan_entries:upsert',
      'plan_entries:delete',
      'profiles:update',
    ]);
  });

  it('propage les erreurs de base', async () => {
    const { client } = fakeClient({ fridge_items: [{ data: null, error: { message: 'Failed to fetch' } }] });
    await expect(new SupabaseRepository(client).removeFridgeItem(user, 'x')).rejects.toThrow('Connexion réseau impossible');
  });
});
