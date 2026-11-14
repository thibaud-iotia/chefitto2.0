import { LocalRepository } from './localRepository';
import type { Repository } from './repository';

/**
 * Choisit l'implémentation selon l'environnement de build.
 * Supabase est chargé à la demande (import dynamique) pour alléger le bundle initial.
 */
export async function createRepository(): Promise<Repository> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const forced = import.meta.env.VITE_DATA_MODE as string | undefined;

  if (forced === 'local' || !url || !key) return new LocalRepository();

  const [{ createClient }, { SupabaseRepository }] = await Promise.all([
    import('@supabase/supabase-js'),
    import('./supabaseRepository'),
  ]);
  const client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'chefitto-auth' },
  });
  return new SupabaseRepository(client);
}
