import { describe, expect, it, vi } from 'vitest';
import { ImportError, type RecipeImporter, type SearchPage } from './recipeImport';
import { createImageFinder, noImageFinder } from './recipeImages';

const page = (...images: (string | null)[]): SearchPage => ({
  page: 1,
  hasMore: false,
  results: images.map((imageUrl, i) => ({
    url: `https://www.marmiton.org/recettes/recette_${i}.aspx`,
    name: `R${i}`,
    imageUrl,
    rating: null,
    reviews: null,
    category: null,
    source: 'marmiton.org',
  })),
});

function importer(search: (q: string) => Promise<SearchPage>): RecipeImporter & { search: ReturnType<typeof vi.fn> } {
  return { search: vi.fn(search), fetchRecipe: vi.fn() } as never;
}

const mousse = { name: 'Mousse au chocolat', ingredients: ['Chocolat', 'Oeuf', 'Sucre'] };

describe('createImageFinder', () => {
  it('prend la première photo valide du premier résultat', async () => {
    const imp = importer(async () => page(null, 'javascript:x', 'https://img.test/1.webp', 'https://img.test/2.webp'));
    expect(await createImageFinder(imp).find(mousse)).toBe('https://img.test/1.webp');
    expect(imp.search).toHaveBeenCalledWith('Mousse au chocolat', 1);
  });

  it('se rabat sur les ingrédients si le nom ne donne rien', async () => {
    const imp = importer(async (q) => (q === 'Chocolat Oeuf' ? page('https://img.test/choco.webp') : page()));
    expect(await createImageFinder(imp).find(mousse)).toBe('https://img.test/choco.webp');
    expect(imp.search.mock.calls.map((c) => c[0])).toEqual(['Mousse au chocolat', 'Chocolat Oeuf']);
  });

  it('renvoie null si rien n’est trouvé', async () => {
    expect(await createImageFinder(importer(async () => page(null))).find(mousse)).toBeNull();
    expect(await createImageFinder(importer(async () => page())).find({ name: 'x', ingredients: [] })).toBeNull();
    expect(await noImageFinder.find(mousse)).toBeNull();
  });

  it('exclut les photos cassées', async () => {
    const imp = importer(async () => page('https://img.test/1.webp', 'https://img.test/2.webp'));
    const finder = createImageFinder(imp);
    expect(await finder.find(mousse, new Set(['https://img.test/1.webp']))).toBe('https://img.test/2.webp');
    expect(await finder.find(mousse, new Set(['https://img.test/1.webp', 'https://img.test/2.webp']))).toBeNull();
  });

  it('met en cache et dé-duplique les recherches identiques', async () => {
    const imp = importer(async () => page('https://img.test/1.webp'));
    const finder = createImageFinder(imp);
    const [a, b] = await Promise.all([finder.find(mousse), finder.find({ ...mousse, name: 'mousse  AU chocolat' })]);
    expect(a).toBe(b);
    await finder.find(mousse);
    expect(imp.search).toHaveBeenCalledTimes(1);
  });

  it('limite les recherches simultanées', async () => {
    let running = 0;
    let peak = 0;
    const imp = importer(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return page('https://img.test/x.webp');
    });
    const finder = createImageFinder(imp, { concurrency: 2 });
    const names = ['Tarte', 'Quiche', 'Gratin', 'Soupe', 'Salade'];
    const found = await Promise.all(names.map((name) => finder.find({ name, ingredients: [] })));
    expect(found).toEqual(names.map(() => 'https://img.test/x.webp'));
    expect(imp.search).toHaveBeenCalledTimes(5);
    expect(peak).toBe(2);
  });

  it('erreur passagère : rejette sans mettre en cache, le nouvel essai aboutit', async () => {
    const imp = importer(async () => page('https://img.test/1.webp'));
    imp.search.mockRejectedValueOnce(new ImportError('hors ligne', 'offline'));
    const finder = createImageFinder(imp);
    await expect(finder.find(mousse)).rejects.toThrow('hors ligne');
    expect(await finder.find(mousse)).toBe('https://img.test/1.webp');
    expect(imp.search).toHaveBeenCalledTimes(2);
  });
});
