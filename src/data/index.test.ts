import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRepository } from './index';

afterEach(() => vi.unstubAllEnvs());

describe('createRepository', () => {
  it('mode local sans variables Supabase', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect((await createRepository()).mode).toBe('local');
  });

  it('mode local forcé', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'k');
    vi.stubEnv('VITE_DATA_MODE', 'local');
    expect((await createRepository()).mode).toBe('local');
  });

  it('mode supabase quand configuré', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'k');
    vi.stubEnv('VITE_DATA_MODE', '');
    expect((await createRepository()).mode).toBe('supabase');
  });
});
