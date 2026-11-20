import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StepVideo, StepVideoFinder } from '../data/stepVideos';
import { renderApp } from '../test/renderApp';

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const vid = (id: string, title: string): StepVideo => ({ id, title, channel: 'Chef Max' });
const RECIPE = {
  id: 'r1',
  name: 'Risotto au chorizo',
  category: 'Plats' as const,
  price: '—',
  timeMin: 30,
  level: 'Facile' as const,
  description: '',
  ingredients: ['Riz', 'Chorizo'],
  steps: ['Émincer les échalotes.', 'Nacrer le riz.', 'Servir.'],
  servings: 4,
};

function deferredFinder() {
  let resolve!: (v: (StepVideo | null)[]) => void;
  let reject!: (e: unknown) => void;
  const find = vi.fn(
    () =>
      new Promise<(StepVideo | null)[]>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return { finder: { find } as StepVideoFinder, find, resolve: (v: (StepVideo | null)[]) => resolve(v), reject: (e: unknown) => reject(e) };
}

describe('Mode cuisine — vidéo par étape', () => {
  it('chargement, miniature, lecture au toucher, changement d’étape et étape sans vidéo', async () => {
    const d = deferredFinder();
    const { user } = await renderApp({ route: '/recipe/r1/cook', videos: d.finder, data: { recipes: [RECIPE] } });
    expect(d.find).toHaveBeenCalledTimes(1);
    expect(d.find).toHaveBeenCalledWith({ name: 'Risotto au chorizo', steps: RECIPE.steps });
    expect(screen.getByText('Recherche d’une vidéo pour cette étape…')).toBeInTheDocument();

    d.resolve([vid(A, 'Émincer une échalote'), vid(B, 'Nacrer le riz'), null]);
    const play = await screen.findByRole('button', { name: 'Lire la vidéo « Émincer une échalote »' });
    expect(play.querySelector('img')).toHaveAttribute('src', `https://i.ytimg.com/vi/${A}/hqdefault.jpg`);
    expect(screen.getByText('Chef Max · YouTube')).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();

    await user.click(play);
    const iframe = screen.getByTitle('Vidéo : Émincer une échalote');
    expect(iframe).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${A}?autoplay=1&playsinline=1&rel=0`);
    expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

    // Étape suivante : la vidéo en cours s'arrête, la miniature de l'étape 2 s'affiche.
    await user.click(screen.getByRole('button', { name: 'Étape suivante' }));
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: 'Lire la vidéo « Nacrer le riz »' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Étape suivante' }));
    expect(screen.getByText('Servir.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lire la vidéo/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Recherche d’une vidéo/)).not.toBeInTheDocument();
    expect(d.find).toHaveBeenCalledTimes(1);
  });

  it('service indisponible : étapes affichées sans vidéo', async () => {
    const d = deferredFinder();
    await renderApp({ route: '/recipe/r1/cook', videos: d.finder, data: { recipes: [RECIPE] } });
    d.reject(new Error('Les vidéos ne sont pas configurées'));
    await waitFor(() => expect(screen.queryByText(/Recherche d’une vidéo/)).not.toBeInTheDocument());
    expect(screen.getByText('Émincer les échalotes.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lire la vidéo/ })).not.toBeInTheDocument();
  });

  it('miniature introuvable : bouton de lecture conservé, sans image', async () => {
    const finder: StepVideoFinder = { find: async () => [vid(A, 'Émincer'), null, null] };
    await renderApp({ route: '/recipe/r1/cook', videos: finder, data: { recipes: [RECIPE] } });
    const play = await screen.findByRole('button', { name: 'Lire la vidéo « Émincer »' });
    play.querySelector('img')!.dispatchEvent(new Event('error'));
    await waitFor(() => expect(play.querySelector('img')).toBeNull());
    expect(play).toBeInTheDocument();
  });

  it('étape longue affichée en plus petit', async () => {
    const long = { ...RECIPE, steps: ['x'.repeat(150), 'Court.'] };
    await renderApp({ route: '/recipe/r1/cook', data: { recipes: [long] } });
    expect(screen.getByText('x'.repeat(150))).toHaveClass('cookTextLong');
  });
});
