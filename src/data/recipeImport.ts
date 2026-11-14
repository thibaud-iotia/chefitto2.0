import type { ImportedRecipe, SearchPage, SearchResult } from '../../supabase/functions/_shared/recipeScraper.ts';

export type { ImportedRecipe, SearchPage, SearchResult };

/**
 * Client de la recherche / import de recettes en ligne.
 * - mode Supabase : Edge Function `recipe-import` (jeton de l'utilisateur connecté) ;
 * - mode local : `api/recipe-import`, servi par le middleware Vite (dev, preview, e2e).
 */
export interface RecipeImporter {
  search(query: string, page?: number, signal?: AbortSignal): Promise<SearchPage>;
  fetchRecipe(url: string, signal?: AbortSignal): Promise<ImportedRecipe>;
}

export type ImportErrorKind = 'offline' | 'unavailable' | 'auth' | 'input' | 'source';

export class ImportError extends Error {
  constructor(
    message: string,
    readonly kind: ImportErrorKind,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export interface ImporterOptions {
  endpoint: string;
  /** Clé publique Supabase (`apikey`), requise par la passerelle des Edge Functions. */
  apiKey?: string;
  getToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** Durée de vie du cache mémoire des recherches (ms). */
  cacheMs?: number;
}

const CACHE_MAX = 40;

export function createRecipeImporter(opts: ImporterOptions): RecipeImporter {
  const { endpoint, apiKey, getToken, cacheMs = 5 * 60_000 } = opts;
  const cache = new Map<string, { at: number; value: unknown }>();

  async function call<T>(params: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
    const url = new URL(endpoint, base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const key = url.toString();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return hit.value as T;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers.apikey = apiKey;
    const token = await getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await (opts.fetchImpl ?? fetch)(key, { headers, signal });
    } catch (e) {
      if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) throw e;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new ImportError('Vous êtes hors ligne : la recherche en ligne est indisponible.', 'offline');
      }
      throw new ImportError("Le service d'import est injoignable. Réessayez dans un instant.", 'unavailable');
    }

    let body: { error?: string } | null = null;
    if ((res.headers.get('content-type') ?? '').includes('application/json')) {
      body = (await res.json().catch(() => null)) as { error?: string } | null;
    }
    if (!res.ok || !body) {
      if (!body) throw new ImportError("La recherche en ligne n'est pas disponible sur cette version de l'app.", 'unavailable');
      const message = body.error ?? `Erreur ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ImportError(message, 'auth');
      if (res.status === 400) throw new ImportError(message, 'input');
      throw new ImportError(message, 'source');
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value: body });
    return body as T;
  }

  return {
    search: (query, page = 1, signal) => call<SearchPage>({ q: query.trim(), page: String(page) }, signal),
    fetchRecipe: async (url, signal) => (await call<{ recipe: ImportedRecipe }>({ url: url.trim() }, signal)).recipe,
  };
}

/** Configure le client selon l'environnement de build. */
export function defaultImporter(mode: 'local' | 'supabase', getToken: () => Promise<string | null>): RecipeImporter {
  const custom = import.meta.env.VITE_IMPORT_URL as string | undefined;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (custom) return createRecipeImporter({ endpoint: custom, apiKey, getToken });
  if (mode === 'supabase' && supabaseUrl) {
    return createRecipeImporter({ endpoint: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/recipe-import`, apiKey, getToken });
  }
  return createRecipeImporter({ endpoint: 'api/recipe-import' });
}

/** « https://… », « www.… » ou « site.fr/chemin » → URL normalisée ; sinon `null` (texte de recherche). */
export function asRecipeUrl(input: string): string | null {
  const t = input.trim();
  if (!t || /\s/.test(t)) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i.test(t) ? `https://${t}` : null;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    return u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}
