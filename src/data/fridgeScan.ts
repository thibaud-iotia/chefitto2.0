// Contrat sans dépendance : n'importe surtout pas `_shared/fridgeScan.ts` (il embarque le SDK serveur).
import type { DetectedFood, ScanImage } from '../../supabase/functions/_shared/fridgeScanContract.ts';

export type { DetectedFood, ScanImage };
export { MAX_IMAGES } from '../../supabase/functions/_shared/fridgeScanContract.ts';

/**
 * Client de la détection d'aliments sur photo.
 * - mode Supabase : Edge Function `fridge-scan` (jeton de l'utilisateur connecté) ;
 * - mode local : `api/fridge-scan`, servi par le middleware Vite (dev, preview).
 */
export interface FridgeScanner {
  scan(images: ScanImage[], signal?: AbortSignal): Promise<DetectedFood[]>;
}

export type ScanErrorKind = 'offline' | 'unavailable' | 'auth' | 'input' | 'busy' | 'source';

export class ScanError extends Error {
  constructor(
    message: string,
    readonly kind: ScanErrorKind,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

export interface ScannerOptions {
  endpoint: string;
  apiKey?: string;
  getToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export function createFridgeScanner(opts: ScannerOptions): FridgeScanner {
  return {
    async scan(images, signal) {
      const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
      const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
      if (opts.apiKey) headers.apikey = opts.apiKey;
      const token = await opts.getToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;

      let res: Response;
      try {
        res = await (opts.fetchImpl ?? fetch)(new URL(opts.endpoint, base).toString(), {
          method: 'POST',
          headers,
          body: JSON.stringify({ images }),
          signal,
        });
      } catch (e) {
        if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) throw e;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          throw new ScanError('Vous êtes hors ligne : la détection nécessite une connexion.', 'offline');
        }
        throw new ScanError('Le service de détection est injoignable. Réessayez dans un instant.', 'unavailable');
      }

      type Body = { items?: DetectedFood[]; error?: string } | null;
      let body: Body = null;
      if ((res.headers.get('content-type') ?? '').includes('application/json')) {
        body = (await res.json().catch(() => null)) as Body;
      }
      if (!body) throw new ScanError("La détection d'aliments n'est pas disponible sur cette version de l'app.", 'unavailable');
      if (!res.ok || !Array.isArray(body.items)) {
        const message = body.error ?? `Erreur ${res.status}`;
        if (res.status === 401 || res.status === 403) throw new ScanError(message, 'auth');
        if (res.status === 400 || res.status === 413 || res.status === 422) throw new ScanError(message, 'input');
        if (res.status === 429) throw new ScanError(message, 'busy');
        if (res.status === 503) throw new ScanError(message, 'unavailable');
        throw new ScanError(message, 'source');
      }
      return body.items;
    },
  };
}

/** Configure le client selon l'environnement de build (même logique que l'import de recettes). */
export function defaultScanner(mode: 'local' | 'supabase', getToken: () => Promise<string | null>): FridgeScanner {
  const custom = import.meta.env.VITE_FRIDGE_SCAN_URL as string | undefined;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (custom) return createFridgeScanner({ endpoint: custom, apiKey, getToken });
  if (mode === 'supabase' && supabaseUrl) {
    return createFridgeScanner({ endpoint: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/fridge-scan`, apiKey, getToken });
  }
  return createFridgeScanner({ endpoint: 'api/fridge-scan' });
}
