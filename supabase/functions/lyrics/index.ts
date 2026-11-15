// Supabase Edge Function « lyrics » (Deno) — prototype de la page de test `#/test`.
// Compare, depuis les serveurs Supabase, le scraping Genius et l'API LRCLIB.
//
//   GET /functions/v1/lyrics?source=genius&q=…    → { hits }
//   GET /functions/v1/lyrics?source=genius&url=…  → { lyrics, url }
//   GET /functions/v1/lyrics?source=lrclib&q=…    → { hits }
//
// Déploiement : supabase functions deploy lyrics --project-ref <ref> --use-api
// Comme recipe-import : JWT vérifié par la passerelle, et utilisateur connecté exigé.

import { jwtClaims } from '../_shared/jwt.ts';
import { handleLyricsRequest } from '../_shared/lyricsScraper.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json(405, { error: 'Méthode non autorisée' });
  if (jwtClaims(req.headers.get('Authorization')).role !== 'authenticated') return json(401, { error: 'Connectez-vous pour tester les paroles' });

  const { status, body } = await handleLyricsRequest(new URL(req.url).searchParams);
  return json(status, body);
});
