import { describe, expect, it, vi } from 'vitest';
import { createStepVideoFinder, noStepVideos } from './stepVideos';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const A = 'aaaaaaaaaaa';
const video = { id: A, title: 'Émincer', channel: 'Chef' };
const recipe = { name: 'Risotto', steps: ['Émincer', 'Servir'] };

describe('createStepVideoFinder', () => {
  it('POST nom + étapes avec jeton et clé ; réponse gardée pour la session', async () => {
    const fetchImpl = vi.fn(async () => json(200, { videos: [video, null] }));
    const finder = createStepVideoFinder({ endpoint: 'https://x.test/v', apiKey: 'anon', getToken: async () => 'tok', fetchImpl });
    expect(await finder.find(recipe)).toEqual([video, null]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/v');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer tok' });
    expect(JSON.parse(init.body as string)).toEqual({ recipe: 'Risotto', steps: ['Émincer', 'Servir'] });

    expect(await finder.find({ ...recipe })).toEqual([video, null]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await finder.find({ ...recipe, steps: ['Autre étape'] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('revérifie les vidéos reçues (identifiant injecté dans une URL d’iframe) et complète la liste', async () => {
    const fetchImpl = async () => json(200, { videos: [{ id: 'x"><script>', title: 't' }, { id: A, title: 3 }] });
    const finder = createStepVideoFinder({ endpoint: '/v', fetchImpl });
    expect(await finder.find({ name: 'R', steps: ['a', 'b', 'c'] })).toEqual([null, null, null]);
  });

  it('réponse partielle : affichée mais redemandée la fois suivante', async () => {
    const fetchImpl = vi.fn(async () => json(200, { videos: [video, null], partial: true }));
    const finder = createStepVideoFinder({ endpoint: '/v', fetchImpl });
    expect(await finder.find(recipe)).toEqual([video, null]);
    await finder.find(recipe);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('erreur serveur, non JSON ou réseau → rejet, puis nouvel essai possible', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(503, { error: 'Les vidéos ne sont pas configurées' }))
      .mockResolvedValueOnce(new Response('<html>', { status: 404 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(200, { videos: [null, null] }));
    const finder = createStepVideoFinder({ endpoint: '/v', fetchImpl });
    await expect(finder.find(recipe)).rejects.toThrow('pas configurées');
    await expect(finder.find(recipe)).rejects.toThrow('404');
    await expect(finder.find(recipe)).rejects.toThrow('fetch failed');
    expect(await finder.find(recipe)).toEqual([null, null]);
  });

  it('recette sans étape : aucun appel ; au-delà de 30 étapes : la fin sans vidéo', async () => {
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      const steps = (JSON.parse(init.body as string) as { steps: string[] }).steps;
      return json(200, { videos: steps.map(() => video) });
    });
    const finder = createStepVideoFinder({ endpoint: '/v', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await finder.find({ name: 'R', steps: [] })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    const out = await finder.find({ name: 'R', steps: Array.from({ length: 32 }, (_, i) => `étape ${i}`) });
    expect(out).toHaveLength(32);
    expect(out.slice(29)).toEqual([video, null, null]);
  });

  it('noStepVideos : aucune vidéo', async () => {
    expect(await noStepVideos.find(recipe)).toEqual([null, null]);
  });
});
