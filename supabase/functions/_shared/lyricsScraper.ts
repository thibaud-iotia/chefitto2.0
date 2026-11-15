/**
 * Recherche de paroles de chansons — prototype de test (page `#/test`).
 *
 * Même philosophie que `recipeScraper.ts` : code pur (`fetch`, `URL`), exécutable par Deno et Node.
 * Deux sources comparées :
 * - Genius : recherche via l'API JSON non officielle `genius.com/api/search/song`, puis scraping des
 *   blocs `<div data-lyrics-container="true">` de la page de la chanson ;
 * - LRCLIB : API JSON publique et gratuite, paroles incluses directement dans la recherche.
 */

import { decodeEntities, fetchHtml, ImportFailure, USER_AGENT, type FetchOptions } from './recipeScraper.ts';

export type LyricsSource = 'genius' | 'lrclib';

export interface LyricsHit {
  source: LyricsSource;
  id: string;
  title: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  /** Page Genius de la chanson (paroles à récupérer dans un second temps). */
  url: string | null;
  /** Paroles déjà connues (LRCLIB) ; `null` si à récupérer (Genius). */
  lyrics: string | null;
  synced: boolean;
}

export interface LyricsResponse {
  status: number;
  body: { hits: LyricsHit[] } | { lyrics: string; url: string } | { error: string };
}

const MAX_HITS = 10;
const SEARCH_MAX_LENGTH = 120;

type JsonObject = Record<string, unknown>;
const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const httpsUrl = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : null);

/* ---------- Réseau ---------- */

async function fetchJson(url: string, opts: FetchOptions = {}): Promise<unknown> {
  const { fetchImpl = fetch, timeoutMs = 10_000 } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    } catch {
      if (ctrl.signal.aborted) throw new ImportFailure(504, 'Le site source met trop de temps à répondre');
      throw new ImportFailure(502, 'Le site source est injoignable');
    }
    if (!res.ok) throw new ImportFailure(502, `Le site source a répondu ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new ImportFailure(502, 'Réponse illisible du site source');
    }
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Genius ---------- */

export function parseGeniusSearch(data: unknown): LyricsHit[] {
  const response = isObject(data) && isObject(data.response) ? data.response : null;
  const sections = response && Array.isArray(response.sections) ? response.sections : [];
  const hits: LyricsHit[] = [];
  for (const section of sections) {
    if (!isObject(section) || !Array.isArray(section.hits)) continue;
    for (const hit of section.hits) {
      const r = isObject(hit) && isObject(hit.result) ? hit.result : null;
      if (!r || r._type !== 'song' || r.instrumental === true) continue;
      const url = httpsUrl(r.url);
      if (!url || hits.some((h) => h.url === url)) continue;
      hits.push({
        source: 'genius',
        id: str(r.id),
        title: str(r.title) || str(r.full_title),
        artist: str(r.artist_names) || (isObject(r.primary_artist) ? str(r.primary_artist.name) : ''),
        album: null,
        imageUrl: httpsUrl(r.song_art_image_thumbnail_url) ?? httpsUrl(r.header_image_thumbnail_url),
        url,
        lyrics: null,
        synced: false,
      });
    }
  }
  return hits.slice(0, MAX_HITS);
}

export async function searchGenius(query: string, opts: FetchOptions = {}): Promise<LyricsHit[]> {
  const u = new URL('https://genius.com/api/search/song');
  u.searchParams.set('q', query);
  u.searchParams.set('per_page', String(MAX_HITS));
  return parseGeniusSearch(await fetchJson(u.toString(), opts));
}

/** Positions des `<div …>` correspondant à `open`, avec leur `</div>` fermante (div imbriquées comptées). */
function findDivs(html: string, open: RegExp): { start: number; innerStart: number; innerEnd: number; end: number }[] {
  const out: { start: number; innerStart: number; innerEnd: number; end: number }[] = [];
  const re = new RegExp(open.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = re.lastIndex;
    let depth = 1;
    let t: RegExpExecArray | null;
    while ((t = tag.exec(html))) {
      depth += t[0][1] === '/' ? -1 : 1;
      if (depth === 0) {
        out.push({ start: m.index, innerStart: re.lastIndex, innerEnd: t.index, end: tag.lastIndex });
        break;
      }
    }
    if (depth !== 0) break;
    re.lastIndex = out[out.length - 1]!.end;
  }
  return out;
}

/** Retire les sous-blocs marqués `data-exclude-from-selection` (en-tête contributeurs, pubs…). */
function stripExcluded(html: string): string {
  const blocks = findDivs(html, /<div\b[^>]*data-exclude-from-selection="true"[^>]*>/);
  let out = '';
  let pos = 0;
  for (const b of blocks) {
    out += html.slice(pos, b.start);
    pos = b.end;
  }
  return out + html.slice(pos);
}

/** Extrait les paroles d'une page Genius ; `null` si aucun bloc de paroles. */
export function parseGeniusLyrics(html: string): string | null {
  const parts = findDivs(html, /<div\b[^>]*data-lyrics-container="true"[^>]*>/)
    .map((b) => stripExcluded(html.slice(b.innerStart, b.innerEnd)))
    .filter((p) => p.trim());
  if (!parts.length) return null;
  const text = decodeEntities(
    parts
      .join('<br/>')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    // Ligne vide avant chaque section « [Refrain] », comme sur le site.
    .replace(/\n*(\[[^\]\n]+\])/g, '\n\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

/** Seules les pages de paroles de genius.com sont acceptées (le proxy ne sert pas d'URL arbitraires). */
export function assertGeniusLyricsUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ImportFailure(400, 'Lien invalide');
  }
  if (u.protocol !== 'https:' || u.hostname !== 'genius.com' || !/^\/[^/]+-lyrics$/i.test(u.pathname)) {
    throw new ImportFailure(400, 'Lien Genius non autorisé');
  }
  return `https://genius.com${u.pathname}`;
}

export async function fetchGeniusLyrics(rawUrl: string, opts: FetchOptions = {}): Promise<{ lyrics: string; url: string }> {
  const { url, html } = await fetchHtml(assertGeniusLyricsUrl(rawUrl), opts);
  const lyrics = parseGeniusLyrics(html);
  if (!lyrics) throw new ImportFailure(422, 'Aucune parole trouvée sur cette page');
  return { lyrics, url };
}

/* ---------- LRCLIB ---------- */

export function parseLrclibSearch(data: unknown): LyricsHit[] {
  if (!Array.isArray(data)) return [];
  const hits: LyricsHit[] = [];
  for (const r of data) {
    if (!isObject(r) || r.instrumental === true) continue;
    const lyrics = str(r.plainLyrics).trim();
    if (!lyrics) continue;
    hits.push({
      source: 'lrclib',
      id: str(r.id),
      title: str(r.trackName) || str(r.name),
      artist: str(r.artistName),
      album: str(r.albumName) || null,
      imageUrl: null,
      url: null,
      lyrics,
      synced: typeof r.syncedLyrics === 'string' && r.syncedLyrics.length > 0,
    });
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}

export async function searchLrclib(query: string, opts: FetchOptions = {}): Promise<LyricsHit[]> {
  const u = new URL('https://lrclib.net/api/search');
  u.searchParams.set('q', query);
  return parseLrclibSearch(await fetchJson(u.toString(), opts));
}

/* ---------- Point d'entrée HTTP ---------- */

/**
 * `?source=genius&q=…`  → résultats Genius (sans paroles).
 * `?source=genius&url=…` → paroles d'une page Genius.
 * `?source=lrclib&q=…`  → résultats LRCLIB (avec paroles).
 */
export async function handleLyricsRequest(params: URLSearchParams, opts: FetchOptions = {}): Promise<LyricsResponse> {
  try {
    const source = params.get('source');
    if (source !== 'genius' && source !== 'lrclib') throw new ImportFailure(400, 'Source inconnue');
    const url = params.get('url')?.trim();
    if (url) {
      if (source !== 'genius') throw new ImportFailure(400, 'Lien accepté pour Genius uniquement');
      return { status: 200, body: await fetchGeniusLyrics(url, opts) };
    }
    const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim();
    if (q.length < 2) throw new ImportFailure(400, 'Tapez au moins 2 caractères');
    if (q.length > SEARCH_MAX_LENGTH) throw new ImportFailure(400, 'Recherche trop longue');
    const hits = source === 'genius' ? await searchGenius(q, opts) : await searchLrclib(q, opts);
    return { status: 200, body: { hits } };
  } catch (e) {
    if (e instanceof ImportFailure) return { status: e.status, body: { error: e.message } };
    return { status: 500, body: { error: 'Erreur inattendue' } };
  }
}
