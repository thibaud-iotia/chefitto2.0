import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS } from '../components/hooks';
import { SEED_RECIPES } from '../domain/seed';
import { renderApp } from '../test/renderApp';

const VEGGIE = 'Veggie tomato mix';
const FISH = 'Spicy fish sauce';

const list = () => screen.getByRole('list', { name: 'Recettes' });
const cards = () => within(list()).getAllByRole('listitem');
const toolbar = () => screen.queryByRole('group', { name: 'Recettes sélectionnées' });

/** Appui long au doigt sur la carte, relâché, suivi du clic que le navigateur émet au relâchement. */
function longPress(name: string) {
  vi.useFakeTimers();
  try {
    const link = screen.getByRole('link', { name });
    fireEvent.pointerDown(link, { button: 0, clientX: 50, clientY: 50, pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    // Le lien est devenu une case à cocher : c'est elle qui reçoit le relâchement et le clic.
    const target = screen.getByRole('button', { name, pressed: true });
    fireEvent.pointerUp(target);
    fireEvent.click(target, { detail: 1 });
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => vi.useRealTimers());

describe('Accueil — sélection par appui long', () => {
  it('appui long : sélectionne sans ouvrir la recette ; coche, décoche, annule', async () => {
    const { user } = await renderApp({ route: '/home' });
    expect(toolbar()).not.toBeInTheDocument();

    longPress(VEGGIE);
    expect(screen.getByText(/Que cuisine-t-on/)).toBeInTheDocument(); // pas de navigation
    expect(toolbar()).toHaveTextContent('1 sélectionnée');
    expect(screen.getByRole('button', { name: VEGGIE, pressed: true })).toBeInTheDocument();
    // En mode sélection, plus de lien ni de cœur : un appui coche / décoche.
    expect(within(list()).queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /aux favoris/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: FISH, pressed: false }));
    expect(toolbar()).toHaveTextContent('2 sélectionnées');
    expect(within(toolbar()!).getByRole('button', { name: 'Modifier' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: FISH, pressed: true }));
    expect(toolbar()).toHaveTextContent('1 sélectionnée');
    expect(within(toolbar()!).getByRole('button', { name: 'Modifier' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Annuler la sélection' }));
    expect(toolbar()).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: VEGGIE })).toBeInTheDocument();
  });

  it('décocher la dernière recette quitte le mode sélection', async () => {
    const { user } = await renderApp({ route: '/home' });
    longPress(VEGGIE);
    await user.click(screen.getByRole('button', { name: VEGGIE, pressed: true }));
    expect(toolbar()).not.toBeInTheDocument();
  });

  it('un défilement (doigt qui bouge) ou un appui court ne sélectionne pas', async () => {
    vi.useFakeTimers();
    await renderApp({ route: '/home' });
    const link = screen.getByRole('link', { name: VEGGIE });
    fireEvent.pointerDown(link, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(link, { clientX: 50, clientY: 90 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    expect(toolbar()).not.toBeInTheDocument();

    fireEvent.pointerDown(link, { button: 0, clientX: 50, clientY: 50 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS / 2));
    fireEvent.pointerUp(link);
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(toolbar()).not.toBeInTheDocument();
  });

  it('menu contextuel (clic droit, touche Menu) sélectionne et garde le focus sur la carte', async () => {
    const { user } = await renderApp({ route: '/home' });
    screen.getByRole('link', { name: VEGGIE }).focus();
    fireEvent.contextMenu(screen.getByRole('link', { name: VEGGIE }));
    const box = screen.getByRole('button', { name: VEGGIE, pressed: true });
    expect(box).toHaveFocus();
    // Clavier : Entrée / Espace décoche (le clic clavier n'est pas pris pour la fin d'un appui long).
    await user.keyboard('{Enter}');
    expect(toolbar()).not.toBeInTheDocument();
  });

  it('Échap ou changement de filtre vide la sélection', async () => {
    const { user } = await renderApp({ route: '/home' });
    longPress(VEGGIE);
    await user.keyboard('{Escape}');
    expect(toolbar()).not.toBeInTheDocument();

    longPress(VEGGIE);
    await user.click(screen.getByRole('tab', { name: 'Desserts' }));
    expect(toolbar()).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Tout' }));
    longPress(VEGGIE);
    await user.type(screen.getByRole('searchbox'), 'v');
    expect(toolbar()).not.toBeInTheDocument();
  });
});

describe('Accueil — suppression', () => {
  it('supprime une recette après confirmation, et la retire du planning et des favoris', async () => {
    const { user, store } = await renderApp({ route: '/home' });
    const id = store.getState().recipes[0]!.id;
    await act(() => store.getState().toggleFavorite(id));
    await act(() => store.getState().setPlanEntry(2, 1, id));

    longPress(VEGGIE);
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    const dialog = screen.getByRole('dialog', { name: `Supprimer « ${VEGGIE} » ?` });
    expect(dialog).toHaveTextContent('retirée du planning'); // prévenu : un repas planifié disparaît
    await user.click(within(dialog).getByRole('button', { name: /Supprimer définitivement/ }));

    expect(await screen.findByText('Recette supprimée')).toBeInTheDocument();
    expect(cards()).toHaveLength(SEED_RECIPES.length - 1);
    expect(screen.queryByRole('link', { name: VEGGIE })).not.toBeInTheDocument();
    expect(toolbar()).not.toBeInTheDocument();
    expect(store.getState().favorites).toEqual([]);
    expect(store.getState().plan).toEqual({});
  });

  it('plusieurs recettes ; « Annuler » ou Échap dans la confirmation ne supprime rien', async () => {
    const { user } = await renderApp({ route: '/home' });
    longPress(VEGGIE);
    await user.click(screen.getByRole('button', { name: FISH, pressed: false }));

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    let dialog = screen.getByRole('dialog', { name: 'Supprimer 2 recettes ?' });
    expect(dialog).toHaveTextContent('irréversible'); // aucune n'est planifiée
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog', { name: /Supprimer 2/ })).not.toBeInTheDocument();
    expect(toolbar()).toHaveTextContent('2 sélectionnées'); // sélection conservée
    expect(cards()).toHaveLength(SEED_RECIPES.length);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /Supprimer 2/ })).not.toBeInTheDocument();
    expect(toolbar()).toHaveTextContent('2 sélectionnées'); // Échap ferme d'abord la confirmation

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    dialog = screen.getByRole('dialog', { name: 'Supprimer 2 recettes ?' });
    await user.click(within(dialog).getByRole('button', { name: /Supprimer définitivement/ }));
    expect(await screen.findByText('2 recettes supprimées')).toBeInTheDocument();
    expect(cards()).toHaveLength(SEED_RECIPES.length - 2);
  });

  it('échec du serveur : recettes restaurées, message, sélection conservée', async () => {
    const { user, repo } = await renderApp({ route: '/home' });
    vi.spyOn(repo, 'deleteRecipes').mockRejectedValueOnce(new Error('Connexion réseau impossible'));
    longPress(VEGGIE);
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.click(screen.getByRole('button', { name: /Supprimer définitivement/ }));
    expect(await screen.findByText('Connexion réseau impossible')).toBeInTheDocument();
    expect(cards()).toHaveLength(SEED_RECIPES.length);
    expect(toolbar()).toHaveTextContent('1 sélectionnée');
  });
});

describe('Modifier une recette', () => {
  it('formulaire pré-rempli ; enregistre et revient à l’accueil ; le brouillon « Nouvelle recette » est intact', async () => {
    const { user, store } = await renderApp({ route: '/home' });
    // Brouillon de création en cours, qui ne doit pas être écrasé.
    await user.click(screen.getByRole('button', { name: 'Ajouter une recette' }));
    await user.type(screen.getByLabelText('Nom du plat'), 'Brouillon');
    await user.click(screen.getByRole('link', { name: 'Accueil' }));

    longPress(VEGGIE);
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.getByRole('heading', { name: 'Modifier la recette' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nom du plat')).toHaveValue(VEGGIE);
    expect(screen.getByLabelText('Ingrédients')).toHaveValue(SEED_RECIPES[0]!.ingredients.join('\n'));
    expect(screen.getByLabelText('Étape 1')).toHaveValue(SEED_RECIPES[0]!.steps[0]);

    await user.clear(screen.getByLabelText('Nom du plat'));
    await user.type(screen.getByLabelText('Nom du plat'), 'Veggie du jardin');
    await user.click(screen.getByRole('button', { name: 'Desserts' }));
    await user.click(screen.getByRole('button', { name: 'Une personne de plus' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Recette modifiée')).toBeInTheDocument();
    // Navigation après un `await` : rendue dans une transition, on attend l'accueil.
    expect(await screen.findByText(/Que cuisine-t-on/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Veggie du jardin' })).toBeInTheDocument();
    expect(toolbar()).not.toBeInTheDocument();
    const saved = store.getState().recipes[0]!;
    expect(saved).toMatchObject({
      name: 'Veggie du jardin',
      category: 'Desserts',
      servings: SEED_RECIPES[0]!.servings + 1,
      timeMin: SEED_RECIPES[0]!.timeMin, // conservés
      level: SEED_RECIPES[0]!.level,
      price: SEED_RECIPES[0]!.price,
    });
    expect(store.getState().recipes).toHaveLength(SEED_RECIPES.length);

    await user.click(screen.getByRole('button', { name: 'Ajouter une recette' }));
    expect(screen.getByLabelText('Nom du plat')).toHaveValue('Brouillon');
  });

  it('nom vide refusé ; « Retour » abandonne les changements', async () => {
    const { user, store } = await renderApp({ route: '/home' });
    longPress(VEGGIE);
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    await user.clear(screen.getByLabelText('Nom du plat'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Donnez un nom au plat')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByText(/Que cuisine-t-on/)).toBeInTheDocument();
    expect(store.getState().recipes[0]!.name).toBe(VEGGIE);
  });

  it('échec du serveur : reste sur le formulaire avec le message', async () => {
    const { user, repo } = await renderApp({ route: '/home' });
    vi.spyOn(repo, 'updateRecipe').mockRejectedValueOnce(new Error('Recette introuvable'));
    longPress(VEGGIE);
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Recette introuvable')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Modifier la recette' })).toBeInTheDocument();
  });

  it('recette inconnue : retour à l’accueil', async () => {
    await renderApp({ route: '/recipe/inconnue/edit' });
    expect(screen.getByText(/Que cuisine-t-on/)).toBeInTheDocument();
  });
});
