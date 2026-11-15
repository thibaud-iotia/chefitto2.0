// Supabase Edge Function « fridge-scan » (Deno).
// Détecte les aliments sur des photos (frigo, placard, courses, ticket de caisse) avec Claude.
//
//   POST /functions/v1/fridge-scan   { images: [{ mediaType: 'image/jpeg', data: '<base64>' }] }
//     → 200 { items: [{ name, category, confidence }] }   |   4xx/5xx { error }
//
// Secret requis : supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
// Déploiement : supabase functions deploy fridge-scan --project-ref <ref> --use-api
// Réservée aux utilisateurs connectés (rôle JWT « authenticated ») et limitée par utilisateur.

import Anthropic from '@anthropic-ai/sdk';
import { createRateLimiter, handleScanRequest, MAX_BODY_BYTES } from '../_shared/fridgeScan.ts';
import { jwtClaims } from '../_shared/jwt.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const client = apiKey ? new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 }) : null;
/** 30 analyses par heure et par utilisateur (par instance). */
const limiter = createRateLimiter(Number(Deno.env.get('FRIDGE_SCAN_PER_HOUR') ?? 30), 60 * 60_000);

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
  if (role !== 'authenticated' || !sub) return json(401, { error: 'Connectez-vous pour analyser une photo' });
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return json(413, { error: 'Photos trop lourdes' });
  if (!limiter.take(sub)) return json(429, { error: "Trop d'analyses en peu de temps : réessayez plus tard." });

  const body = await req.json().catch(() => null);
  try {
    const { status, body: out } = await handleScanRequest(body, client);
    return json(status, out);
  } catch (e) {
    console.error('fridge-scan', e);
    return json(500, { error: 'Erreur inattendue pendant l’analyse' });
  }
});
