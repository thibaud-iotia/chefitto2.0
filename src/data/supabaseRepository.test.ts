import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseRepository, toRecipe, toRecipeRow } from './supabaseRepository';
import { friendlyAuthError } from './repository';
import { SEED_RECIPES } from '../domain/seed';
import type { FridgeItem } from '../domain/types';

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

  it('photo : image_url ↔ imageUrl, filtrée, colonne omise si absente', () => {
    expect(toRecipe(row).imageUrl).toBeNull(); // base sans la colonne
    expect(toRecipe({ ...row, image_url: 'https://img.test/a.webp' }).imageUrl).toBe('https://img.test/a.webp');
    expect(toRecipe({ ...row, image_url: 'javascript:alert(1)' }).imageUrl).toBeNull();
    expect(toRecipeRow({ ...toRecipe(row), imageUrl: 'https://img.test/a.webp' })).toMatchObject({ image_url: 'https://img.test/a.webp' });
    expect(toRecipeRow(toRecipe(row))).not.toHaveProperty('image_url');
    expect(toRecipeRow({ ...toRecipe(row), imageUrl: 'data:image/png;base64,AA' })).not.toHaveProperty('image_url');
  });
});

describe('mapping — nombre de personnes', () => {
  it('servings ↔ servings, 4 si colonne absente ou valeur hors bornes', () => {
    expect(toRecipe(row).servings).toBe(4); // base sans la colonne
    expect(toRecipe({ ...row, servings: 6 }).servings).toBe(6);
    expect(toRecipe({ ...row, servings: 0 }).servings).toBe(4);
    expect(toRecipe({ ...row, servings: null }).servings).toBe(4);
    expect(toRecipeRow({ ...toRecipe(row), servings: 2 })).toMatchObject({ servings: 2 });
    expect(toRecipeRow({ ...toRecipe(row), servings: 999 })).toMatchObject({ servings: 4 });
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
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: sbUser, access_token: 'jwt-123' } } }),
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
    expect(await repo.getAccessToken()).toBe('jwt-123');
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
    expect(data.profile).toEqual({ name: 'Toto', email: 'toto@cuisine.fr', household: 2 }); // colonne absente : défaut
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

  it('ajout groupé d’aliments en une requête', async () => {
    const created: FridgeItem[] = [
      { id: 'a', name: 'Lait', category: 'Autre' },
      { id: 'b', name: 'Poulet', category: 'Viande' },
    ];
    const { client, calls } = fakeClient({ fridge_items: [{ data: created, error: null }] });
    const repo = new SupabaseRepository(client);
    expect(await repo.addFridgeItems(user, [])).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await repo.addFridgeItems(user, created.map(({ name, category }) => ({ name, category })))).toEqual(created);
    expect(calls[0]!.ops[0]).toEqual(['insert', [[{ name: 'Lait', category: 'Autre' }, { name: 'Poulet', category: 'Viande' }]]]);
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
    await repo.updateProfile(user, { name: 'T', email: 'e', household: 3 });
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

  it('photo : enregistre l’URL trouvée', async () => {
    const { client, calls } = fakeClient({});
    await new SupabaseRepository(client).setRecipeImage(user, 'r1', 'https://img.test/a.webp');
    await new SupabaseRepository(client).setRecipeImage(user, 'r1', null);
    expect(calls.map((c) => c.ops)).toEqual([
      [
        ['update', [{ image_url: 'https://img.test/a.webp' }]],
        ['eq', ['id', 'r1']],
      ],
      [
        ['update', [{ image_url: null }]],
        ['eq', ['id', 'r1']],
      ],
    ]);
  });

  it('photo : base pas encore migrée → recette enregistrée sans sa photo', async () => {
    const missing = { data: null, error: { message: "Could not find the 'image_url' column of 'recipes' in the schema cache" } };
    const { client, calls } = fakeClient({ recipes: [missing, { data: row, error: null }] });
    const r = await new SupabaseRepository(client).addRecipe(user, { ...toRecipe(row), imageUrl: 'https://img.test/a.webp' });
    expect(r.id).toBe('r1');
    const inserted = calls.map((c) => c.ops.find(([op]) => op === 'insert')![1][0]);
    expect(inserted[0]).toHaveProperty('image_url', 'https://img.test/a.webp');
    expect(inserted[1]).not.toHaveProperty('image_url');
  });

  it('photo : les autres erreurs d’insertion ne sont pas masquées', async () => {
    const { client, calls } = fakeClient({ recipes: [{ data: null, error: { message: 'Failed to fetch' } }] });
    await expect(new SupabaseRepository(client).addRecipe(user, { ...toRecipe(row), imageUrl: 'https://img.test/a.webp' })).rejects.toThrow(
      'Connexion réseau impossible',
    );
    expect(calls).toHaveLength(1);
  });

  it('profil : taille du foyer lue et enregistrée', async () => {
    const { client, calls } = fakeClient({
      profiles: [
        { data: { name: 'Toto', email: 'toto@cuisine.fr', household: 3 }, error: null },
        { data: [], error: null },
      ],
      recipes: [{ data: [{ ...row, servings: 6 }], error: null }],
      fridge_items: [{ data: [], error: null }],
      favorites: [{ data: [], error: null }],
      plan_entries: [{ data: [], error: null }],
    });
    const repo = new SupabaseRepository(client);
    const data = await repo.loadAll(user);
    expect(data.profile).toEqual({ name: 'Toto', email: 'toto@cuisine.fr', household: 3 });
    expect(data.recipes[0]!.servings).toBe(6);
    expect(calls[0]!.ops[0]).toEqual(['select', ['*']]); // la colonne `household` peut ne pas exister encore
    await repo.updateProfile(user, { name: 'T', email: 'e', household: 5 });
    expect(calls.at(-1)!.ops[0]).toEqual(['update', [{ name: 'T', email: 'e', household: 5 }]]);
  });

  it('base pas encore migrée : recette sans nombre de personnes ni photo, profil sans foyer', async () => {
    const col = (c: string) => ({ data: null, error: { message: `Could not find the '${c}' column of 'recipes' in the schema cache` } });
    const { client, calls } = fakeClient({
      recipes: [col('servings'), col('image_url'), { data: row, error: null }],
      profiles: [col('household'), { data: null, error: null }],
    });
    const repo = new SupabaseRepository(client);
    const r = await repo.addRecipe(user, { ...toRecipe(row), servings: 6, imageUrl: 'https://img.test/a.webp' });
    expect(r.id).toBe('r1');
    const inserted = calls.filter((c) => c.table === 'recipes').map((c) => c.ops[0]![1][0] as Record<string, unknown>);
    expect(inserted).toHaveLength(3);
    expect(inserted[0]).toMatchObject({ servings: 6, image_url: 'https://img.test/a.webp' });
    expect(inserted[1]).not.toHaveProperty('servings');
    expect(inserted[1]).toHaveProperty('image_url');
    expect(inserted[2]).not.toHaveProperty('image_url');

    await repo.updateProfile(user, { name: 'T', email: 'e', household: 5 });
    const updates = calls.filter((c) => c.table === 'profiles').map((c) => c.ops[0]![1][0]);
    expect(updates).toEqual([{ name: 'T', email: 'e', household: 5 }, { name: 'T', email: 'e' }]);
  });

  it('seed sur une base pas encore migrée : recettes insérées sans la colonne servings', async () => {
    const { client, calls } = fakeClient({
      profiles: [
        { data: { name: 'Toto', email: 'toto@cuisine.fr' }, error: null },
        { data: [{ id: 'u1' }], error: null },
      ],
      recipes: [
        { data: null, error: { message: "Could not find the 'servings' column of 'recipes' in the schema cache" } },
        { data: null, error: null },
        { data: [], error: null },
      ],
      fridge_items: [{ data: [], error: null }],
      favorites: [{ data: [], error: null }],
      plan_entries: [{ data: [], error: null }],
    });
    await new SupabaseRepository(client).loadAll(user);
    const inserts = calls.filter((c) => c.table === 'recipes' && c.ops[0]![0] === 'insert').map((c) => c.ops[0]![1][0] as object[]);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]![0]).toHaveProperty('servings', 4);
    expect(inserts[1]![0]).not.toHaveProperty('servings');
    expect(inserts[1]).toHaveLength(SEED_RECIPES.length);
  });

  it('une violation de contrainte sur servings n’est pas prise pour une colonne absente', async () => {
    const { client, calls } = fakeClient({
      recipes: [{ data: null, error: { message: 'new row for relation "recipes" violates check constraint "recipes_servings_check"' } }],
    });
    await expect(new SupabaseRepository(client).addRecipe(user, toRecipe(row))).rejects.toThrow(/recipes_servings_check/);
    expect(calls).toHaveLength(1);
  });

  it('propage les erreurs de base', async () => {
    const { client } = fakeClient({ fridge_items: [{ data: null, error: { message: 'Failed to fetch' } }] });
    await expect(new SupabaseRepository(client).removeFridgeItem(user, 'x')).rejects.toThrow('Connexion réseau impossible');
  });
});
