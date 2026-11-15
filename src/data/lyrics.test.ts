import { describe, expect, it, vi } from 'vitest';
import { createLyricsApi, defaultLyricsApi } from './lyrics';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createLyricsApi', () => {
  it('envoie apikey et jeton, et renvoie les données avec la durée', async () => {
    const fetchImpl = vi.fn(async () => json({ hits: [] }));
    const api = createLyricsApi({ endpoint: 'https://x.supabase.co/functions/v1/lyrics', target: 't', apiKey: 'anon', getToken: async () => 'tok', fetchImpl });
    const r = await api.call<{ hits: [] }>({ source: 'lrclib', q: 'a b' }, new AbortController().signal);
    expect(r).toMatchObject({ ok: true, data: { hits: [] } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/functions/v1/lyrics?source=lrclib&q=a+b');
    expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer tok' });
  });

  it('formate les erreurs', async () => {
    const signal = new AbortController().signal;
    const call = (fetchImpl: typeof fetch, apiKey?: string) => createLyricsApi({ endpoint: 'api/lyrics', target: 't', apiKey, fetchImpl }).call({}, signal);
    expect(await call(async () => json({ error: 'Le site source a répondu 403' }, 502))).toMatchObject({ ok: false, error: '502 — Le site source a répondu 403' });
    expect(await call(async () => json({ code: 401, message: 'Missing authorization header' }, 401))).toMatchObject({ error: '401 — Missing authorization header' });
    expect(await call(async () => json({}, 500))).toMatchObject({ error: '500 — erreur' });
    expect(await call(async () => new Response('<html>', { status: 404 }), 'anon')).toMatchObject({ error: expect.stringContaining('non déployée') });
    expect(await call(async () => new Response('<html>'))).toMatchObject({ error: expect.stringContaining('npm run dev') });
    expect(
      await call(async () => {
        throw new TypeError('fetch failed');
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('Requête impossible') });
  });

  it('propage l’annulation', async () => {
    const ac = new AbortController();
    ac.abort();
    const api = createLyricsApi({ endpoint: 'api/lyrics', target: 't', fetchImpl: async () => Promise.reject(new DOMException('aborted', 'AbortError')) });
    await expect(api.call({}, ac.signal)).rejects.toThrow();
  });
});

describe('defaultLyricsApi', () => {
  it('utilise le middleware Vite en mode local', () => {
    expect(defaultLyricsApi('local', async () => null).target).toContain('Vite');
  });

  it('utilise l’Edge Function en mode Supabase', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co/');
    try {
      expect(defaultLyricsApi('supabase', async () => null).target).toContain('Edge Function');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
