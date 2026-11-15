/**
 * Lit les claims d'un JWT Supabase **sans vérifier la signature** : la passerelle des Edge Functions
 * (verify_jwt) l'a déjà vérifiée avant d'appeler la fonction. Ne pas utiliser ailleurs.
 */
export function jwtClaims(authorization: string | null): { role: string | null; sub: string | null } {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const payload = token?.split('.')[1];
  if (!payload) return { role: null, sub: null };
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(atob(b64)) as { role?: unknown; sub?: unknown };
    return {
      role: typeof claims.role === 'string' ? claims.role : null,
      sub: typeof claims.sub === 'string' ? claims.sub : null,
    };
  } catch {
    return { role: null, sub: null };
  }
}
