import { describe, expect, it, vi } from 'vitest';
import { createFridgeScanner, ScanError } from './fridgeScan';
import { fitWithin } from './imagePrep';

const IMG = { mediaType: 'image/jpeg' as const, data: 'QUJD' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createFridgeScanner', () => {
  it('POST les images avec jeton et clé, renvoie les aliments', async () => {
    const items = [{ name: 'Tomate', category: 'Légume', confidence: 'high' }];
    const fetchImpl = vi.fn(async () => json(200, { items }));
    const scanner = createFridgeScanner({ endpoint: 'https://x.test/scan', apiKey: 'anon', getToken: async () => 'tok', fetchImpl });
    expect(await scanner.scan([IMG])).toEqual(items);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/scan');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer tok' });
    expect(JSON.parse(init.body as string)).toEqual({ images: [IMG] });
  });

  it.each([
    [401, 'auth'],
    [400, 'input'],
    [422, 'input'],
    [429, 'busy'],
    [503, 'unavailable'],
    [502, 'source'],
  ])('HTTP %i → %s avec le message du serveur', async (status, kind) => {
    const scanner = createFridgeScanner({ endpoint: '/s', fetchImpl: async () => json(status, { error: 'Message serveur' }) });
    const err = await scanner.scan([IMG]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScanError);
    expect(err).toMatchObject({ kind, message: 'Message serveur' });
  });

  it('réponse non JSON (pas de proxy) → indisponible', async () => {
    const scanner = createFridgeScanner({ endpoint: '/s', fetchImpl: async () => new Response('<html>', { status: 404 }) });
    await expect(scanner.scan([IMG])).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('réseau coupé → hors ligne ou injoignable ; annulation propagée', async () => {
    const fail = async () => {
      throw new TypeError('Failed to fetch');
    };
    const scanner = createFridgeScanner({ endpoint: '/s', fetchImpl: fail });
    await expect(scanner.scan([IMG])).rejects.toMatchObject({ kind: 'unavailable' });
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(scanner.scan([IMG])).rejects.toMatchObject({ kind: 'offline' });
    spy.mockRestore();

    const ctrl = new AbortController();
    ctrl.abort();
    const abortErr = new DOMException('aborted', 'AbortError');
    const aborting = createFridgeScanner({
      endpoint: '/s',
      fetchImpl: async () => {
        throw abortErr;
      },
    });
    await expect(aborting.scan([IMG], ctrl.signal)).rejects.toBe(abortErr);
  });
});

describe('fitWithin', () => {
  it('réduit en gardant les proportions, sans agrandir', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1568, height: 1176 });
    expect(fitWithin(3000, 4000, 1000)).toEqual({ width: 750, height: 1000 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
