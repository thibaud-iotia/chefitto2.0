import { afterEach, describe, expect, it, vi } from 'vitest';
import { asRecipeUrl, createRecipeImporter, defaultImporter, ImportError } from './recipeImport';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const page = { results: [{ url: 'https://www.marmiton.org/recettes/recette_a_1.aspx', name: 'A' }], page: 1, hasMore: false };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('createRecipeImporter', () => {
  it('appelle la recherche avec jeton et apikey, puis met en cache', async () => {
    const fetchImpl = vi.fn(async () => json(page));
    const importer = createRecipeImporter({
      endpoint: 'https://proj.supabase.co/functions/v1/recipe-import',
      apiKey: 'anon',
      getToken: async () => 'jwt',
      fetchImpl,
    });
    expect(await importer.search('  risotto ', 1)).toEqual(page);
    expect(await importer.search('risotto', 1)).toEqual(page);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/functions/v1/recipe-import?q=risotto&page=1');
    expect(init.headers).toEqual({ Accept: 'application/json', apikey: 'anon', Authorization: 'Bearer jwt' });
  });

  it('expire le cache et borne sa taille', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => json(page));
    const importer = createRecipeImporter({ endpoint: 'api/recipe-import', fetchImpl, cacheMs: 1000 });
    await importer.search('a1');
    vi.advanceTimersByTime(1500);
    await importer.search('a1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 45; i++) await importer.search(`q${i}`);
    await importer.search('q0'); // évincée (plus ancienne)
    expect(fetchImpl).toHaveBeenCalledTimes(2 + 45 + 1);
    vi.useRealTimers();
  });

  it('résout un endpoint relatif et importe une recette', async () => {
    const recipe = { name: 'Risotto' };
    const fetchImpl = vi.fn(async () => json({ recipe }));
    const importer = createRecipeImporter({ endpoint: 'api/recipe-import', fetchImpl });
    expect(await importer.fetchRecipe(' https://www.marmiton.org/x ')).toEqual(recipe);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(new URL('api/recipe-import?url=https%3A%2F%2Fwww.marmiton.org%2Fx', document.baseURI).toString());
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it.each([
    [json({ error: 'Lien non autorisé' }, 400), 'input', 'Lien non autorisé'],
    [json({ error: 'Connectez-vous' }, 401), 'auth', 'Connectez-vous'],
    [json({ error: 'Aucune recette trouvée sur cette page' }, 422), 'source', 'Aucune recette trouvée sur cette page'],
    [json({}, 502), 'source', 'Erreur 502'],
    [new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } }), 'unavailable', /pas disponible/],
    [new Response('{oops', { status: 200, headers: { 'content-type': 'application/json' } }), 'unavailable', /pas disponible/],
  ])('traduit les erreurs HTTP (%#)', async (res, kind, message) => {
    const importer = createRecipeImporter({ endpoint: 'api/recipe-import', fetchImpl: vi.fn(async () => res) });
    const err = await importer.search('tarte').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).kind).toBe(kind);
    expect((err as ImportError).message).toMatch(message);
  });

  it('distingue hors-ligne, service injoignable et annulation', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const importer = createRecipeImporter({ endpoint: 'api/recipe-import', fetchImpl: failing });
    await expect(importer.search('tarte')).rejects.toMatchObject({ kind: 'unavailable' });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(importer.search('tarte')).rejects.toMatchObject({ kind: 'offline' });
    vi.restoreAllMocks();

    const ac = new AbortController();
    ac.abort();
    const aborting = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    const err = await createRecipeImporter({ endpoint: 'api/recipe-import', fetchImpl: aborting })
      .search('tarte', 1, ac.signal)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
  });
});

describe('defaultImporter', () => {
  const call = async (mode: 'local' | 'supabase') => {
    const fetchMock = vi.fn(async () => json(page));
    vi.stubGlobal('fetch', fetchMock);
    await defaultImporter(mode, async () => 'jwt').search('pizza');
    return fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  };

  it('mode local : middleware /api/recipe-import, sans jeton', async () => {
    const [url, init] = await call('local');
    expect(new URL(url).pathname).toMatch(/\/api\/recipe-import$/);
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it('mode Supabase : Edge Function avec jeton', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co/');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const [url, init] = await call('supabase');
    expect(url).toBe('https://proj.supabase.co/functions/v1/recipe-import?q=pizza&page=1');
    expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer jwt' });
  });

  it('VITE_IMPORT_URL prioritaire', async () => {
    vi.stubEnv('VITE_IMPORT_URL', 'https://import.example.com/api');
    const [url] = await call('local');
    expect(url).toBe('https://import.example.com/api?q=pizza&page=1');
  });
});

describe('asRecipeUrl', () => {
  it.each([
    ['https://www.marmiton.org/recettes/x.aspx', 'https://www.marmiton.org/recettes/x.aspx'],
    ['  http://750g.com/a-r1.htm ', 'http://750g.com/a-r1.htm'],
    ['www.cuisineaz.com/recettes/quiche.aspx', 'https://www.cuisineaz.com/recettes/quiche.aspx'],
    ['marmiton.org/recettes/y', 'https://marmiton.org/recettes/y'],
  ])('%s est un lien', (input, expected) => {
    expect(asRecipeUrl(input)).toBe(expected);
  });

  it.each(['risotto', 'tarte aux pommes', 'marmiton.org', 'https://', 'http://localhost/x', ''])('« %s » est une recherche', (input) => {
    expect(asRecipeUrl(input)).toBeNull();
  });
});
