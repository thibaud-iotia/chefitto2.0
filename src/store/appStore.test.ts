import { describe, expect, it, vi } from 'vitest';
import { LocalRepository } from '../data/localRepository';
import { RepositoryError } from '../data/repository';
import { SEED_RECIPES } from '../domain/seed';
import { createAppStore } from './appStore';

async function readyStore() {
  const repo = new LocalRepository();
  const store = createAppStore(repo);
  await store.getState().init();
  await store.getState().signIn('toto@cuisine.fr', 'secret1');
  return { repo, store };
}

describe('appStore — auth', () => {
  it('démarre anonyme puis charge les données après connexion', async () => {
    const store = createAppStore(new LocalRepository());
    await store.getState().init();
    expect(store.getState().status).toBe('anon');
    expect(await store.getState().signIn('toto@cuisine.fr', 'x')).toBeNull();
    const s = store.getState();
    expect(s.status).toBe('ready');
    expect(s.recipes).toHaveLength(SEED_RECIPES.length);
    expect(s.fridge.length).toBeGreaterThan(0);
    expect(s.profile.email).toBe('toto@cuisine.fr');
  });

  it('restaure la session existante au démarrage', async () => {
    await readyStore();
    const again = createAppStore(new LocalRepository());
    await again.getState().init();
    expect(again.getState().status).toBe('ready');
  });

  it('signUp : demande confirmation si le repo ne renvoie pas d’utilisateur', async () => {
    const repo = new LocalRepository();
    vi.spyOn(repo, 'signUp').mockResolvedValueOnce(null as never);
    const store = createAppStore(repo);
    expect(await store.getState().signUp('a@b.fr', 'secret1')).toEqual({ error: null, needsConfirm: true });
  });

  it('remonte les erreurs d’auth', async () => {
    const repo = new LocalRepository();
    vi.spyOn(repo, 'signIn').mockRejectedValueOnce(new RepositoryError('Email ou mot de passe incorrect'));
    vi.spyOn(repo, 'signUp').mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(repo, 'resetPassword').mockRejectedValueOnce(new Error('nope'));
    const store = createAppStore(repo);
    expect(await store.getState().signIn('a@b.fr', 'x')).toBe('Email ou mot de passe incorrect');
    expect((await store.getState().signUp('a@b.fr', 'x')).error).toBe('boom');
    expect(await store.getState().resetPassword('a@b.fr')).toBe('nope');
  });

  it('signOut vide l’état', async () => {
    const { store } = await readyStore();
    await store.getState().signOut();
    expect(store.getState()).toMatchObject({ status: 'anon', user: null, recipes: [] });
  });

  it('passe en erreur si le chargement échoue', async () => {
    const repo = new LocalRepository();
    vi.spyOn(repo, 'loadAll').mockRejectedValueOnce(new Error('offline'));
    const store = createAppStore(repo);
    await store.getState().signIn('a@b.fr', 'x');
    expect(store.getState()).toMatchObject({ status: 'error', error: 'offline' });
    await store.getState().reload();
    expect(store.getState().status).toBe('ready');
  });
});

describe('appStore — mutations', () => {
  it('bascule un favori et persiste', async () => {
    const { store, repo } = await readyStore();
    const id = store.getState().recipes[0]!.id;
    await store.getState().toggleFavorite(id);
    expect(store.getState().favorites).toContain(id);
    expect((await repo.loadAll(store.getState().user!)).favorites).toContain(id);
    await store.getState().toggleFavorite(id);
    expect(store.getState().favorites).not.toContain(id);
  });

  it('rollback + toast si le serveur échoue', async () => {
    const { store, repo } = await readyStore();
    vi.spyOn(repo, 'setFavorite').mockRejectedValueOnce(new Error('Connexion réseau impossible'));
    const id = store.getState().recipes[0]!.id;
    await store.getState().toggleFavorite(id);
    expect(store.getState().favorites).not.toContain(id);
    expect(store.getState().toast?.text).toBe('Connexion réseau impossible');
  });

  it('ajoute un aliment (capitalisé) et refuse le vide', async () => {
    const { store } = await readyStore();
    expect(await store.getState().addFridgeItem('  ', 'Légume')).toBe(false);
    expect(store.getState().toast?.text).toBe('Saisissez un aliment');
    expect(await store.getState().addFridgeItem('poivron', 'Légume')).toBe(true);
    const first = store.getState().fridge[0]!;
    expect(first.name).toBe('Poivron');
    expect(first.id).not.toMatch(/^tmp-/);
  });

  it('retire l’aliment temporaire si l’ajout échoue', async () => {
    const { store, repo } = await readyStore();
    const n = store.getState().fridge.length;
    vi.spyOn(repo, 'addFridgeItem').mockRejectedValueOnce(new Error('x'));
    expect(await store.getState().addFridgeItem('Kiwi', 'Fruit')).toBe(false);
    expect(store.getState().fridge).toHaveLength(n);
  });

  it('supprime un aliment', async () => {
    const { store } = await readyStore();
    const id = store.getState().fridge[0]!.id;
    await store.getState().removeFridgeItem(id);
    expect(store.getState().fridge.some((f) => f.id === id)).toBe(false);
  });

  it('planifie et retire un repas, ferme la sheet', async () => {
    const { store } = await readyStore();
    const id = store.getState().recipes[0]!.id;
    store.getState().openSheet({ type: 'pick', day: 2, meal: 1 });
    await store.getState().setPlanEntry(2, 1, id);
    expect(store.getState().plan['2-1']).toBe(id);
    expect(store.getState().sheet).toBeNull();
    await store.getState().setPlanEntry(2, 1, null);
    expect(store.getState().plan['2-1']).toBeUndefined();
  });

  it('ajoute une recette en tête', async () => {
    const { store } = await readyStore();
    const r = await store.getState().addRecipe({ ...SEED_RECIPES[0]!, name: 'Pizza maison' });
    expect(r?.name).toBe('Pizza maison');
    expect(store.getState().recipes[0]!.name).toBe('Pizza maison');
  });

  it('addRecipe renvoie null en cas d’erreur', async () => {
    const { store, repo } = await readyStore();
    vi.spyOn(repo, 'addRecipe').mockRejectedValueOnce(new Error('x'));
    expect(await store.getState().addRecipe(SEED_RECIPES[0]!)).toBeNull();
  });

  it('met à jour le profil et affiche un toast', async () => {
    const { store } = await readyStore();
    await store.getState().updateProfile({ name: ' Chef Toto ', email: 'toto@cuisine.fr' });
    expect(store.getState().profile.name).toBe('Chef Toto');
    expect(store.getState().toast?.text).toBe('Profil mis à jour');
  });

  it('ignore les mutations sans utilisateur', async () => {
    const store = createAppStore(new LocalRepository());
    await store.getState().toggleFavorite('x');
    expect(await store.getState().addFridgeItem('Kiwi', 'Fruit')).toBe(false);
    expect(await store.getState().addRecipe(SEED_RECIPES[0]!)).toBeNull();
    expect(store.getState().favorites).toEqual([]);
  });

  it('gère sheet, toast et splash', () => {
    const store = createAppStore(new LocalRepository());
    store.getState().flash('a');
    const id1 = store.getState().toast!.id;
    store.getState().flash('a');
    expect(store.getState().toast!.id).toBeGreaterThan(id1);
    store.getState().openSheet({ type: 'plan', recipeId: 'r' });
    store.getState().closeSheet();
    expect(store.getState().sheet).toBeNull();
    store.getState().setSplashSeen();
    expect(store.getState().splashSeen).toBe(true);
  });
});
