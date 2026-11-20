import { describe, expect, it, vi } from 'vitest';
import { LocalRepository } from '../data/localRepository';
import { RepositoryError } from '../data/repository';
import type { ImageFinder } from '../data/recipeImages';
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

  it('ajout groupé : capitalise, ignore vides, doublons et aliments déjà au frigo', async () => {
    const { store } = await readyStore();
    const n = store.getState().fridge.length;
    const added = await store.getState().addFridgeItems([
      { name: 'lait', category: 'Autre' },
      { name: 'Tomates', category: 'Légume' }, // « Tomate » est déjà au frigo
      { name: ' ', category: 'Autre' },
      { name: 'Lait', category: 'Autre' },
      { name: 'poulet', category: 'Viande' },
    ]);
    expect(added).toBe(2);
    const fridge = store.getState().fridge;
    expect(fridge).toHaveLength(n + 2);
    expect(fridge.slice(0, 2).map((f) => f.name)).toEqual(['Lait', 'Poulet']);
    expect(fridge.some((f) => f.id.startsWith('tmp-'))).toBe(false);
    expect(await store.getState().addFridgeItems([{ name: 'Lait', category: 'Autre' }])).toBe(0);
  });

  it('ajout groupé : annule tout si l’enregistrement échoue', async () => {
    const { store, repo } = await readyStore();
    const n = store.getState().fridge.length;
    vi.spyOn(repo, 'addFridgeItems').mockRejectedValueOnce(new Error('Connexion réseau impossible'));
    expect(await store.getState().addFridgeItems([{ name: 'Kiwi', category: 'Fruit' }])).toBe(0);
    expect(store.getState().fridge).toHaveLength(n);
    expect(store.getState().toast?.text).toBe('Connexion réseau impossible');
  });

  it('supprime un aliment', async () => {
    const { store } = await readyStore();
    const id = store.getState().fridge[0]!.id;
    await store.getState().removeFridgeItem(id);
    expect(store.getState().fridge.some((f) => f.id === id)).toBe(false);
  });

  it('planifie et retire un repas daté, ferme la sheet', async () => {
    const { store, repo } = await readyStore();
    const id = store.getState().recipes[0]!.id;
    store.getState().openSheet({ type: 'pick', date: '2026-12-02', meal: 1 });
    expect(await store.getState().setPlanEntry('2026-12-02', 1, id)).toBe(true);
    expect(store.getState().plan['2026-12-02:1']).toBe(id);
    expect(store.getState().sheet).toBeNull();
    expect((await repo.loadAll(store.getState().user!)).plan).toEqual({ '2026-12-02:1': id });
    expect(await store.getState().setPlanEntry('2026-12-02', 1, null)).toBe(true);
    expect(store.getState().plan['2026-12-02:1']).toBeUndefined();
  });

  it('planification refusée : rollback, message, false', async () => {
    const { store, repo } = await readyStore();
    const id = store.getState().recipes[0]!.id;
    await store.getState().setPlanEntry('2026-11-16', 0, id);
    vi.spyOn(repo, 'setPlanEntry').mockRejectedValueOnce(new RepositoryError('Mettez à jour la base'));
    expect(await store.getState().setPlanEntry('2026-11-30', 0, id)).toBe(false);
    expect(store.getState().plan).toEqual({ '2026-11-16:0': id });
    expect(store.getState().toast?.text).toBe('Mettez à jour la base');
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

  it('modifie une recette (optimiste) et persiste', async () => {
    const { store, repo } = await readyStore();
    const r = store.getState().recipes[1]!;
    expect(await store.getState().updateRecipe(r.id, { ...r, name: 'Salade revisitée' })).toBe(true);
    expect(store.getState().recipes[1]).toEqual({ ...r, name: 'Salade revisitée' });
    expect((await repo.loadAll(store.getState().user!)).recipes[1]!.name).toBe('Salade revisitée');
  });

  it('modification refusée : rollback, message, false', async () => {
    const { store, repo } = await readyStore();
    vi.spyOn(repo, 'updateRecipe').mockRejectedValueOnce(new RepositoryError('Recette introuvable'));
    const r = store.getState().recipes[0]!;
    expect(await store.getState().updateRecipe(r.id, { ...r, name: 'Autre' })).toBe(false);
    expect(store.getState().recipes[0]).toEqual(r);
    expect(store.getState().toast?.text).toBe('Recette introuvable');
  });

  it('supprime des recettes, avec leurs favoris et créneaux du planning', async () => {
    const { store, repo } = await readyStore();
    const [a, b, c] = store.getState().recipes;
    await store.getState().toggleFavorite(a!.id);
    await store.getState().toggleFavorite(c!.id);
    await store.getState().setPlanEntry('2026-11-16', 0, a!.id);
    await store.getState().setPlanEntry('2026-11-17', 0, b!.id);
    await store.getState().setPlanEntry('2026-12-08', 1, c!.id);
    expect(await store.getState().deleteRecipes([a!.id, b!.id])).toBe(true);
    const st = store.getState();
    expect(st.recipes).toHaveLength(SEED_RECIPES.length - 2);
    expect(st.favorites).toEqual([c!.id]);
    expect(st.plan).toEqual({ '2026-12-08:1': c!.id });
    const saved = await repo.loadAll(st.user!);
    expect(saved.recipes).toHaveLength(SEED_RECIPES.length - 2);
    expect(saved.plan).toEqual({ '2026-12-08:1': c!.id });
  });

  it('suppression refusée : tout est restauré ; liste vide : rien à faire', async () => {
    const { store, repo } = await readyStore();
    const id = store.getState().recipes[0]!.id;
    await store.getState().toggleFavorite(id);
    await store.getState().setPlanEntry('2026-11-19', 0, id);
    const spy = vi.spyOn(repo, 'deleteRecipes').mockRejectedValueOnce(new Error('Connexion réseau impossible'));
    expect(await store.getState().deleteRecipes([id])).toBe(false);
    expect(store.getState().recipes[0]!.id).toBe(id);
    expect(store.getState().favorites).toEqual([id]);
    expect(store.getState().plan['2026-11-19:0']).toBe(id);
    expect(store.getState().toast?.text).toBe('Connexion réseau impossible');
    expect(await store.getState().deleteRecipes([])).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('profil refusé : affiche l’erreur, pas « Profil mis à jour »', async () => {
    const { store, repo } = await readyStore();
    vi.spyOn(repo, 'updateProfile').mockRejectedValueOnce(new Error('Connexion réseau impossible'));
    await store.getState().updateProfile({ name: 'X', email: 'toto@cuisine.fr', household: 3 });
    expect(store.getState().toast?.text).toBe('Connexion réseau impossible');
  });

  it('met à jour le profil et affiche un toast', async () => {
    const { store } = await readyStore();
    await store.getState().updateProfile({ name: ' Chef Toto ', email: 'toto@cuisine.fr', household: 3 });
    expect(store.getState().profile).toEqual({ name: 'Chef Toto', email: 'toto@cuisine.fr', household: 3 });
    // Taille hors bornes : la valeur précédente est conservée.
    await store.getState().updateProfile({ name: 'Chef Toto', email: 'toto@cuisine.fr', household: 0 });
    expect(store.getState().profile.household).toBe(3);
    expect(store.getState().toast?.text).toBe('Profil mis à jour');
  });

  it('ignore les mutations sans utilisateur', async () => {
    const store = createAppStore(new LocalRepository());
    await store.getState().toggleFavorite('x');
    expect(await store.getState().addFridgeItem('Kiwi', 'Fruit')).toBe(false);
    expect(await store.getState().addRecipe(SEED_RECIPES[0]!)).toBeNull();
    expect(await store.getState().updateRecipe('x', SEED_RECIPES[0]!)).toBe(false);
    expect(await store.getState().deleteRecipes(['x'])).toBe(false);
    expect(store.getState().favorites).toEqual([]);
  });

  it('gère sheet, toast et splash', () => {
    const store = createAppStore(new LocalRepository());
    store.getState().flash('a');
    const id1 = store.getState().toast!.id;
    store.getState().flash('a');
    expect(store.getState().toast!.id).toBeGreaterThan(id1);
    store.getState().openSheet({ type: 'plan', recipeId: 'r' });
    store.getState().openSheet({ type: 'plan', recipeId: 'r', week: '2026-11-23' });
    expect(store.getState().sheet).toEqual({ type: 'plan', recipeId: 'r', week: '2026-11-23' });
    store.getState().closeSheet();
    expect(store.getState().sheet).toBeNull();
    store.getState().setSplashSeen();
    expect(store.getState().splashSeen).toBe(true);
  });
});

describe('appStore — photos des recettes', () => {
  async function storeWith(find: ImageFinder['find']) {
    const repo = new LocalRepository();
    const finder = { find: vi.fn(find) };
    const store = createAppStore(repo, undefined, finder);
    await store.getState().init();
    await store.getState().signIn('toto@cuisine.fr', 'secret1');
    const user = store.getState().user!;
    const first = () => store.getState().recipes[0]!;
    return { repo, store, finder, user, first };
  }

  it('cherche une photo, l’affiche et la persiste (une seule fois par session)', async () => {
    const { repo, store, finder, user, first } = await storeWith(async () => 'https://img.test/1.webp');
    const id = first().id;
    await store.getState().ensureRecipeImage(id);
    expect(first().imageUrl).toBe('https://img.test/1.webp');
    expect((await repo.loadAll(user)).recipes.find((r) => r.id === id)?.imageUrl).toBe('https://img.test/1.webp');
    await store.getState().ensureRecipeImage(id);
    expect(finder.find).toHaveBeenCalledTimes(1);
  });

  it('ne cherche pas si la recette a déjà une photo, est inconnue ou sans utilisateur', async () => {
    const { store, finder, first } = await storeWith(async () => 'https://img.test/1.webp');
    store.setState({ recipes: [{ ...first(), imageUrl: 'https://img.test/deja.webp' }] });
    await store.getState().ensureRecipeImage(first().id);
    await store.getState().ensureRecipeImage('inconnue');
    await store.getState().signOut();
    await store.getState().ensureRecipeImage('x');
    expect(finder.find).not.toHaveBeenCalled();
  });

  it('dé-duplique les demandes simultanées', async () => {
    const { store, finder, first } = await storeWith(async () => 'https://img.test/1.webp');
    await Promise.all([store.getState().ensureRecipeImage(first().id), store.getState().ensureRecipeImage(first().id)]);
    expect(finder.find).toHaveBeenCalledTimes(1);
  });

  it('rien trouvé : garde l’illustration et ne réessaie pas', async () => {
    const { repo, store, finder, first } = await storeWith(async () => null);
    const save = vi.spyOn(repo, 'setRecipeImage');
    await store.getState().ensureRecipeImage(first().id);
    await store.getState().ensureRecipeImage(first().id);
    expect(first().imageUrl).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(finder.find).toHaveBeenCalledTimes(1);
  });

  it('erreur passagère : réessaie au prochain affichage', async () => {
    const { store, finder, first } = await storeWith(async () => 'https://img.test/1.webp');
    finder.find.mockRejectedValueOnce(new Error('hors ligne'));
    await store.getState().ensureRecipeImage(first().id);
    expect(first().imageUrl).toBeUndefined();
    await store.getState().ensureRecipeImage(first().id);
    expect(first().imageUrl).toBe('https://img.test/1.webp');
  });

  it('photo cassée : en cherche une autre en excluant la cassée', async () => {
    const { store, finder, first } = await storeWith(async (_r, exclude) =>
      exclude?.has('https://img.test/1.webp') ? 'https://img.test/2.webp' : 'https://img.test/1.webp',
    );
    await store.getState().ensureRecipeImage(first().id);
    // Signalement obsolète (la photo a déjà changé) : ignoré.
    await store.getState().ensureRecipeImage(first().id, 'https://img.test/autre.webp');
    expect(finder.find).toHaveBeenCalledTimes(1);
    await store.getState().ensureRecipeImage(first().id, 'https://img.test/1.webp');
    expect(first().imageUrl).toBe('https://img.test/2.webp');
    expect([...finder.find.mock.calls[1]![1]!]).toEqual(['https://img.test/1.webp']);
  });

  it('photo cassée sans remplaçant : revient à l’illustration et l’enregistre', async () => {
    const { repo, store, user, first } = await storeWith(async (_r, exclude) => (exclude?.size ? null : 'https://img.test/1.webp'));
    await store.getState().ensureRecipeImage(first().id);
    await store.getState().ensureRecipeImage(first().id, 'https://img.test/1.webp');
    expect(first().imageUrl).toBeNull();
    expect((await repo.loadAll(user)).recipes[0]!.imageUrl).toBeNull();
  });

  it('ignore le résultat si la recette a changé entre-temps', async () => {
    let release!: (v: string) => void;
    const { store, first } = await storeWith(() => new Promise<string>((r) => (release = r)));
    const pending = store.getState().ensureRecipeImage(first().id);
    store.setState({ recipes: [{ ...first(), imageUrl: 'https://img.test/importee.webp' }, ...store.getState().recipes.slice(1)] });
    release('https://img.test/trouvee.webp');
    await pending;
    expect(first().imageUrl).toBe('https://img.test/importee.webp');
  });

  it('un échec d’enregistrement n’empêche pas l’affichage', async () => {
    const { repo, store, first } = await storeWith(async () => 'https://img.test/1.webp');
    vi.spyOn(repo, 'setRecipeImage').mockRejectedValueOnce(new Error('réseau'));
    await store.getState().ensureRecipeImage(first().id);
    expect(first().imageUrl).toBe('https://img.test/1.webp');
    expect(store.getState().toast).toBeNull();
  });
});
