/**
 * Tests de performance « nombre de rendus » (2/2) : la photo d'une recette (`RecipeImage`, mémoïsé)
 * ne se redessine pas quand l'écran qui l'affiche se redessine pour autre chose.
 * Sonde : `DishImage` (l'image elle-même) note chaque rendu ; un rendu noté = un rendu de `RecipeImage`.
 */
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toIsoDate } from '../domain/calendar';
import { bigFridge, bigRecipes } from '../test/bigData';
import { renderApp } from '../test/renderApp';

const drawn = vi.hoisted(() => [] as string[]);

vi.mock('../components/DishImage', () => ({
  DishImage: ({ size, src }: { size: number; src?: string | null }) => {
    drawn.push(`${size}:${src ?? ''}`);
    return null;
  },
}));

async function setup(route: string) {
  const app = await renderApp({ route, data: { recipes: bigRecipes(12), fridge: bigFridge(20), favorites: [], plan: {} } });
  drawn.length = 0;
  return app;
}

beforeEach(() => {
  drawn.length = 0;
});

describe('Accueil', () => {
  it('planifier un repas ne redessine aucune photo (cartes et suggestion du jour)', async () => {
    const { store } = await setup('/home');
    await act(() => store.getState().setPlanEntry(toIsoDate(), 0, 'r2'));
    expect(screen.getByText('repas planifiés').previousSibling).toHaveTextContent('1/14');
    expect(drawn).toEqual([]);
  });

  it('ajouter un favori ne redessine aucune photo', async () => {
    const { user } = await setup('/home');
    await user.click(screen.getByRole('button', { name: /Ajouter Recette n°3 .* aux favoris/ }));
    expect(screen.getByRole('button', { name: /Retirer Recette n°3 .* des favoris/ })).toBeInTheDocument();
    expect(drawn).toEqual([]);
  });

  it('un message (toast) ne redessine pas l’écran', async () => {
    const { store } = await setup('/home');
    act(() => store.getState().flash('Bonjour'));
    expect(await screen.findByText('Bonjour')).toBeInTheDocument();
    expect(drawn).toEqual([]);
  });

  it('une photo trouvée ne redessine que la recette concernée', async () => {
    const { store } = await setup('/home');
    act(() =>
      store.setState((s) => ({ recipes: s.recipes.map((r) => (r.id === 'r5' ? { ...r, imageUrl: 'https://img.chefitto.test/new.jpg' } : r)) })),
    );
    expect(drawn).toEqual(['132:https://img.chefitto.test/new.jpg']);
  });
});

describe('Fiche recette', () => {
  it('changer le nombre de personnes ne redessine pas la photo', async () => {
    const { user } = await setup('/recipe/r0');
    await user.click(screen.getByRole('button', { name: 'Une personne de plus' }));
    expect(screen.getByRole('group', { name: 'Nombre de personnes' })).toHaveTextContent('3 personnes');
    expect(drawn).toEqual([]);
  });

  it('ouvrir « Planifier » ne redessine pas la photo', async () => {
    const { user } = await setup('/recipe/r0');
    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(drawn).toEqual([]);
  });

  it('ajouter aux favoris ne redessine pas la photo', async () => {
    const { user } = await setup('/recipe/r0');
    await user.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    expect(screen.getByRole('button', { name: 'Retirer des favoris' })).toBeInTheDocument();
    expect(drawn).toEqual([]);
  });
});
