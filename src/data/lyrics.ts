/**
 * Client de la page de test des paroles (`#/test`).
 * - mode Supabase : Edge Function `lyrics` (jeton de l'utilisateur connecté) — test « en prod » ;
 * - mode local : `api/lyrics`, servi par le middleware Vite (dev / preview).
 */

export type LyricsOutcome<T> = { ok: true; data: T; ms: number } | { ok: false; error: string; ms: number };

export interface LyricsApi {
  /** Où partent les requêtes, affiché sur la page de test. */
  target: string;
  call<T>(params: Record<string, string>, signal: AbortSignal): Promise<LyricsOutcome<T>>;
}

export interface LyricsApiOptions {
  endpoint: string;
  target: string;
  apiKey?: string;
  getToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export function createLyricsApi(opts: LyricsApiOptions): LyricsApi {
  return {
    target: opts.target,
    async call<T>(params: Record<string, string>, signal: AbortSignal): Promise<LyricsOutcome<T>> {
      const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
      const url = new URL(opts.endpoint, base);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (opts.apiKey) headers.apikey = opts.apiKey;
      const token = await opts.getToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;

      const t0 = performance.now();
      const ms = () => Math.round(performance.now() - t0);
      try {
        const res = await (opts.fetchImpl ?? fetch)(url.toString(), { signal, headers });
        const body = (res.headers.get('content-type') ?? '').includes('application/json')
          ? ((await res.json().catch(() => null)) as (T & { error?: string; message?: string }) | null)
          : null;
        if (!body) {
          const hint = opts.apiKey ? 'Edge Function `lyrics` non déployée ?' : 'lancez `npm run dev` (middleware Vite).';
          return { ok: false, error: `${res.status} — réponse inattendue : ${hint}`, ms: ms() };
        }
        if (!res.ok) return { ok: false, error: `${res.status} — ${body.error ?? body.message ?? 'erreur'}`, ms: ms() };
        return { ok: true, data: body, ms: ms() };
      } catch (e) {
        if (signal.aborted) throw e;
        return { ok: false, error: 'Requête impossible (réseau, CORS ou fonction absente)', ms: ms() };
      }
    },
  };
}

/** Configure le client selon l'environnement de build (même logique que l'import de recettes). */
export function defaultLyricsApi(mode: 'local' | 'supabase', getToken: () => Promise<string | null>): LyricsApi {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (mode === 'supabase' && supabaseUrl) {
    return createLyricsApi({
      endpoint: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/lyrics`,
      target: 'Edge Function Supabase « lyrics »',
      apiKey,
      getToken,
    });
  }
  return createLyricsApi({ endpoint: 'api/lyrics', target: 'Middleware Vite local (/api/lyrics)' });
}
