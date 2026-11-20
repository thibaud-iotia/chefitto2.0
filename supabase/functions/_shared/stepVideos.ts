// Vidéo YouTube par étape de recette (mode cuisine).
// Code commun : Supabase Edge Function `step-videos` (Deno) et middleware Vite `/api/step-videos` (Node).
// Aucune dépendance : YouTube Data API et cache PostgREST appelés en `fetch`. Par défaut, les requêtes sont tirées
// du texte des étapes (`fallbackQuery`, gratuit) ; la formulation par Claude est facultative (`STEP_VIDEOS_CLAUDE=1`),
// injectée (`QueryWriter`, voir `stepVideoQueries.ts`).

import {
  isVideoId,
  MAX_RECIPE_CHARS,
  MAX_STEP_CHARS,
  MAX_STEPS,
  type StepVideo,
  type StepVideosRequest,
  type StepVideosResponseBody,
} from './stepVideosContract.ts';

export * from './stepVideosContract.ts';

export interface StepVideosResult {
  status: number;
  body: StepVideosResponseBody;
}

/**
 * Transforme les étapes en requêtes de recherche YouTube : `queries[i]` pour `steps[i]`,
 * `null` si l'étape n'a pas de geste à montrer (servir, goûter, laisser reposer…).
 */
export type QueryWriter = (recipe: string, steps: string[]) => Promise<(string | null)[]>;

/** Cache des vidéos trouvées, partagé entre utilisateurs (les recettes de départ sont les mêmes pour tous). */
export interface VideoCache {
  /** Entrées connues et encore valides ; `null` = « aucune vidéo » mémorisé. */
  get(keys: string[]): Promise<Map<string, StepVideo | null>>;
  set(entries: [string, StepVideo | null][]): Promise<void>;
}

/** Durée de vie : une vidéo peut être supprimée de YouTube ; « aucune vidéo » est retenté plus tôt. */
export const VIDEO_TTL_MS = 30 * 24 * 3600_000;
export const NONE_TTL_MS = 7 * 24 * 3600_000;
const CACHE_VERSION = 'v1';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Valide `{ recipe, steps }` ; renvoie un message d'erreur ou la requête nettoyée. */
export function parseStepVideosInput(body: unknown): StepVideosRequest | string {
  const b = body as { recipe?: unknown; steps?: unknown } | null;
  if (typeof b?.recipe !== 'string' || !clean(b.recipe)) return 'Nom de recette manquant';
  if (!Array.isArray(b.steps) || b.steps.length === 0) return 'Aucune étape';
  if (b.steps.length > MAX_STEPS) return `${MAX_STEPS} étapes maximum`;
  if (b.steps.some((s) => typeof s !== 'string')) return 'Étapes invalides';
  return {
    recipe: clean(b.recipe).slice(0, MAX_RECIPE_CHARS),
    steps: (b.steps as string[]).map((s) => clean(s).slice(0, MAX_STEP_CHARS)),
  };
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Clé de cache : SHA-256 de la recette et de l'étape normalisées (courte, sans caractère spécial pour PostgREST). */
export async function cacheKey(recipe: string, step: string): Promise<string> {
  const data = new TextEncoder().encode(`${CACHE_VERSION}|${fold(recipe)}|${fold(step)}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Mots vides retirés de la requête (YouTube cherche par mots-clés : ils diluent la pertinence). */
const STOPWORDS = new Set(
  (
    'le la les un une des du de et ou puis ensuite enfin alors en à au aux dans sur sous avec sans pour par bien ' +
    'tout tous toute toutes très peu votre vos son sa ses leur leurs ce cet cette ces se y il elle on qui que ' +
    'deux trois quatre'
  ).split(' '),
);
/** Étapes sans geste à montrer quand elles commencent par ces verbes : pas de recherche (quota économisé). */
const NOTHING_TO_SHOW = new Set(
  'servez servir dégustez déguster réservez réserver goûtez goûter salez saler poivrez poivrer laissez laisser bon'.split(' '),
);
const MAX_QUERY_WORDS = 6;

/**
 * Requête par défaut, sans IA (gratuite) : mots porteurs de la première proposition de l'étape, sans quantités,
 * sans mots vides ni élisions, suivis du nom du plat. « Coupez les tomates en deux et émincez l'oignon. » →
 * « Coupez tomates émincez oignon Veggie tomato mix ». `null` si rien ne mérite d'être montré
 * (« Servez frais. », « Laissez reposer 1 h », « Bon appétit ! ») : aucune recherche, aucun quota consommé.
 */
export function fallbackQuery(recipe: string, step: string): string | null {
  const clause = step.split(/[.;:!?(]/)[0] ?? '';
  const words = clause
    .replace(/\d+([.,]\d+)?\s*(g|kg|mg|cl|dl|ml|l|min|minutes?|h|heures?|°c?)?\b/gi, ' ')
    .split(/[\s,]+/)
    .map((w) => w.replace(/^(?:l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu)['’]/i, ''))
    .filter((w) => /\p{L}/u.test(w) && !STOPWORDS.has(w.toLowerCase()));
  if (words.length < 2 || NOTHING_TO_SHOW.has(words[0]!.toLowerCase())) return null;
  return `${words.slice(0, MAX_QUERY_WORDS).join(' ')} ${recipe}`.slice(0, 120);
}

/** Lit un drapeau d'environnement (`1`, `true`, `oui`) : la formulation par Claude est désactivée par défaut. */
export const flagEnabled = (value: string | null | undefined) => /^(1|true|oui|yes)$/i.test(value?.trim() ?? '');

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/** L'API YouTube renvoie les titres échappés en HTML (`&#39;`, `&amp;`). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Erreur passagère de YouTube (quota épuisé, réseau, 5xx) : le résultat n'est pas mis en cache. */
export class YouTubeUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YouTubeUnavailable';
  }
}

export const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

/** Recherche YouTube Data API v3 (100 unités de quota par appel) : vidéos intégrables, en français, contenu sûr. */
export async function searchYouTube(query: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<StepVideo[]> {
  const url = new URL(YOUTUBE_SEARCH_URL);
  const params: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    maxResults: '5',
    q: query,
    relevanceLanguage: 'fr',
    regionCode: 'FR',
    safeSearch: 'strict',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    key: apiKey,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new YouTubeUnavailable('YouTube injoignable');
  }
  if (!res.ok) throw new YouTubeUnavailable(`YouTube ${res.status}`);
  type Item = { id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown } };
  const body = (await res.json().catch(() => null)) as { items?: Item[] } | null;
  const out: StepVideo[] = [];
  for (const it of body?.items ?? []) {
    const id = it.id?.videoId;
    if (!isVideoId(id) || typeof it.snippet?.title !== 'string') continue;
    out.push({
      id,
      title: decodeEntities(it.snippet.title).slice(0, 200),
      channel: typeof it.snippet.channelTitle === 'string' ? decodeEntities(it.snippet.channelTitle).slice(0, 100) : '',
    });
  }
  return out;
}

/** Cache en mémoire (middleware Vite, tests) : borné, même durée de vie que le cache SQL. */
export function memoryVideoCache(max = 2000, now: () => number = Date.now): VideoCache {
  const map = new Map<string, { at: number; video: StepVideo | null }>();
  return {
    async get(keys) {
      const out = new Map<string, StepVideo | null>();
      for (const k of keys) {
        const hit = map.get(k);
        if (hit && now() - hit.at < (hit.video ? VIDEO_TTL_MS : NONE_TTL_MS)) out.set(k, hit.video);
      }
      return out;
    },
    async set(entries) {
      for (const [k, video] of entries) {
        map.delete(k);
        map.set(k, { at: now(), video });
        if (map.size > max) map.delete(map.keys().next().value!);
      }
    },
  };
}

/** Lit une vidéo stockée (jsonb) en revérifiant sa forme. */
function toVideo(v: unknown): StepVideo | null {
  const o = v as Partial<StepVideo> | null;
  if (!o || !isVideoId(o.id) || typeof o.title !== 'string') return null;
  return { id: o.id, title: o.title, channel: typeof o.channel === 'string' ? o.channel : '' };
}

/**
 * Cache dans la table `step_videos_cache` via PostgREST, avec la clé serveur (`service_role`, RLS sans politique :
 * aucun client n'y a accès). Table absente ou erreur : on continue sans cache.
 */
export function supabaseVideoCache(supabaseUrl: string, serviceKey: string, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): VideoCache {
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/step_videos_cache`;
  const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json' };
  // Clé historique (JWT) : aussi en Authorization. Les nouvelles clés secrètes (`sb_secret_…`) passent par `apikey` seul.
  if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`;
  return {
    async get(keys) {
      const out = new Map<string, StepVideo | null>();
      if (keys.length === 0) return out;
      try {
        const res = await fetchImpl(`${endpoint}?select=key,video,created_at&key=in.(${keys.join(',')})`, { headers });
        if (!res.ok) return out;
        const rows = (await res.json()) as { key: string; video: unknown; created_at: string }[];
        for (const row of rows) {
          const video = toVideo(row.video);
          const age = now() - Date.parse(row.created_at);
          if (age < (video ? VIDEO_TTL_MS : NONE_TTL_MS)) out.set(row.key, video);
        }
      } catch {
        /* cache indisponible : on cherche directement */
      }
      return out;
    },
    async set(entries) {
      if (entries.length === 0) return;
      const created_at = new Date(now()).toISOString();
      try {
        await fetchImpl(endpoint, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(entries.map(([key, video]) => ({ key, video, created_at }))),
        });
      } catch {
        /* non bloquant */
      }
    },
  };
}

export interface StepVideosDeps {
  /** Clé YouTube Data API v3 (secret serveur). */
  youtubeKey: string | null;
  /**
   * Formulation des requêtes par Claude, **facultative et payante** (activée par `STEP_VIDEOS_CLAUDE=1`).
   * Absente (par défaut) ou en échec : `fallbackQuery`, gratuite.
   */
  writer?: QueryWriter | null;
  cache?: VideoCache;
  fetchImpl?: typeof fetch;
  log?: (message: string, error: unknown) => void;
}

/** Point d'entrée commun : validation, cache, requêtes, recherche YouTube, sans doublon d'une étape à l'autre. */
export async function handleStepVideosRequest(body: unknown, deps: StepVideosDeps): Promise<StepVideosResult> {
  const input = parseStepVideosInput(body);
  if (typeof input === 'string') return { status: 400, body: { error: input } };
  const { youtubeKey, writer, cache = memoryVideoCache(0), fetchImpl = fetch, log = () => {} } = deps;
  if (!youtubeKey) {
    return { status: 503, body: { error: 'Les vidéos ne sont pas configurées (clé YOUTUBE_API_KEY absente).' } };
  }
  const { recipe, steps } = input;
  const keys = await Promise.all(steps.map((s) => cacheKey(recipe, s)));
  const known = await cache.get(keys);
  const videos: (StepVideo | null | undefined)[] = keys.map((k) => known.get(k));
  const missing = videos.flatMap((v, i) => (v === undefined ? [i] : []));
  if (missing.length === 0) return { status: 200, body: { videos: videos as (StepVideo | null)[] } };

  let queries: (string | null)[] | null = null;
  if (writer) {
    try {
      const written = await writer(recipe, missing.map((i) => steps[i]!));
      if (written.length === missing.length) queries = written;
    } catch (e) {
      log('step-videos: requêtes Claude indisponibles, requêtes tirées du texte', e);
    }
  }
  queries ??= missing.map((i) => fallbackQuery(recipe, steps[i]!));

  // Toutes les recherches en parallèle (une étape = un appel), puis choix dans l'ordre des étapes :
  // deux étapes ne reçoivent jamais la même vidéo.
  const found = await Promise.all(
    queries.map((q) => (q ? searchYouTube(q, youtubeKey, fetchImpl).catch((e: unknown) => e) : Promise.resolve([] as StepVideo[]))),
  );
  const used = new Set(videos.flatMap((v) => (v ? [v.id] : [])));
  const fresh: [string, StepVideo | null][] = [];
  let partial = false;
  missing.forEach((stepIndex, j) => {
    const result = found[j];
    if (!Array.isArray(result)) {
      partial = true;
      videos[stepIndex] = null;
      log('step-videos: recherche YouTube en échec', result);
      return;
    }
    const pick = result.find((v) => !used.has(v.id)) ?? null;
    if (pick) used.add(pick.id);
    videos[stepIndex] = pick;
    fresh.push([keys[stepIndex]!, pick]);
  });
  await cache.set(fresh);
  return { status: 200, body: partial ? { videos: videos as (StepVideo | null)[], partial } : { videos: videos as (StepVideo | null)[] } };
}
