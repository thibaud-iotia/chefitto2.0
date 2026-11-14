// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertPublicHttpUrl,
  cleanText,
  decodeEntities,
  extractJsonLdRecipe,
  fetchHtml,
  handleImportRequest,
  ImportFailure,
  mapCategory,
  mapLevel,
  mapPrice,
  marmitonSearchUrl,
  parseIsoDuration,
  parseMarmitonSearch,
  toImportedRecipe,
  type ImportedRecipe,
  type SearchPage,
} from './recipeScraper.ts';

// Extraits de vraies pages (Marmiton, 750g) capturées le 2026-11-14.
const fixture = (name: string) => readFileSync(join(process.cwd(), 'supabase/functions/_shared/fixtures', name), 'utf8');
const MARMITON_SEARCH = fixture('marmiton-search.html');
const MARMITON_RECIPE = fixture('marmiton-recipe.html');
const RECIPE_750G = fixture('750g-recipe.html');
const MARMITON_URL = 'https://www.marmiton.org/recettes/recette_risotto-au-chorizo_17724.aspx';

const ld = (obj: object) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
}

describe('texte', () => {
  it('décode les entités nommées et numériques', () => {
    expect(decodeEntities('l&#039;huile &amp; cr&egrave;me &#x27;br&ucirc;l&eacute;e&#x27; &unknown; &#0;')).toBe(
      "l'huile & crème 'brûlée' &unknown; &#0;",
    );
  });

  it('nettoie balises et espaces', () => {
    expect(cleanText('  <b>Faire</b>&nbsp;bouillir<br/>l’eau\n\t ')).toBe('Faire bouillir l’eau');
  });

  it('lit les durées ISO 8601', () => {
    expect(parseIsoDuration('PT25M')).toBe(25);
    expect(parseIsoDuration('PT1H30M')).toBe(90);
    expect(parseIsoDuration('P0DT0H45M')).toBe(45);
    expect(parseIsoDuration('P1D')).toBe(1440);
    expect(parseIsoDuration('PT90S')).toBe(2);
    expect(parseIsoDuration('PT0.5H')).toBe(30);
    expect(parseIsoDuration('PT0M')).toBeNull();
    expect(parseIsoDuration('PT')).toBeNull();
    expect(parseIsoDuration('25 min')).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });

  it('associe catégories, niveaux et prix', () => {
    expect(mapCategory('Plat principal')).toBe('Plats');
    expect(mapCategory('Entrée')).toBe('Entrées');
    expect(mapCategory('Amuse-gueule')).toBe('Entrées');
    expect(mapCategory('Dessert')).toBe('Desserts');
    expect(mapCategory('Boisson')).toBe('Boissons');
    expect(mapCategory('Bases', 'crêpes,goûter,desserts')).toBe('Desserts');
    expect(mapCategory('', '')).toBe('Plats');
    expect(mapLevel('Très facile, Bon marché')).toBe('Facile');
    expect(mapLevel('Niveau moyen, Coût moyen')).toBe('Moyen');
    expect(mapLevel('Difficile')).toBe('Difficile');
    expect(mapPrice('Très facile, Bon marché')).toBe('€');
    expect(mapPrice('Niveau moyen, Coût moyen')).toBe('€€');
    expect(mapPrice('Assez cher')).toBe('€€€');
    expect(mapPrice('Recette, Desserts Pas cher')).toBe('€'); // CuisineAZ `estimatedCost`
    expect(mapPrice('')).toBe('—');
  });
});

describe('recherche Marmiton', () => {
  it("construit l'URL de recherche", () => {
    expect(marmitonSearchUrl('crème brûlée')).toBe('https://www.marmiton.org/recettes/recherche.aspx?aqt=cr%C3%A8me+br%C3%BBl%C3%A9e');
    expect(marmitonSearchUrl('tarte', 3)).toContain('page=3');
  });

  it('extrait les cartes de résultats (et ignore les liens hors liste)', () => {
    const page = parseMarmitonSearch(MARMITON_SEARCH, 1);
    expect(page.hasMore).toBe(true);
    expect(page.results.length).toBe(3);
    for (const r of page.results) {
      expect(r.url).toMatch(/^https:\/\/www\.marmiton\.org\/recettes\/recette_.+\.aspx$/);
      expect(r.name.length).toBeGreaterThan(3);
      expect(r.imageUrl).toMatch(/^https:\/\//);
      expect(r.source).toBe('marmiton.org');
    }
    expect(page.results.some((r) => r.url.includes('buche-glacee'))).toBe(false);
    expect(page.results[0]!.rating).toBeGreaterThan(0);
    expect(page.results[0]!.reviews).toBeGreaterThan(0);
  });

  it('détecte la dernière page et ignore les cartes non recette', () => {
    const html = `
      <li class="search-list__item"><a class="card-content__title" href="/recettes/recette_soupe_1.aspx">Soupe</a></li>
      <li class="search-list__item"><a class="card-content__title" href="/recettes/recette_soupe_1.aspx">Doublon</a></li>
      <li class="search-list__item"><a class="card-content__title" href="/article/ma-liste_2.aspx">Article</a></li>
      <li class="search-list__item"><a href="/recettes/recette_x_3.aspx">Sans titre</a></li>
      <li class="search-list__item"><a class="card-content__title" href="/recettes/recette_vide_4.aspx">  </a></li>
      <a href="/recettes/recherche.aspx?page=2&amp;aqt=soupe">2</a>`;
    expect(parseMarmitonSearch(html, 2)).toEqual({
      page: 2,
      hasMore: false,
      results: [
        {
          url: 'https://www.marmiton.org/recettes/recette_soupe_1.aspx',
          name: 'Soupe',
          imageUrl: null,
          rating: null,
          reviews: null,
          category: null,
          source: 'marmiton.org',
        },
      ],
    });
    expect(parseMarmitonSearch('<html>Aucun résultat</html>')).toEqual({ page: 1, hasMore: false, results: [] });
  });
});

describe('JSON-LD Recipe', () => {
  it('trouve la recette dans un @graph (Marmiton)', () => {
    const node = extractJsonLdRecipe(MARMITON_RECIPE);
    expect(node?.['@type']).toBe('Recipe');
  });

  it('trouve la recette dans un tableau, un mainEntity, et ignore le JSON invalide', () => {
    const recipe = { '@type': ['Recipe', 'Thing'], name: 'X' };
    expect(extractJsonLdRecipe(`${'<script type="application/ld+json">{ cassé </script>'}${ld([{ '@type': 'Organization' }, recipe])}`)).toEqual(recipe);
    expect(extractJsonLdRecipe(ld({ '@type': 'WebPage', mainEntity: { '@type': 'Recipe', name: 'Y' } }))?.name).toBe('Y');
    expect(extractJsonLdRecipe('<script type="application/ld+json">{"@type":"Recipe","name":"Saut\nde ligne"}</script>')?.name).toBe('Saut de ligne');
    expect(extractJsonLdRecipe(ld({ '@type': 'Organization' }))).toBeNull();
    expect(extractJsonLdRecipe('<html></html>')).toBeNull();
  });

  it('convertit une vraie fiche Marmiton', () => {
    const r = toImportedRecipe(extractJsonLdRecipe(MARMITON_RECIPE)!, MARMITON_URL);
    expect(r).toMatchObject<Partial<ImportedRecipe>>({
      name: 'Risotto au chorizo',
      category: 'Plats',
      timeMin: 25,
      level: 'Facile',
      price: '€',
      servings: '4 personnes',
      sourceName: 'marmiton.org',
      sourceUrl: MARMITON_URL,
    });
    expect(r.ingredients).toContain('4 verres de riz');
    expect(r.ingredients).toHaveLength(10);
    expect(r.steps).toHaveLength(7);
    expect(r.steps[0]).toMatch(/^Faire bouillir 1,5 litre/);
    expect(r.description).toBe('Pour 4 personnes. Source : marmiton.org, par milou.g.');
    expect(r.imageUrl).toMatch(/^https:\/\/assets\.afcdn\.com\//);
  });

  it('convertit une vraie fiche 750g (entités, catégorie via mots-clés)', () => {
    const r = toImportedRecipe(extractJsonLdRecipe(RECIPE_750G)!, 'https://www.750g.com/pate-a-crepes-r17175.htm');
    expect(r.name).toBe('Pâte pour crêpes');
    expect(r.category).toBe('Desserts');
    expect(r.timeMin).toBe(25);
    expect(r.ingredients).toEqual(["2 c. à s. d'huile", '250 g de farine', '500 ml de lait', '3 oeufs']);
    expect(r.steps[0]).toContain("mélanger l'ensemble");
    // Auteur « Communauté 750g » : redondant avec la source, non répété.
    expect(r.description).toBe('Une pâte à crêpe simple et rapide. Pour 4 personnes. Source : 750g.com.');
    expect(r.imageUrl).toBe('https://static.750g.com/images/1200-675/0931d7d376c077d0b196a5e8bc435806/pate-pour-crepes.png');
  });

  it('gère sections, textes HTML, numérotation, durées partielles et valeurs manquantes', () => {
    const r = toImportedRecipe(
      {
        '@type': 'Recipe',
        name: 'Recette de tarte aux pommes - Recette facile',
        recipeCategory: ['Dessert'],
        prepTime: 'PT20M',
        cookTime: 'PT35M',
        recipeYield: 6,
        author: [{ '@type': 'Person', name: 'Julie' }],
        description: 'Une tarte '.repeat(40),
        recipeIngredient: '3 pommes\n1 pâte brisée',
        recipeInstructions: [
          { '@type': 'HowToSection', name: 'Pâte', itemListElement: [{ '@type': 'HowToStep', text: '1. Étaler la pâte.' }] },
          { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', name: 'Étape 2 : Couper les pommes' }] },
          '<p>Enfourner.</p><p>Servir tiède.</p>',
        ],
        image: { '@type': 'ImageObject', url: 'https://img.example.com/tarte.jpg' },
        keywords: ['Niveau moyen', 'Coût moyen'],
      },
      'https://cuisine.example.com/tarte',
    );
    expect(r.name).toBe('Tarte aux pommes');
    expect(r.category).toBe('Desserts');
    expect(r.timeMin).toBe(55);
    expect(r.level).toBe('Moyen');
    expect(r.price).toBe('€€');
    expect(r.servings).toBe('6 personnes');
    expect(r.ingredients).toEqual(['3 pommes', '1 pâte brisée']);
    expect(r.steps).toEqual(['Étaler la pâte.', 'Couper les pommes', 'Enfourner.', 'Servir tiède.']);
    expect(r.description.length).toBeLessThan(300);
    expect(r.description).toMatch(/… Pour 6 personnes\. Source : cuisine\.example\.com, par Julie\.$/);
    expect(r.imageUrl).toBe('https://img.example.com/tarte.jpg');

    const minimal = toImportedRecipe({ '@type': 'Recipe', name: 'Pain', recipeInstructions: 'Pétrir\nCuire' }, 'https://pain.example.org/x');
    expect(minimal).toMatchObject({ timeMin: 20, level: 'Facile', price: '—', ingredients: ['—'], servings: null, imageUrl: null });
    expect(minimal.description).toBe('Source : pain.example.org.');
    expect(toImportedRecipe({ '@type': 'Recipe', name: 'Sel', recipeIngredient: ['sel'] }, 'https://a.example.org').steps).toEqual(['Bon appétit !']);
  });

  it('refuse une recette sans nom ou vide', () => {
    expect(() => toImportedRecipe({ '@type': 'Recipe' }, 'https://a.example.org')).toThrow(/sans nom/);
    expect(() => toImportedRecipe({ '@type': 'Recipe', name: 'Vide' }, 'https://a.example.org')).toThrow(/incomplète/);
  });
});

describe('garde-fou SSRF', () => {
  it.each([
    'https://www.marmiton.org/recettes/x.aspx',
    'http://cuisine.example.com/a?b=c',
    'https://site.fr:443/recette',
  ])('accepte %s', (u) => {
    expect(assertPublicHttpUrl(u).hostname).toBeTruthy();
  });

  it.each([
    'pas une url',
    'ftp://site.fr/x',
    'file:///etc/passwd',
    'http://localhost:5173/',
    'http://intranet/',
    'http://api.internal/x',
    'http://printer.local/',
    'http://127.0.0.1/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://8.8.8.8/',
    'http://[::1]/',
    'https://user:pass@site.fr/',
    'https://site.fr:8080/',
  ])('refuse %s', (u) => {
    expect(() => assertPublicHttpUrl(u)).toThrow(ImportFailure);
  });
});

describe('fetchHtml', () => {
  it('envoie un User-Agent explicite et décode la page', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('<p>ok é</p>'));
    const res = await fetchHtml('https://site.fr/a', { fetchImpl });
    expect(res).toEqual({ url: 'https://site.fr/a', html: '<p>ok é</p>' });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/Chefitto/);
    expect(init.redirect).toBe('manual');
  });

  it('suit les redirections publiques et bloque celles vers le réseau local', async () => {
    const ok = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/b' } }))
      .mockResolvedValueOnce(htmlResponse('fin'));
    expect(await fetchHtml('https://site.fr/a', { fetchImpl: ok })).toEqual({ url: 'https://site.fr/b', html: 'fin' });

    const evil = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    await expect(fetchHtml('https://site.fr/a', { fetchImpl: evil })).rejects.toMatchObject({ status: 400 });

    const loop = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: '/again' } }));
    await expect(fetchHtml('https://site.fr/a', { fetchImpl: loop, maxRedirects: 2 })).rejects.toThrow(/redirections/);
  });

  it('traduit les erreurs HTTP, réseau, délai et type de contenu', async () => {
    const respond = (r: Response) => vi.fn().mockResolvedValue(r);
    await expect(fetchHtml('https://site.fr/a', { fetchImpl: respond(new Response('', { status: 404 })) })).rejects.toMatchObject({ status: 404 });
    await expect(fetchHtml('https://site.fr/a', { fetchImpl: respond(new Response('', { status: 503 })) })).rejects.toMatchObject({ status: 502 });
    await expect(
      fetchHtml('https://site.fr/a', { fetchImpl: respond(new Response('{}', { headers: { 'content-type': 'application/pdf' } })) }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(fetchHtml('https://site.fr/a', { fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')) })).rejects.toMatchObject({
      status: 502,
    });
    const slow = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    await expect(fetchHtml('https://site.fr/a', { fetchImpl: slow as unknown as typeof fetch, timeoutMs: 20 })).rejects.toMatchObject({ status: 504 });
  });

  it('tronque les pages trop lourdes et respecte le charset', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        pulled++;
        ctrl.enqueue(new TextEncoder().encode('a'.repeat(1000)));
        if (pulled === 50) ctrl.close();
      },
    });
    const big = new Response(stream, { headers: { 'content-type': 'text/html' } });
    const { html } = await fetchHtml('https://site.fr/a', { fetchImpl: vi.fn().mockResolvedValue(big), maxBytes: 3000 });
    expect(html.length).toBe(3000);
    expect(pulled).toBeLessThan(50);

    const latin1 = new Response(new Uint8Array([0x63, 0x72, 0xe8, 0x6d, 0x65]), { headers: { 'content-type': 'text/html; charset=iso-8859-1' } });
    expect((await fetchHtml('https://site.fr/a', { fetchImpl: vi.fn().mockResolvedValue(latin1) })).html).toBe('crème');
  });
});

describe('handleImportRequest', () => {
  const routes = (map: Record<string, string>) =>
    vi.fn(async (url: string) => {
      const hit = Object.entries(map).find(([k]) => url.startsWith(k));
      return hit ? htmlResponse(hit[1]) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;

  it('recherche sur Marmiton', async () => {
    const fetchImpl = routes({ 'https://www.marmiton.org/recettes/recherche.aspx': MARMITON_SEARCH });
    const res = await handleImportRequest(new URLSearchParams({ q: '  risotto  ', page: '1' }), { fetchImpl });
    expect(res.status).toBe(200);
    expect(res.maxAge).toBeGreaterThan(0);
    expect((res.body as SearchPage).results).toHaveLength(3);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('aqt=risotto');
  });

  it('importe une recette depuis une URL', async () => {
    const fetchImpl = routes({ [MARMITON_URL]: MARMITON_RECIPE });
    const res = await handleImportRequest(new URLSearchParams({ url: MARMITON_URL }), { fetchImpl });
    expect(res.status).toBe(200);
    expect((res.body as { recipe: ImportedRecipe }).recipe.name).toBe('Risotto au chorizo');
  });

  it('valide les paramètres et remonte les erreurs', async () => {
    const fetchImpl = routes({ 'https://site.fr/vide': '<html><h1>Pas de recette</h1></html>' });
    const call = (p: Record<string, string>) => handleImportRequest(new URLSearchParams(p), { fetchImpl });
    expect(await call({})).toMatchObject({ status: 400, maxAge: 0 });
    expect(await call({ q: 'a' })).toMatchObject({ status: 400 });
    expect(await call({ q: 'x'.repeat(81) })).toMatchObject({ status: 400 });
    expect(await call({ url: `https://site.fr/${'x'.repeat(2100)}` })).toMatchObject({ status: 400 });
    expect(await call({ url: 'http://localhost/' })).toMatchObject({ status: 400, body: { error: 'Lien non autorisé' } });
    expect(await call({ url: 'https://site.fr/vide' })).toMatchObject({ status: 422, body: { error: 'Aucune recette trouvée sur cette page' } });
    expect(await call({ url: 'https://site.fr/absente' })).toMatchObject({ status: 404 });
    const boom = vi.fn(() => {
      throw new Error('bug');
    }) as unknown as typeof fetch;
    // Erreur inattendue hors réseau (ex. bug de parsing) : 500 générique, sans fuite de détail.
    const res = await handleImportRequest(new URLSearchParams({ q: 'tarte', page: 'abc' }), {
      fetchImpl: vi.fn().mockResolvedValue({ status: 200, ok: true, headers: new Headers(), body: null, arrayBuffer: () => Promise.reject(new Error('x')) }) as unknown as typeof fetch,
    });
    expect(res.status).toBe(500);
    expect(await handleImportRequest(new URLSearchParams({ q: 'tarte' }), { fetchImpl: boom })).toMatchObject({ status: 502 });
  });
});
