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
});
