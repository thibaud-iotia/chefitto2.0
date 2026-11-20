// Supabase Edge Function « step-videos » (Deno).
// Trouve une vidéo YouTube par étape de recette, pour le mode cuisine.
//
//   POST /functions/v1/step-videos   { recipe: 'Risotto au chorizo', steps: ['Émincer les échalotes…', …] }
//     → 200 { videos: [{ id, title, channel } | null, …], partial? }   |   4xx/5xx { error }
//
// Secret : supabase secrets set YOUTUBE_API_KEY=… --project-ref <ref>
// Requêtes tirées du texte des étapes (gratuit). Facultatif et payant : STEP_VIDEOS_CLAUDE=1 (+ ANTHROPIC_API_KEY)
// fait formuler les requêtes par Claude, plus précises.
// Déploiement : supabase functions deploy step-videos --project-ref <ref> --use-api
// Réservée aux utilisateurs connectés et limitée par utilisateur. Résultats mis en cache dans `step_videos_cache`
// (clé service_role fournie par Supabase) : le quota YouTube (~100 recherches / jour) est partagé par tous.

import Anthropic from '@anthropic-ai/sdk';
import { createRateLimiter } from '../_shared/fridgeScan.ts';
import { jwtClaims } from '../_shared/jwt.ts';
import { claudeQueryWriter } from '../_shared/stepVideoQueries.ts';
import { flagEnabled, handleStepVideosRequest, memoryVideoCache, supabaseVideoCache } from '../_shared/stepVideos.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const youtubeKey = Deno.env.get('YOUTUBE_API_KEY') ?? null;
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
// Claude seulement sur demande explicite : chaque recette non encore en cache coûterait un appel API.
const useClaude = flagEnabled(Deno.env.get('STEP_VIDEOS_CLAUDE'));
const writer = useClaude && anthropicKey ? claudeQueryWriter(new Anthropic({ apiKey: anthropicKey, timeout: 30_000, maxRetries: 1 })) : null;
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const cache = supabaseUrl && serviceKey ? supabaseVideoCache(supabaseUrl, serviceKey) : memoryVideoCache();
/** 60 recettes par heure et par utilisateur (par instance) : une ouverture du mode cuisine = un appel. */
const limiter = createRateLimiter(Number(Deno.env.get('STEP_VIDEOS_PER_HOUR') ?? 60), 60 * 60_000);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  const { role, sub } = jwtClaims(req.headers.get('Authorization'));
  if (role !== 'authenticated' || !sub) return json(401, { error: 'Connectez-vous pour voir les vidéos' });
  if (Number(req.headers.get('Content-Length') ?? 0) > 64 * 1024) return json(413, { error: 'Recette trop longue' });
  if (!limiter.take(sub)) return json(429, { error: 'Trop de recherches de vidéos : réessayez plus tard.' });

  const body = await req.json().catch(() => null);
  try {
    const { status, body: out } = await handleStepVideosRequest(body, {
      youtubeKey,
      writer,
      cache,
      log: (message, error) => console.error(message, error),
    });
    return json(status, out);
  } catch (e) {
    console.error('step-videos', e);
    return json(500, { error: 'Erreur inattendue pendant la recherche de vidéos' });
  }
});
