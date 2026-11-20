import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import type { Plugin } from 'vite';
import { claudeQueryWriter } from './supabase/functions/_shared/stepVideoQueries.ts';
import { flagEnabled, handleStepVideosRequest, memoryVideoCache, type QueryWriter } from './supabase/functions/_shared/stepVideos.ts';

export const STEP_VIDEOS_PATH = '/api/step-videos';
const MAX_BODY_BYTES = 64 * 1024;

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Sert `/api/step-videos` en dev et en preview (mode local) avec le même code que l'Edge Function.
 * Clés dans `.env.local` (jamais préfixées `VITE_`) : `YOUTUBE_API_KEY` (obligatoire, sinon 503 : le mode cuisine
 * s'affiche sans vidéo). Requêtes tirées du texte des étapes par défaut ; `STEP_VIDEOS_CLAUDE=1` les fait formuler
 * par Claude (payant : `ANTHROPIC_API_KEY`, à défaut le profil `ant auth login`). Cache en mémoire du serveur de dev.
 */
export function stepVideosApi(env: { youtubeKey?: string; anthropicKey?: string; useClaude?: string }): Plugin {
  const cache = memoryVideoCache();
  let writer: QueryWriter | null | undefined;
  const getWriter = (): QueryWriter | null => {
    if (writer === undefined) {
      try {
        writer = claudeQueryWriter(
          new Anthropic({ ...(env.anthropicKey ? { apiKey: env.anthropicKey } : {}), timeout: 30_000, maxRetries: 1 }),
        );
      } catch {
        writer = null;
      }
    }
    return writer;
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.endsWith(STEP_VIDEOS_PATH)) return next();
    if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée' });
    try {
      const raw = await readBody(req);
      if (raw === null) return send(res, 413, { error: 'Recette trop longue' });
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        /* corps invalide : handleStepVideosRequest renvoie 400 */
      }
      const { status, body: out } = await handleStepVideosRequest(body, {
        youtubeKey: env.youtubeKey ?? null,
        writer: env.youtubeKey && flagEnabled(env.useClaude) ? getWriter() : null,
        cache,
        log: (message, error) => console.warn(`[step-videos] ${message}`, error),
      });
      send(res, status, out);
    } catch (e) {
      console.error('[step-videos]', e);
      send(res, 500, { error: 'Erreur inattendue pendant la recherche de vidéos' });
    }
  };

  return {
    name: 'chefitto:step-videos-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
  };
}
