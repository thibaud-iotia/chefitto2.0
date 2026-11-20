// Contrat sans dépendance : n'importe surtout pas `_shared/stepVideoQueries.ts` (il embarque le SDK serveur).
import type { StepVideo, StepVideosResponseBody } from '../../supabase/functions/_shared/stepVideosContract.ts';
import { isVideoId, MAX_STEPS } from '../../supabase/functions/_shared/stepVideosContract.ts';
import type { Recipe } from '../domain/types';

export type { StepVideo };
export { videoEmbedUrl, videoThumbnail } from '../../supabase/functions/_shared/stepVideosContract.ts';

/**
 * Vidéo YouTube par étape (mode cuisine).
 * - mode Supabase : Edge Function `step-videos` (jeton de l'utilisateur connecté) ;
 * - mode local : `api/step-videos`, servi par le middleware Vite (dev, preview).
 */
export interface StepVideoFinder {
  /**
   * `videos[i]` pour `recipe.steps[i]` (`null` : pas de vidéo). Rejette si le service est injoignable ou non configuré :
   * le mode cuisine s'affiche alors sans vidéo.
   */
  find(recipe: Pick<Recipe, 'name' | 'steps'>, signal?: AbortSignal): Promise<(StepVideo | null)[]>;
}

/** Ne cherche rien (tests, environnements sans service). */
export const noStepVideos: StepVideoFinder = { find: async (r) => r.steps.map(() => null) };

export interface StepVideoOptions {
  endpoint: string;
  apiKey?: string;
  getToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

const CACHE_MAX = 30;

/** Revérifie chaque vidéo reçue : identifiant YouTube valide (il finit dans une URL d'iframe), titre texte. */
function readVideos(raw: unknown, count: number): (StepVideo | null)[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => {
    const v = list[i] as Partial<StepVideo> | null | undefined;
    if (!v || !isVideoId(v.id) || typeof v.title !== 'string') return null;
    return { id: v.id, title: v.title, channel: typeof v.channel === 'string' ? v.channel : '' };
  });
}

export function createStepVideoFinder(opts: StepVideoOptions): StepVideoFinder {
  /** Réponses complètes de la session, par recette (nom + étapes) : revenir sur une recette ne recherche rien. */
  const cache = new Map<string, Promise<(StepVideo | null)[]>>();

  async function request(recipe: string, steps: string[], signal?: AbortSignal): Promise<{ videos: (StepVideo | null)[]; partial: boolean }> {
    const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (opts.apiKey) headers.apikey = opts.apiKey;
    const token = await opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await (opts.fetchImpl ?? fetch)(new URL(opts.endpoint, base).toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipe, steps }),
      signal,
    });
    const body = ((res.headers.get('content-type') ?? '').includes('application/json')
      ? await res.json().catch(() => null)
      : null) as StepVideosResponseBody | null;
    if (!res.ok || !body || !('videos' in body)) {
      throw new Error(body && 'error' in body ? body.error : `Vidéos indisponibles (${res.status})`);
    }
    return { videos: readVideos(body.videos, steps.length), partial: body.partial === true };
  }

  return {
    find(recipe, signal) {
      const steps = recipe.steps.slice(0, MAX_STEPS);
      if (steps.length === 0) return Promise.resolve([]);
      const key = JSON.stringify([recipe.name, steps]);
      const hit = cache.get(key);
      if (hit) return hit;
      const p = request(recipe.name, steps, signal).then(({ videos, partial }) => {
        // Réponse partielle (quota YouTube épuisé…) : affichée, mais pas gardée, pour réessayer plus tard.
        if (partial) cache.delete(key);
        return [...videos, ...recipe.steps.slice(MAX_STEPS).map(() => null)];
      });
      p.catch(() => cache.delete(key));
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, p);
      return p;
    },
  };
}

/** Configure le client selon l'environnement de build (même logique que la détection d'aliments). */
export function defaultStepVideoFinder(mode: 'local' | 'supabase', getToken: () => Promise<string | null>): StepVideoFinder {
  const custom = import.meta.env.VITE_STEP_VIDEOS_URL as string | undefined;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (custom) return createStepVideoFinder({ endpoint: custom, apiKey, getToken });
  if (mode === 'supabase' && supabaseUrl) {
    return createStepVideoFinder({ endpoint: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/step-videos`, apiKey, getToken });
  }
  return createStepVideoFinder({ endpoint: 'api/step-videos' });
}
