import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleImportRequest } from './supabase/functions/_shared/recipeScraper.ts';

export const RECIPE_IMPORT_PATH = '/api/recipe-import';

/**
 * Sert `/api/recipe-import` en dev (`vite`) et en preview (`vite preview`, tests e2e) avec exactement
 * le même code que la Supabase Edge Function. Utilisé en mode local (sans Supabase).
 */
export function recipeImportApi(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.endsWith(RECIPE_IMPORT_PATH)) return next();
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Méthode non autorisée' }));
    }
    const { status, body, maxAge } = await handleImportRequest(url.searchParams);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge > 0 ? `private, max-age=${maxAge}` : 'no-store',
    });
    res.end(JSON.stringify(body));
  };
  return {
    name: 'chefitto:recipe-import-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
  };
}
