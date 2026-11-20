/**
 * Tests de performance « nombre de rendus » (1/2) : une interaction ne redessine que les cartes, créneaux
 * et étiquettes qui changent. Déterministes (aucune mesure de temps) : ils échouent si une mémoïsation casse
 * (callback recréé, objet passé en prop reconstruit à chaque rendu, abonnement au store trop large…).
 *
 * Sondes : `RecipeImage` (une par carte / créneau / vignette) et `FoodIcon` (une par aliment) sont remplacés
 * par des composants non mémoïsés qui notent chaque rendu : un rendu noté = un rendu du parent (carte,
 * créneau, étiquette). La mémoïsation de `RecipeImage` lui-même est vérifiée dans `imageRenders.test.tsx`.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toIsoDate } from '../domain/calendar';
import { bigFridge, bigRecipes } from '../test/bigData';
import { renderApp } from '../test/renderApp';

const renders = vi.hoisted(() => ({ images: [] as string[], icons: [] as string[] }));

vi.mock('../components/RecipeImage', () => ({
  RecipeImage: ({ recipe, size }: { recipe: { id: string }; size: number }) => {
    renders.images.push(`${size}:${recipe.id}`);
    return null;
  },
}));
vi.mock('../components/FoodIcon', () => ({
  FoodIcon: ({ name }: { name: string }) => {
    renders.icons.push(name);
    return null;
  },
}));

/** Rendus de la sonde photo pour une taille donnée (132 = carte de l'accueil, 72 = créneau, 44 = vignette). */
const drawn = (size: number) => renders.images.filter((r) => r.startsWith(`${size}:`)).map((r) => r.slice(String(size).length + 1));
const reset = () => {
  renders.images.length = 0;
  renders.icons.length = 0;
};

async function setup(route: string) {
  const app = await renderApp({ route, data: { recipes: bigRecipes(12), fridge: bigFridge(20), favorites: [], plan: {} } });
  reset();
  return app;
}

beforeEach(reset);

describe('Accueil', () => {
  it('ajouter un favori ne redessine que la carte concernée', async () => {
    const { user } = await setup('/home');
    await user.click(screen.getByRole('button', { name: /Ajouter Recette n°3 .* aux favoris/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Retirer Recette n°3 .* des favoris/ })).toBeInTheDocument());
    expect(drawn(132)).toEqual(['r3']);
  });

  it('taper dans la recherche ne redessine pas les cartes qui restent affichées', async () => {
    const { user } = await setup('/home');
    await user.type(screen.getByRole('searchbox'), 'n°1');
    // r1, r10, r11 restent affichées : déjà dessinées, rien n'a changé pour elles.
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Recettes' })).getAllByRole('listitem')).toHaveLength(3));
    expect(drawn(132)).toEqual([]);
  });

  it('planifier un repas ne redessine aucune carte', async () => {
    const { store } = await setup('/home');
    await act(() => store.getState().setPlanEntry(toIsoDate(), 0, 'r2'));
    expect(screen.getByText('repas planifiés').previousSibling).toHaveTextContent('1/14');
    expect(drawn(132)).toEqual([]);
  });

  it('un aliment sans rapport avec les recettes ne redessine aucune carte', async () => {
    const { store } = await setup('/home');
    await act(() => store.getState().addFridgeItem('Topinambour', 'Légume'));
    expect(screen.getByText('aliments au frigo').previousSibling).toHaveTextContent('21');
    expect(drawn(132)).toEqual([]);
  });

  it('un aliment utile ne redessine que les cartes dont le score change', async () => {
    const { store } = await setup('/home');
    await act(() => store.getState().addFridgeItem('Riz', 'Autre'));
    const withRice = store
      .getState()
      .recipes.filter((r) => r.ingredients.some((i) => i.includes('Riz')))
      .map((r) => r.id);
    expect(withRice.length).toBeGreaterThan(0);
    expect(drawn(132).sort()).toEqual(withRice.sort());
  });

  it('entrer en mode sélection redessine chaque carte une seule fois', async () => {
    await setup('/home');
    const card = screen.getByRole('link', { name: /Recette n°2 / }).closest('li')!;
    fireEvent.contextMenu(card);
    expect(await screen.findByText('1 sélectionnée')).toBeInTheDocument();
    expect(drawn(132)).toHaveLength(12);
    expect(new Set(drawn(132)).size).toBe(12);
  });
});

describe('Planning', () => {
  it('ouvrir le choix du plat ne redessine pas le créneau ; la feuille dessine chaque vignette une fois', async () => {
    const { user, store } = await setup('/planning');
    await act(() => store.getState().setPlanEntry(toIsoDate(), 0, 'r4'));
    reset();
    await user.click(screen.getByRole('button', { name: /Changer le repas/ }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(drawn(72)).toEqual([]);
    expect(drawn(44)).toHaveLength(12);
    expect(new Set(drawn(44)).size).toBe(12);
  });

  it('feuille fermée : modifier le frigo ne redessine rien dans le planning', async () => {
    const { store } = await setup('/planning');
    await act(() => store.getState().setPlanEntry(toIsoDate(), 0, 'r4'));
    reset();
    await act(() => store.getState().addFridgeItem('Riz', 'Autre'));
    expect(renders.images).toEqual([]);
  });
});

describe('Frigo', () => {
  it('taper un aliment ne redessine pas les étiquettes', async () => {
    const { user } = await setup('/fridge');
    await user.type(screen.getByLabelText('Nouvel aliment'), 'Poivron');
    expect(renders.icons).toEqual([]);
  });

  it('changer de catégorie ne redessine pas les étiquettes', async () => {
    const { user } = await setup('/fridge');
    await user.click(screen.getByRole('button', { name: 'Fruit' }));
    expect(renders.icons).toEqual([]);
  });

  it('retirer un aliment ne redessine pas les autres', async () => {
    const { store } = await setup('/fridge');
    const [first] = store.getState().fridge;
    fireEvent.click(screen.getByRole('button', { name: `Retirer ${first!.name}` }));
    await waitFor(() => expect(store.getState().fridge).toHaveLength(19));
    expect(renders.icons).toEqual([]);
  });

  it('ajouter un aliment ne dessine que sa nouvelle étiquette', async () => {
    const { user } = await setup('/fridge');
    await user.type(screen.getByLabelText('Nouvel aliment'), 'Navet');
    reset();
    await user.click(screen.getByRole('button', { name: 'Ajouter au frigo' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirer Navet' })).toBeInTheDocument());
    expect([...new Set(renders.icons)]).toEqual(['Navet']);
  });
});
