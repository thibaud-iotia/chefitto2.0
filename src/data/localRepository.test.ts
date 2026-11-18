import { describe, expect, it, vi } from 'vitest';
import { LocalRepository } from './localRepository';

describe('LocalRepository', () => {
  it('même email ⇒ mêmes données après reconnexion', async () => {
    const repo = new LocalRepository();
    const u1 = await repo.signIn('Toto@Cuisine.fr');
    await repo.addFridgeItem(u1, 'Kiwi', 'Fruit');
    await repo.signOut();
    expect(await repo.getUser()).toBeNull();
    expect(await repo.getAccessToken()).toBeNull();
    const u2 = await repo.signUp('toto@cuisine.fr');
    expect(u2.id).toBe(u1.id);
    expect((await repo.loadAll(u2)).fridge[0]!.name).toBe('Kiwi');
  });

  it('ajout groupé d’aliments, en tête du frigo', async () => {
    const repo = new LocalRepository();
    const u = await repo.signIn('lot@cuisine.fr');
    const created = await repo.addFridgeItems(u, [
      { name: 'Lait', category: 'Autre' },
      { name: 'Poulet', category: 'Viande' },
    ]);
    expect(created.map((c) => c.name)).toEqual(['Lait', 'Poulet']);
    expect((await repo.loadAll(u)).fridge.slice(0, 2).map((f) => f.id)).toEqual(created.map((c) => c.id));
  });

  it('notifie les changements d’auth et se désabonne', async () => {
    const repo = new LocalRepository();
    const cb = vi.fn();
    const off = repo.onAuthChange(cb);
    const u = await repo.signIn('a@b.fr');
    await repo.signOut();
    off();
    await repo.signIn('a@b.fr');
    expect(cb.mock.calls).toEqual([[u], [null]]);
  });

  it('loadAll renvoie une copie (pas de mutation externe)', async () => {
    const repo = new LocalRepository();
    const u = await repo.signIn('a@b.fr');
    const d = await repo.loadAll(u);
    d.recipes.length = 0;
    expect((await repo.loadAll(u)).recipes.length).toBeGreaterThan(0);
  });

  it('respecte la latence simulée et ignore un JSON corrompu', async () => {
    vi.useFakeTimers();
    const repo = new LocalRepository(50);
    const p = repo.signIn('a@b.fr');
    await vi.advanceTimersByTimeAsync(50);
    const u = await p;
    vi.useRealTimers();
    localStorage.setItem(`chefitto:v1:data:${u.id}`, '{oops');
    const fresh = await new LocalRepository().loadAll(u);
    expect(fresh.recipes.length).toBeGreaterThan(0);
    await new LocalRepository().resetPassword();
  });

  it('enregistre la photo d’une recette, et charge les données d’avant les photos', async () => {
    const repo = new LocalRepository();
    const u = await repo.signIn('a@b.fr');
    const [first, second] = (await repo.loadAll(u)).recipes;
    expect(first!.imageUrl).toBeUndefined(); // données créées avant la fonctionnalité : champ absent
    await repo.setRecipeImage(u, first!.id, 'https://img.test/1.webp');
    const after = (await repo.loadAll(u)).recipes;
    expect(after[0]!.imageUrl).toBe('https://img.test/1.webp');
    expect(after[1]).toEqual(second);
    await repo.setRecipeImage(u, first!.id, null);
    expect((await repo.loadAll(u)).recipes[0]!.imageUrl).toBeNull();
  });

  it('complète les données d’avant le nombre de personnes (recettes : 4, foyer : 2)', async () => {
    const repo = new LocalRepository();
    const u = await repo.signIn('old@b.fr');
    const data = await repo.loadAll(u);
    const legacy = {
      ...data,
      profile: { name: data.profile.name, email: data.profile.email },
      recipes: data.recipes.map((r) => {
        const old: Partial<typeof r> = { ...r };
        delete old.servings;
        return old;
      }),
    };
    localStorage.setItem(`chefitto:v1:data:${u.id}`, JSON.stringify(legacy));
    const after = await repo.loadAll(u);
    expect(after.profile.household).toBe(2);
    expect(after.recipes.every((r) => r.servings === 4)).toBe(true);
    await repo.updateProfile(u, { ...after.profile, household: 5 });
    expect((await repo.loadAll(u)).profile.household).toBe(5);
  });

  it('conserve la photo d’une recette ajoutée', async () => {
    const repo = new LocalRepository();
    const u = await repo.signIn('a@b.fr');
    const r = await repo.addRecipe(u, {
      name: 'Tarte',
      category: 'Desserts',
      price: '—',
      timeMin: 30,
      level: 'Facile',
      description: '',
      ingredients: ['Pomme'],
      steps: ['Cuire'],
      servings: 6,
      imageUrl: 'https://img.test/tarte.webp',
    });
    expect((await repo.loadAll(u)).recipes.find((x) => x.id === r.id)?.imageUrl).toBe('https://img.test/tarte.webp');
  });
});
