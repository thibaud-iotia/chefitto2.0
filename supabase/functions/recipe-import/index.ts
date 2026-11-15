// Supabase Edge Function « recipe-import » (Deno).
// Proxy de recherche / import de recettes : le navigateur ne peut pas lire Marmiton directement (CORS).
//
//   GET /functions/v1/recipe-import?q=risotto&page=1   → { results, page, hasMore }
//   GET /functions/v1/recipe-import?url=https://…      → { recipe }
//
// Déploiement : supabase functions deploy recipe-import --project-ref <ref>
// La passerelle Supabase vérifie la signature du JWT (verify_jwt) ; on exige en plus un utilisateur
// connecté (rôle « authenticated »), pour que la clé anon publique seule ne suffise pas.

import { jwtClaims } from '../_shared/jwt.ts';
import { handleImportRequest } from '../_shared/recipeScraper.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(status: number, body: unknown, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge > 0 ? `private, max-age=${maxAge}` : 'no-store',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json(405, { error: 'Méthode non autorisée' });
  if (jwtClaims(req.headers.get('Authorization')).role !== 'authenticated') return json(401, { error: 'Connectez-vous pour importer une recette' });

  const { status, body, maxAge } = await handleImportRequest(new URL(req.url).searchParams);
  return json(status, body, maxAge);
});
