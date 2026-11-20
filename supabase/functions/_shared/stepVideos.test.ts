import { describe, expect, it, vi } from 'vitest';
import {
  cacheKey,
  decodeEntities,
  fallbackQuery,
  flagEnabled,
  handleStepVideosRequest,
  isVideoId,
  MAX_STEPS,
  memoryVideoCache,
  NONE_TTL_MS,
  parseStepVideosInput,
  searchYouTube,
  supabaseVideoCache,
  VIDEO_TTL_MS,
  videoEmbedUrl,
  videoThumbnail,
  type StepVideo,
} from './stepVideos';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Réponse YouTube : `ids` deviennent des vidéos « Titre <id> ». */
const ytItems = (...ids: string[]) => ({
  items: ids.map((id) => ({ id: { kind: 'youtube#video', videoId: id }, snippet: { title: `Titre ${id}`, channelTitle: 'Chaîne' } })),
});
const vid = (id: string): StepVideo => ({ id, title: `Titre ${id}`, channel: 'Chaîne' });

/** Faux YouTube : la requête `q` → liste d'ids (ou statut d'erreur). */
function fakeYouTube(answers: Record<string, string[] | number>) {
  const queries: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const q = url.searchParams.get('q')!;
    queries.push(q);
    const a = answers[q] ?? [];
    return typeof a === 'number' ? json(a, { error: { code: a } }) : json(200, ytItems(...a));
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, queries, calls: fetchImpl };
}

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const C = 'ccccccccccc';

describe('contrat', () => {
  it('identifiants YouTube, miniature et lecteur sans cookie', () => {
    expect(isVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isVideoId('court')).toBe(false);
    expect(isVideoId('aaaaaaaaaa"><')).toBe(false);
    expect(isVideoId(42)).toBe(false);
    expect(videoThumbnail(A)).toBe(`https://i.ytimg.com/vi/${A}/hqdefault.jpg`);
    expect(videoEmbedUrl(A)).toBe(`https://www.youtube-nocookie.com/embed/${A}?autoplay=1&playsinline=1&rel=0`);
  });
});

describe('parseStepVideosInput', () => {
  it('nettoie le nom et les étapes', () => {
    expect(parseStepVideosInput({ recipe: '  Risotto  ', steps: ['  Émincer\n les échalotes '] })).toEqual({
      recipe: 'Risotto',
      steps: ['Émincer les échalotes'],
    });
  });
  it.each([
    [null, /recette/],
    [{ recipe: ' ', steps: ['a'] }, /recette/],
    [{ recipe: 'R', steps: [] }, /Aucune étape/],
    [{ recipe: 'R', steps: Array(MAX_STEPS + 1).fill('a') }, /maximum/],
    [{ recipe: 'R', steps: ['a', 3] }, /invalides/],
  ])('refuse %#', (body, msg) => {
    expect(parseStepVideosInput(body)).toMatch(msg);
  });
});

describe('fallbackQuery (requête par défaut, sans IA)', () => {
  it('mots porteurs de la première proposition, sans quantités, mots vides ni élisions, suivis du plat', () => {
    expect(fallbackQuery('Veggie tomato mix', "Coupez les tomates en deux et émincez l'oignon.")).toBe(
      'Coupez tomates émincez oignon Veggie tomato mix',
    );
    expect(fallbackQuery('Risotto au chorizo', "Faire bouillir 1,5 litre d'eau puis ajoutez les 2 cubes. Ensuite…")).toBe(
      'Faire bouillir litre eau ajoutez cubes Risotto au chorizo',
    );
    expect(fallbackQuery('Tarte', 'Cuire 35 min à 180°C dans le four')).toBe('Cuire four Tarte');
    expect(fallbackQuery('Crêpes', 'Versez 2 litres de lait')).toBe('Versez litres lait Crêpes');
  });
  it('6 mots au plus', () => {
    expect(fallbackQuery('R', 'Hachez ail persil échalote ciboulette estragon cerfeuil basilic')).toBe(
      'Hachez ail persil échalote ciboulette estragon R',
    );
  });
  it('rien à montrer → aucune requête (quota économisé)', () => {
    expect(fallbackQuery('Tarte', 'Servez.')).toBeNull();
    expect(fallbackQuery('Tarte', 'Servez frais avec une salade.')).toBeNull();
    expect(fallbackQuery('Tarte', 'Laissez reposer 1 h au frais.')).toBeNull();
    expect(fallbackQuery('Tarte', 'Bon appétit !')).toBeNull();
    expect(fallbackQuery('Tarte', 'Cuire 35 min.')).toBeNull();
  });
});

describe('flagEnabled', () => {
  it('Claude désactivé sauf demande explicite', () => {
    for (const v of ['1', 'true', 'TRUE', ' oui ', 'yes']) expect(flagEnabled(v)).toBe(true);
    for (const v of [undefined, null, '', '0', 'false', 'non', 'peut-être']) expect(flagEnabled(v)).toBe(false);
  });
});

describe('decodeEntities', () => {
  it('entités nommées et numériques', () => {
    expect(decodeEntities('L&#39;omelette &amp; la cr&#xE8;me &quot;facile&quot; &bogus;')).toBe('L\'omelette & la crème "facile" &bogus;');
  });
});

describe('cacheKey', () => {
  it('SHA-256 hexadécimal, insensible à la casse, aux accents et aux espaces', async () => {
    const k = await cacheKey('Risotto', 'Émincer  les échalotes');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(await cacheKey('risotto', 'emincer les ECHALOTES')).toBe(k);
    expect(await cacheKey('Risotto', 'Émincer les oignons')).not.toBe(k);
  });
});

describe('searchYouTube', () => {
  it('filtres de recherche, titres décodés, identifiants invalides ignorés', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        items: [
          { id: { videoId: A }, snippet: { title: 'Monter des blancs &amp; plus', channelTitle: 'Chef &#39;Max&#39;' } },
          { id: { videoId: 'pas-valide' }, snippet: { title: 'x' } },
          { id: { channelId: 'UC' }, snippet: { title: 'chaîne' } },
          { id: { videoId: B }, snippet: { title: 'Sans chaîne' } },
        ],
      }),
    );
    const out = await searchYouTube('monter des blancs', 'CLE', fetchImpl as unknown as typeof fetch);
    expect(out).toEqual([
      { id: A, title: 'Monter des blancs & plus', channel: "Chef 'Max'" },
      { id: B, title: 'Sans chaîne', channel: '' },
    ]);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'monter des blancs',
      key: 'CLE',
      type: 'video',
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      relevanceLanguage: 'fr',
    });
  });
  it('quota épuisé ou réseau → YouTubeUnavailable', async () => {
    await expect(searchYouTube('q', 'k', (async () => json(403, {})) as unknown as typeof fetch)).rejects.toThrow('YouTube 403');
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(searchYouTube('q', 'k', offline)).rejects.toThrow('injoignable');
  });
});

describe('memoryVideoCache', () => {
  it('vidéos gardées 30 jours, « aucune vidéo » 7 jours, taille bornée', async () => {
    let t = 0;
    const cache = memoryVideoCache(2, () => t);
    await cache.set([
      ['a', vid(A)],
      ['n', null],
    ]);
    expect(await cache.get(['a', 'n', 'x'])).toEqual(new Map([['a', vid(A)], ['n', null]]));
    t = NONE_TTL_MS;
    expect(await cache.get(['a', 'n'])).toEqual(new Map([['a', vid(A)]]));
    t = VIDEO_TTL_MS;
    expect((await cache.get(['a'])).size).toBe(0);
    await cache.set([
      ['1', null],
      ['2', null],
      ['3', null],
    ]);
    expect([...(await cache.get(['1', '2', '3'])).keys()]).toEqual(['2', '3']);
  });
});

describe('supabaseVideoCache', () => {
  it('lit par clés via PostgREST, ignore les entrées périmées et les vidéos mal formées', async () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const fetchImpl = vi.fn(async () =>
      json(200, [
        { key: 'k1', video: vid(A), created_at: '2026-11-10T00:00:00Z' },
        { key: 'k2', video: null, created_at: '2026-11-19T00:00:00Z' },
        { key: 'k3', video: null, created_at: '2026-11-01T00:00:00Z' },
        { key: 'k4', video: { id: '"><script>', title: 'x' }, created_at: '2026-11-19T00:00:00Z' },
      ]),
    );
    const cache = supabaseVideoCache('https://p.supabase.co/', 'eyJsecret', fetchImpl as unknown as typeof fetch, () => now);
    expect(await cache.get(['k1', 'k2', 'k3', 'k4'])).toEqual(new Map([['k1', vid(A)], ['k2', null], ['k4', null]]));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p.supabase.co/rest/v1/step_videos_cache?select=key,video,created_at&key=in.(k1,k2,k3,k4)');
    expect(init.headers).toMatchObject({ apikey: 'eyJsecret', Authorization: 'Bearer eyJsecret' });
  });

  it('écrit en upsert ; clé secrète moderne sans Authorization ; erreurs sans effet', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const cache = supabaseVideoCache('https://p.supabase.co', 'sb_secret_x', fetchImpl as unknown as typeof fetch, () => 0);
    await cache.set([['k', vid(A)]]);
    await cache.set([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Prefer: 'resolution=merge-duplicates,return=minimal' });
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(init.body as string)).toEqual([{ key: 'k', video: vid(A), created_at: '1970-01-01T00:00:00.000Z' }]);

    const broken = supabaseVideoCache('https://p', 'k', (async () => {
      throw new Error('réseau');
    }) as unknown as typeof fetch);
    expect((await broken.get(['a'])).size).toBe(0);
    await expect(broken.set([['a', null]])).resolves.toBeUndefined();
    const missingTable = supabaseVideoCache('https://p', 'k', (async () => json(404, { code: 'PGRST205' })) as unknown as typeof fetch);
    expect((await missingTable.get(['a'])).size).toBe(0);
  });
});

describe('handleStepVideosRequest', () => {
  const body = { recipe: 'Risotto', steps: ['Émincer les échalotes', 'Nacrer le riz', 'Servir'] };

  it('400 si la requête est invalide, 503 sans clé YouTube', async () => {
    expect(await handleStepVideosRequest({}, { youtubeKey: 'k' })).toMatchObject({ status: 400 });
    expect(await handleStepVideosRequest(body, { youtubeKey: null })).toMatchObject({ status: 503, body: { error: /YOUTUBE_API_KEY/ } });
  });

  it('requêtes de Claude, une vidéo par étape, sans doublon, étape sans geste → null ; résultat mis en cache', async () => {
    const yt = fakeYouTube({ 'émincer une échalote': [A, B], 'nacrer le riz': [A, C] });
    const writer = vi.fn(async () => ['émincer une échalote', 'nacrer le riz', null]);
    const cache = memoryVideoCache();
    const r = await handleStepVideosRequest(body, { youtubeKey: 'k', writer, cache, fetchImpl: yt.fetchImpl });
    expect(r).toEqual({ status: 200, body: { videos: [vid(A), vid(C), null] } });
    expect(writer).toHaveBeenCalledWith('Risotto', body.steps);
    expect(yt.queries).toEqual(['émincer une échalote', 'nacrer le riz']);

    // Deuxième ouverture (même recette, autre utilisateur) : tout vient du cache, ni Claude ni YouTube.
    const again = await handleStepVideosRequest(body, { youtubeKey: 'k', writer, cache, fetchImpl: yt.fetchImpl });
    expect(again.body).toEqual({ videos: [vid(A), vid(C), null] });
    expect(writer).toHaveBeenCalledTimes(1);
    expect(yt.calls).toHaveBeenCalledTimes(2);
  });

  it('seules les étapes absentes du cache sont cherchées, sans reprendre une vidéo déjà en cache', async () => {
    const cache = memoryVideoCache();
    await cache.set([[await cacheKey('Risotto', 'Émincer les échalotes'), vid(A)]]);
    const yt = fakeYouTube({ 'nacrer le riz': [A, B] });
    const writer = vi.fn(async (_r: string, steps: string[]) => steps.map((s) => (s === 'Nacrer le riz' ? 'nacrer le riz' : null)));
    const r = await handleStepVideosRequest(body, { youtubeKey: 'k', writer, cache, fetchImpl: yt.fetchImpl });
    expect(writer).toHaveBeenCalledWith('Risotto', ['Nacrer le riz', 'Servir']);
    expect(r.body).toEqual({ videos: [vid(A), vid(B), null] });
  });

  it('par défaut (sans Claude) : requêtes tirées du texte, étape sans geste non cherchée', async () => {
    const yt = fakeYouTube({ 'Émincer échalotes Risotto': [A], 'Nacrer riz Risotto': [B] });
    const r = await handleStepVideosRequest(body, { youtubeKey: 'k', fetchImpl: yt.fetchImpl });
    expect(yt.queries).toEqual(['Émincer échalotes Risotto', 'Nacrer riz Risotto']);
    expect(r.body).toEqual({ videos: [vid(A), vid(B), null] });
  });

  it('Claude indisponible ou réponse incomplète → requêtes tirées du texte', async () => {
    const log = vi.fn();
    const yt = fakeYouTube({});
    const failing = vi.fn(async () => {
      throw new Error('panne');
    });
    await handleStepVideosRequest(body, { youtubeKey: 'k', writer: failing, fetchImpl: yt.fetchImpl, log });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/tirées du texte/), expect.any(Error));
    expect(yt.queries).toEqual(['Émincer échalotes Risotto', 'Nacrer riz Risotto']);

    const short = fakeYouTube({});
    await handleStepVideosRequest(body, { youtubeKey: 'k', writer: async () => ['une seule'], fetchImpl: short.fetchImpl });
    expect(short.queries).toEqual(['Émincer échalotes Risotto', 'Nacrer riz Risotto']);
  });

  it('quota YouTube épuisé : réponse partielle, échecs non mis en cache', async () => {
    const yt = fakeYouTube({ a: [A], b: 403 });
    const cache = memoryVideoCache();
    const writer = async () => ['a', 'b', null];
    const r = await handleStepVideosRequest(body, { youtubeKey: 'k', writer, cache, fetchImpl: yt.fetchImpl });
    expect(r.body).toEqual({ videos: [vid(A), null, null], partial: true });
    const keys = await Promise.all(body.steps.map((s) => cacheKey('Risotto', s)));
    const cached = await cache.get(keys);
    expect(cached.get(keys[0]!)).toEqual(vid(A));
    expect(cached.has(keys[1]!)).toBe(false);
    expect(cached.get(keys[2]!)).toBeNull();
  });
});
