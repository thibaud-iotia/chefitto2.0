/**
 * Recherche et import de recettes depuis le web.
 *
 * Code pur, sans dépendance ni API spécifique à un runtime (seulement `fetch`, `URL`, `TextDecoder`) :
 * il est exécuté à l'identique par
 * - la Supabase Edge Function `recipe-import` (Deno, production) ;
 * - le middleware Vite `/api/recipe-import` (Node, dev / preview / tests e2e) ;
 * - les tests unitaires (Vitest).
 *
 * Deux sources :
 * - recherche Marmiton : parsing de la page de résultats HTML ;
 * - import d'une page recette (Marmiton ou n'importe quel site) via le JSON-LD schema.org `Recipe`,
 *   publié par quasiment tous les sites de recettes pour le référencement Google.
 */

import { parseServings } from './servings.ts';

export type ImportCategory = 'Entrées' | 'Plats' | 'Desserts' | 'Boissons';
export type ImportLevel = 'Facile' | 'Moyen' | 'Difficile';

export interface SearchResult {
  url: string;
  name: string;
  imageUrl: string | null;
  /** Note sur 5. */
  rating: number | null;
  reviews: number | null;
  /** Catégorie telle qu'affichée par la source (ex. « Plat principal »). */
  category: string | null;
  source: string;
}

export interface SearchPage {
  results: SearchResult[];
  page: number;
  hasMore: boolean;
}

export interface ImportedRecipe {
  name: string;
  category: ImportCategory;
  timeMin: number;
  level: ImportLevel;
  price: string;
  description: string;
  ingredients: string[];
  steps: string[];
  /** Rendement tel que publié par la page (« 4 personnes », « 1 gâteau »…). */
  servings: string | null;
  /** Nombre de personnes, si le rendement en indique un (base du recalcul des quantités). */
  servingsCount: number | null;
  imageUrl: string | null;
  sourceUrl: string;
  sourceName: string;
}

export class ImportFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ImportFailure';
  }
}

export const MARMITON_ORIGIN = 'https://www.marmiton.org';
export const USER_AGENT = 'Mozilla/5.0 (compatible; Chefitto/2.0; recipe-import)';
export const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 80;
const MAX_PAGE = 20;
const MAX_URL_LENGTH = 2048;
const MAX_ITEMS = 60;

/* ---------- Texte ---------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  oelig: 'œ',
  OElig: 'Œ',
  aelig: 'æ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  ccedil: 'ç',
  icirc: 'î',
  iuml: 'ï',
  ocirc: 'ô',
  ouml: 'ö',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  Eacute: 'É',
  Egrave: 'È',
  Agrave: 'À',
  Ccedil: 'Ç',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code] ?? m;
  });
}

/** Retire les balises, décode les entités, normalise les espaces. */
export function cleanText(s: string): string {
  return decodeEntities(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** « PT1H30M » → 90. Renvoie `null` si la durée est absente ou illisible. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value.trim());
  if (!m || value.trim().length <= 2) return null;
  const [, d, h, min, sec] = m.map((x) => (x ? Number(x) : 0)) as number[];
  const total = (d ?? 0) * 1440 + (h ?? 0) * 60 + (min ?? 0) + (sec ?? 0) / 60;
  return total > 0 ? Math.max(1, Math.round(total)) : null;
}

/* ---------- Recherche Marmiton ---------- */

export function marmitonSearchUrl(query: string, page = 1): string {
  const u = new URL('/recettes/recherche.aspx', MARMITON_ORIGIN);
  u.searchParams.set('aqt', query);
  if (page > 1) u.searchParams.set('page', String(page));
  return u.toString();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return m ? decodeEntities(m[1]!) : null;
}

function toNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Extrait les cartes recette d'une page de résultats Marmiton. */
export function parseMarmitonSearch(html: string, page = 1): SearchPage {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<li\s+class="search-list__item"/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/li>/i)[0] ?? raw;
    const anchor = /<a\b[^>]*card-content__title[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!anchor) continue;
    const href = attr(anchor[0], 'href');
    if (!href) continue;
    let url: string;
    try {
      url = new URL(href, MARMITON_ORIGIN).toString();
    } catch {
      continue;
    }
    // Ne garder que les fiches recette (pas les articles, vidéos, quiz…).
    if (!/\/recettes\/recette_[^/]+\.aspx$/i.test(new URL(url).pathname) || seen.has(url)) continue;
    const img = /<img\b[^>]*>/i.exec(block);
    const name = cleanText(anchor[1] ?? '') || (img ? attr(img[0], 'alt') : '') || '';
    if (!name) continue;
    seen.add(url);
    const label = /class="image-label"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const rating = /class="rating__rating"[^>]*>\s*([\d.,]+)\s*\/\s*5/i.exec(block);
    const reviews = /class="rating__nbreviews"[^>]*>\s*(\d+)/i.exec(block);
    const src = img ? attr(img[0], 'src') : null;
    results.push({
      url,
      name,
      imageUrl: src && /^https:\/\//i.test(src) ? src : null,
      rating: toNumber(rating?.[1]),
      reviews: toNumber(reviews?.[1]),
      category: label ? cleanText(label[1] ?? '') || null : null,
      source: 'marmiton.org',
    });
  }
  const next = new RegExp(`[?&](?:amp;)?page=${page + 1}(?![0-9])`, 'i');
  return { results, page, hasMore: results.length > 0 && next.test(html) };
}

/* ---------- JSON-LD schema.org Recipe ---------- */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

function hasType(node: JsonObject, type: string): boolean {
  const t = node['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function findRecipe(node: Json, depth = 0): JsonObject | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = findRecipe(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!isObject(node)) return null;
  if (hasType(node, 'Recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const v = node[key];
    if (v !== undefined) {
      const r = findRecipe(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** Trouve le premier nœud `Recipe` dans les blocs `<script type="application/ld+json">` de la page. */
export function extractJsonLdRecipe(html: string): JsonObject | null {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const body = (m[1] ?? '').trim().replace(/^<!--|-->$/g, '');
    let data: Json;
    try {
      data = JSON.parse(body) as Json;
    } catch {
      try {
        // Certains sites laissent des retours à la ligne bruts dans les chaînes.
        // eslint-disable-next-line no-control-regex
        data = JSON.parse(body.replace(/[\u0000-\u001f]+/g, ' ')) as Json;
      } catch {
        continue;
      }
    }
    const recipe = findRecipe(data);
    if (recipe) return recipe;
  }
  return null;
}

function asText(v: Json | undefined): string {
  if (typeof v === 'string') return cleanText(v);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return asText(v[0]);
  if (isObject(v)) return asText(v.name ?? v.text ?? v['@value']);
  return '';
}

function asList(v: Json | undefined): Json[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function firstUrl(v: Json | undefined): string | null {
  for (const x of asList(v)) {
    const u = typeof x === 'string' ? x : isObject(x) ? (typeof x.url === 'string' ? x.url : typeof x.contentUrl === 'string' ? x.contentUrl : null) : null;
    if (u && /^https?:\/\//i.test(u)) return u;
  }
  return null;
}

function splitLines(text: string): string[] {
  return text
    .split(/<\/(?:p|li|div)>|<br\s*\/?>|\r?\n/i)
    .map(cleanText)
    .filter(Boolean);
}

function collectSteps(v: Json | undefined, out: string[], depth = 0): void {
  if (depth > 5 || out.length >= MAX_ITEMS) return;
  for (const item of asList(v)) {
    if (typeof item === 'string') {
      out.push(...splitLines(item));
    } else if (isObject(item)) {
      if (item.itemListElement !== undefined) {
        collectSteps(item.itemListElement, out, depth + 1);
      } else {
        const text = typeof item.text === 'string' ? item.text : typeof item.name === 'string' ? item.name : '';
        out.push(...splitLines(text));
      }
    }
  }
}

function normalizeSteps(v: Json | undefined): string[] {
  const out: string[] = [];
  collectSteps(v, out);
  return out
    .map((s) => s.replace(/^(?:étape\s*)?\d{1,2}\s*[.):-]\s+/i, '').trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

function normalizeIngredients(v: Json | undefined): string[] {
  return asList(v)
    .flatMap((x) => (typeof x === 'string' ? splitLines(x) : []))
    .map((s) => s.replace(/\s+([,.])/g, '$1'))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

export function mapCategory(category: string, keywords = ''): ImportCategory {
  const rules: [RegExp, ImportCategory][] = [
    [/dessert|gateau|patisserie|confiserie|gouter|biscuit|cookie|glace|sorbet|entremets|viennoiserie/, 'Desserts'],
    [/boisson|cocktail|smoothie|milkshake|jus |sirop|limonade|\bthe\b|cafe/, 'Boissons'],
    [/entree|amuse|apero|aperitif|tapas|antipasti|starter/, 'Entrées'],
    [/plat|accompagnement|sauce|main/, 'Plats'],
  ];
  for (const text of [fold(category), fold(keywords)]) {
    if (!text) continue;
    for (const [re, cat] of rules) if (re.test(text)) return cat;
  }
  return 'Plats';
}

export function mapLevel(text: string): ImportLevel {
  const t = fold(text);
  if (/difficile|expert|elabore/.test(t)) return 'Difficile';
  if (/niveau moyen|difficulte moyenne|intermediaire|\bmoyennement difficile/.test(t)) return 'Moyen';
  return 'Facile';
}

export function mapPrice(text: string): string {
  const t = fold(text);
  // « Pas cher » avant « cher ».
  if (/bon marche|economique|pas cher|peu couteux/.test(t)) return '€';
  if (/cout moyen|prix moyen|abordable/.test(t)) return '€€';
  if (/\bcher\b|couteux/.test(t)) return '€€€';
  return '—';
}

function cleanName(name: string): string {
  const n = name
    .replace(/\s*:\s*la meilleure recette.*$/i, '')
    .replace(/^recette\s+(?:de\s+|du\s+|des\s+|d['’]\s*)?/i, '')
    .replace(/\s*[-|–]\s*(?:recette|marmiton|750g).*$/i, '')
    .trim();
  return n ? n[0]!.toUpperCase() + n.slice(1) : n;
}

function hostLabel(url: URL): string {
  return url.hostname.replace(/^www\./, '');
}

/** Convertit un nœud JSON-LD `Recipe` en recette Chefitto. */
export function toImportedRecipe(ld: JsonObject, sourceUrl: string): ImportedRecipe {
  const url = new URL(sourceUrl);
  const host = hostLabel(url);
  const name = cleanName(asText(ld.name));
  if (!name) throw new ImportFailure(422, 'Recette sans nom sur cette page');
  const ingredients = normalizeIngredients(ld.recipeIngredient ?? ld.ingredients);
  const steps = normalizeSteps(ld.recipeInstructions);
  if (ingredients.length === 0 && steps.length === 0) throw new ImportFailure(422, 'Recette incomplète sur cette page');

  const keywords = asList(ld.keywords).map(asText).join(', ');
  const category = asList(ld.recipeCategory).map(asText).join(', ');
  const total =
    parseIsoDuration(ld.totalTime) ??
    ((parseIsoDuration(ld.prepTime) ?? 0) + (parseIsoDuration(ld.cookTime) ?? 0) || null);
  const yieldText = asText(ld.recipeYield);
  const servings = yieldText ? (/^\d+$/.test(yieldText) ? `${yieldText} personnes` : yieldText) : null;
  const servingsCount = parseServings(ld.recipeYield);
  const author = asText(ld.author);
  const isMarmiton = host.endsWith('marmiton.org');
  // La description Marmiton est un texte SEO générique : on la remplace par une ligne utile.
  let base = isMarmiton ? '' : asText(ld.description);
  if (base.length > 220) base = `${base.slice(0, 217).replace(/\s+\S*$/, '')}…`;
  const description = [
    base && !/[.!?…]$/.test(base) ? `${base}.` : base,
    // Le nombre de personnes a son propre champ ; un rendement d'une autre nature (« 1 gâteau ») reste lisible ici.
    servings && servingsCount === null ? `Pour ${servings}.` : '',
    `Source : ${host}${author && !fold(author).includes(fold(host).split('.')[0]!) ? `, par ${author}` : ''}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    name,
    category: mapCategory(category, keywords),
    timeMin: total ?? Math.max(10, steps.length * 10),
    level: mapLevel(`${keywords} ${asText(ld.difficulty)} ${asText(ld.educationalLevel)}`),
    price: mapPrice(`${keywords} ${asText(ld.estimatedCost)}`),
    description,
    ingredients: ingredients.length ? ingredients : ['—'],
    steps: steps.length ? steps : ['Bon appétit !'],
    servings,
    servingsCount,
    imageUrl: firstUrl(ld.image),
    sourceUrl: url.toString(),
    sourceName: host,
  };
}

/* ---------- Réseau ---------- */

const PRIVATE_HOST = /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|metadata\.google\.internal)$/i;

/**
 * Garde-fou SSRF : seules les URL http(s) publiques, sur le port standard, sont autorisées.
 * Les IP littérales (v4 et v6, le parseur URL normalise les formes hexa/décimales) et les noms
 * locaux sont refusés : une recette n'est jamais servie depuis une IP brute.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImportFailure(400, 'Lien invalide');
  }
  const host = url.hostname.toLowerCase();
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password ||
    (url.port && url.port !== '80' && url.port !== '443') ||
    host.startsWith('[') ||
    !host.includes('.') ||
    PRIVATE_HOST.test(host) ||
    /^[\d.]+$/.test(host)
  ) {
    throw new ImportFailure(400, 'Lien non autorisé');
  }
  return url;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/** Télécharge une page HTML publique : redirections vérifiées une à une, délai et taille bornés. */
export async function fetchHtml(rawUrl: string, opts: FetchOptions = {}): Promise<{ url: string; html: string }> {
  const { fetchImpl = fetch, timeoutMs = 10_000, maxBytes = 3_000_000, maxRedirects = 4 } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let url = assertPublicHttpUrl(rawUrl);
    for (let hop = 0; ; hop++) {
      let res: Response;
      try {
        res = await fetchImpl(url.toString(), {
          redirect: 'manual',
          signal: ctrl.signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
          },
        });
      } catch {
        if (ctrl.signal.aborted) throw new ImportFailure(504, 'Le site source met trop de temps à répondre');
        throw new ImportFailure(502, 'Le site source est injoignable');
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc || hop >= maxRedirects) throw new ImportFailure(502, 'Trop de redirections');
        url = assertPublicHttpUrl(new URL(loc, url).toString());
        continue;
      }
      if (res.status === 404 || res.status === 410) throw new ImportFailure(404, 'Page introuvable sur le site source');
      if (!res.ok) throw new ImportFailure(502, `Le site source a répondu ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (type && !/html|xml/i.test(type)) throw new ImportFailure(422, "Ce lien n'est pas une page web");
      const html = await readCapped(res, maxBytes, ctrl);
      return { url: url.toString(), html };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number, ctrl: AbortController): Promise<string> {
  const charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  if (!res.body) return decoder.decode(new Uint8Array(await res.arrayBuffer()).slice(0, maxBytes));
  const reader = res.body.getReader();
  let out = '';
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (size >= maxBytes) {
        // Le JSON-LD est dans le <head> : la troncature d'une page géante est sans conséquence.
        ctrl.abort();
        break;
      }
    }
  } catch {
    if (!out) throw new ImportFailure(502, 'Lecture de la page impossible');
  }
  return out + decoder.decode();
}

/* ---------- Point d'entrée HTTP (commun Edge Function / middleware Vite) ---------- */

export interface ImportResponse {
  status: number;
  body: SearchPage | { recipe: ImportedRecipe } | { error: string };
  /** Durée de cache HTTP conseillée, en secondes. */
  maxAge: number;
}

export async function searchMarmiton(query: string, page = 1, opts: FetchOptions = {}): Promise<SearchPage> {
  const { html } = await fetchHtml(marmitonSearchUrl(query, page), opts);
  return parseMarmitonSearch(html, page);
}

export async function importRecipeFromUrl(rawUrl: string, opts: FetchOptions = {}): Promise<ImportedRecipe> {
  const { url, html } = await fetchHtml(rawUrl, opts);
  const ld = extractJsonLdRecipe(html);
  if (!ld) throw new ImportFailure(422, 'Aucune recette trouvée sur cette page');
  return toImportedRecipe(ld, url);
}

/**
 * `?q=risotto&page=2` → résultats de recherche Marmiton.
 * `?url=https://…`    → recette importée depuis la page.
 */
export async function handleImportRequest(params: URLSearchParams, opts: FetchOptions = {}): Promise<ImportResponse> {
  try {
    const rawUrl = params.get('url')?.trim();
    if (rawUrl) {
      if (rawUrl.length > MAX_URL_LENGTH) throw new ImportFailure(400, 'Lien trop long');
      return { status: 200, body: { recipe: await importRecipeFromUrl(rawUrl, opts) }, maxAge: 86_400 };
    }
    const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim();
    if (q.length < SEARCH_MIN_LENGTH) throw new ImportFailure(400, `Tapez au moins ${SEARCH_MIN_LENGTH} caractères`);
    if (q.length > SEARCH_MAX_LENGTH) throw new ImportFailure(400, 'Recherche trop longue');
    const page = Math.min(MAX_PAGE, Math.max(1, Math.trunc(Number(params.get('page') ?? '1')) || 1));
    return { status: 200, body: await searchMarmiton(q, page, opts), maxAge: 600 };
  } catch (e) {
    if (e instanceof ImportFailure) return { status: e.status, body: { error: e.message }, maxAge: 0 };
    return { status: 500, body: { error: 'Erreur inattendue pendant l’import' }, maxAge: 0 };
  }
}
