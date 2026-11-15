import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleLyricsRequest } from './supabase/functions/_shared/lyricsScraper.ts';

export const LYRICS_PATH = '/api/lyrics';

/** Sert `/api/lyrics` en dev et en preview, pour la page de test `#/test` (Genius vs LRCLIB). */
export function lyricsApi(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.endsWith(LYRICS_PATH)) return next();
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Méthode non autorisée' }));
    }
    const { status, body } = await handleLyricsRequest(url.searchParams);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  return {
    name: 'chefitto:lyrics-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
  };
}
