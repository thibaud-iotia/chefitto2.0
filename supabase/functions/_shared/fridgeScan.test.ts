import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { FOOD_CATEGORIES } from '../../../src/domain/types';
import {
  createRateLimiter,
  handleScanRequest,
  MAX_IMAGES,
  normalizeDetected,
  parseScanInput,
  SCAN_CATEGORIES,
  SCAN_MODEL,
  type ScanClient,
} from './fridgeScan';
import { jwtClaims } from './jwt';

const IMG = { mediaType: 'image/jpeg', data: 'QUJDREVGR0hJSktMTU5PUA==' };

function fakeClient(reply: Partial<{ stop_reason: string; text: string }> | Error) {
  const create = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return { stop_reason: reply.stop_reason ?? 'end_turn', content: [{ type: 'text', text: reply.text ?? '{"items":[]}' }] };
  });
  return { client: { beta: { messages: { create } } } as unknown as ScanClient, create };
}

describe('fridge-scan — contrat', () => {
  it('catégories identiques à celles de l’app', () => {
    expect([...SCAN_CATEGORIES]).toEqual([...FOOD_CATEGORIES]);
  });
});

describe('parseScanInput', () => {
  it('accepte 1 à 4 images base64 de type connu', () => {
    expect(parseScanInput({ images: [IMG, { ...IMG, mediaType: 'image/png' }] })).toHaveLength(2);
  });
  it.each([
    [null, 'Ajoutez au moins une photo'],
    [{ images: [] }, 'Ajoutez au moins une photo'],
    [{ images: Array(MAX_IMAGES + 1).fill(IMG) }, '4 photos maximum par analyse'],
    [{ images: [{ ...IMG, mediaType: 'image/heic' }] }, /Format de photo/],
    [{ images: [{ ...IMG, data: 'pas du base64 !!!!!!' }] }, 'Photo illisible'],
    [{ images: [{ ...IMG, data: 'A'.repeat(7_100_000) }] }, /trop lourde/],
  ])('refuse %#', (body, msg) => {
    const r = parseScanInput(body);
    expect(typeof r).toBe('string');
    expect(r).toMatch(msg);
  });
});

describe('normalizeDetected', () => {
  it('nettoie, capitalise, fusionne les doublons et borne les catégories', () => {
    expect(
      normalizeDetected({
        items: [
          { name: '  yaourt   nature ', category: 'Autre', confidence: 'high' },
          { name: 'Yaourt Nature', category: 'Autre', confidence: 'low' },
          { name: 'œuf', category: 'Inconnue', confidence: 'bizarre' },
          { name: 'Oeuf', category: 'Autre', confidence: 'high' },
          { name: '', category: 'Fruit', confidence: 'high' },
          { name: 42 },
          { name: 'Saumon', category: 'Poisson', confidence: 'low' },
        ],
      }),
    ).toEqual([
      { name: 'Yaourt nature', category: 'Autre', confidence: 'high' },
      { name: 'Œuf', category: 'Autre', confidence: 'medium' },
      { name: 'Saumon', category: 'Poisson', confidence: 'low' },
    ]);
  });
  it('tolère une sortie sans liste', () => {
    expect(normalizeDetected(null)).toEqual([]);
    expect(normalizeDetected({ items: 'x' })).toEqual([]);
  });
});

describe('handleScanRequest', () => {
  it('envoie les images au modèle avec sortie structurée et renvoie les aliments', async () => {
    const { client, create } = fakeClient({ text: '{"items":[{"name":"tomate","category":"Légume","confidence":"high"}]}' });
    const r = await handleScanRequest({ images: [IMG, IMG] }, client);
    expect(r).toEqual({ status: 200, body: { items: [{ name: 'Tomate', category: 'Légume', confidence: 'high' }] } });
    const params = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params.model).toBe(SCAN_MODEL);
    expect(params.output_config).toMatchObject({ format: { type: 'json_schema' } });
    expect(params.fallbacks).toBe('default');
    const content = (params.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.filter((b) => b.type === 'image')).toHaveLength(2);
    expect(content.at(-1)!.type).toBe('text');
  });

  it('400 sur entrée invalide, sans appeler le modèle', async () => {
    const { client, create } = fakeClient({});
    expect((await handleScanRequest({}, client)).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('503 sans clé API', async () => {
    const r = await handleScanRequest({ images: [IMG] }, null);
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ error: expect.stringMatching(/ANTHROPIC_API_KEY/) });
  });

  it.each([
    [{ stop_reason: 'refusal' }, 422],
    [{ stop_reason: 'max_tokens' }, 502],
    [{ text: 'pas du json' }, 502],
  ])('réponse modèle %o → %i', async (reply, status) => {
    expect((await handleScanRequest({ images: [IMG] }, fakeClient(reply).client)).status).toBe(status);
  });

  it.each([
    [new Anthropic.RateLimitError(429, undefined, 'rl', new Headers()), 429],
    [new Anthropic.AuthenticationError(401, undefined, 'key', new Headers()), 503],
    [new Anthropic.BadRequestError(400, undefined, 'bad', new Headers()), 400],
    [new Anthropic.InternalServerError(500, undefined, 'boom', new Headers()), 502],
  ])('erreur API %# → %i', async (err, status) => {
    expect((await handleScanRequest({ images: [IMG] }, fakeClient(err).client)).status).toBe(status);
  });

  it('laisse remonter les erreurs non-API', async () => {
    await expect(handleScanRequest({ images: [IMG] }, fakeClient(new TypeError('bug')).client)).rejects.toThrow('bug');
  });
});

describe('createRateLimiter', () => {
  it('bloque au-delà de la limite puis libère après la fenêtre', () => {
    let t = 0;
    const lim = createRateLimiter(2, 1000, () => t);
    expect(lim.take('a')).toBe(true);
    expect(lim.take('a')).toBe(true);
    expect(lim.take('a')).toBe(false);
    expect(lim.take('b')).toBe(true);
    t = 1001;
    expect(lim.take('a')).toBe(true);
  });
});

describe('jwtClaims', () => {
  const tok = (claims: object) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`;
  it('lit rôle et sujet', () => {
    expect(jwtClaims(`Bearer ${tok({ role: 'authenticated', sub: 'u1' })}`)).toEqual({ role: 'authenticated', sub: 'u1' });
  });
  it('null si absent ou illisible', () => {
    expect(jwtClaims(null)).toEqual({ role: null, sub: null });
    expect(jwtClaims('Bearer a.%%%.c')).toEqual({ role: null, sub: null });
    expect(jwtClaims(`Bearer ${tok({ role: 1 })}`)).toEqual({ role: null, sub: null });
  });
});
