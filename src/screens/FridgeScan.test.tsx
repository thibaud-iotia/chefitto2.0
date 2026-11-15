import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanError, type DetectedFood, type FridgeScanner } from '../data/fridgeScan';
import { renderApp } from '../test/renderApp';

// jsdom n'a ni canvas ni décodage d'image : la préparation est simulée.
vi.mock('../data/imagePrep', () => ({
  prepareImage: vi.fn(async () => ({ mediaType: 'image/jpeg', data: 'QUJD' })),
}));

afterEach(cleanup);

const photo = (name = 'frigo.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText('Choisir des photos'), { target: { files } });

const FOUND: DetectedFood[] = [
  { name: 'Lait', category: 'Autre', confidence: 'high' },
  { name: 'Tomates', category: 'Légume', confidence: 'high' },
  { name: 'Champignon', category: 'Légume', confidence: 'low' },
];

describe('Frigo — scan photo', () => {
  it('photo → revue (déjà au frigo décoché, à vérifier) → correction → ajout groupé', async () => {
    const scan = vi.fn<FridgeScanner['scan']>(async () => FOUND);
    const { user, store } = await renderApp({ route: '/fridge', scanner: { scan } });
    const n = store.getState().fridge.length;

    pick([photo()]);
    expect(await screen.findByRole('heading', { name: '3 aliments détectés' })).toBeInTheDocument();
    expect(scan).toHaveBeenCalledWith([{ mediaType: 'image/jpeg', data: 'QUJD' }], expect.any(AbortSignal));

    expect(screen.getByRole('checkbox', { name: 'Ajouter Lait' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ajouter Tomates' })).not.toBeChecked();
    expect(screen.getByText('Déjà au frigo')).toBeInTheDocument();
    expect(screen.getByText('À vérifier')).toBeInTheDocument();

    const name = screen.getAllByRole('textbox', { name: "Nom de l'aliment" })[2]!;
    await user.clear(name);
    await user.type(name, 'Champignon de Paris');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Catégorie de Lait' }), 'Autre');

    await user.click(screen.getByRole('button', { name: 'Ajouter 2 aliments' }));
    expect(await screen.findByText('2 aliments ajoutés au frigo')).toBeInTheDocument();
    expect(store.getState().fridge).toHaveLength(n + 2);
    expect(within(screen.getByRole('region', { name: 'Légume' })).getByText('Champignon de Paris')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Galerie/ })).toBeInTheDocument();
  });

  it('tout décocher désactive l’ajout ; Annuler revient à l’accueil du scan', async () => {
    const { user } = await renderApp({ route: '/fridge', scanner: { scan: async () => FOUND.slice(0, 1) } });
    pick([photo()]);
    await user.click(await screen.findByRole('checkbox', { name: 'Ajouter Lait' }));
    expect(screen.getByRole('button', { name: 'Aucun aliment sélectionné' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: /Photo/ })).toBeInTheDocument();
  });

  it('limite à 4 photos et prévient', async () => {
    const scan = vi.fn<FridgeScanner['scan']>(async () => []);
    await renderApp({ route: '/fridge', scanner: { scan } });
    pick([1, 2, 3, 4, 5].map((i) => photo(`p${i}.jpg`)));
    expect(await screen.findByText('Aucun aliment reconnu. Essayez une photo plus nette et mieux éclairée.')).toBeInTheDocument();
    expect(scan.mock.calls[0]![0]).toHaveLength(4);
  });

  it('affiche l’erreur du service et revient à l’état initial', async () => {
    const scan = async () => {
      throw new ScanError('Service très sollicité : réessayez dans une minute.', 'busy');
    };
    await renderApp({ route: '/fridge', scanner: { scan } });
    pick([photo()]);
    expect(await screen.findByText('Service très sollicité : réessayez dans une minute.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Galerie/ })).toBeInTheDocument();
  });

  it('annulation pendant l’analyse', async () => {
    const scan: FridgeScanner['scan'] = (_imgs, signal) =>
      new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const { user } = await renderApp({ route: '/fridge', scanner: { scan } });
    pick([photo(), photo('b.jpg')]);
    expect(await screen.findByText('Analyse des 2 photos…')).toHaveAttribute('role', 'status');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: /Galerie/ })).toBeInTheDocument();
    expect(screen.queryByText(/Analyse des/)).not.toBeInTheDocument();
  });
});
