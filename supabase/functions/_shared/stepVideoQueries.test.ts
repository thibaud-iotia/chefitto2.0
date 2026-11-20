import { describe, expect, it, vi } from 'vitest';
import { claudeQueryWriter, QUERY_MODEL, readQueries, type QueryClient } from './stepVideoQueries';

function fakeClient(reply: Partial<{ stop_reason: string; text: string }>) {
  const create = vi.fn<(params: Record<string, unknown>) => Promise<unknown>>(async () => ({
    stop_reason: reply.stop_reason ?? 'end_turn',
    content: [{ type: 'text', text: reply.text ?? '{"queries":[]}' }],
  }));
  return { client: { beta: { messages: { create } } } as unknown as QueryClient, create };
}

describe('readQueries', () => {
  it('replace chaque requête à son étape ; vide, absente ou hors bornes → null', () => {
    expect(
      readQueries(
        {
          queries: [
            { step: 2, query: '  nacrer   le riz ' },
            { step: 1, query: 'émincer une échalote' },
            { step: 3, query: '' },
            { step: 9, query: 'hors bornes' },
            { step: 1.5, query: 'pas entier' },
            { step: 4, query: 42 },
          ],
        },
        4,
      ),
    ).toEqual(['émincer une échalote', 'nacrer le riz', null, null]);
    expect(readQueries(null, 2)).toEqual([null, null]);
    expect(readQueries({ queries: [{ step: 1, query: 'x'.repeat(300) }] }, 1)[0]).toHaveLength(100);
  });
});

describe('claudeQueryWriter', () => {
  it('envoie les étapes numérotées avec sortie structurée et repli serveur', async () => {
    const { client, create } = fakeClient({ text: '{"queries":[{"step":1,"query":"émincer une échalote"},{"step":2,"query":""}]}' });
    const out = await claudeQueryWriter(client)('Risotto', ['Émincer les échalotes', 'Servir']);
    expect(out).toEqual(['émincer une échalote', null]);
    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: QUERY_MODEL,
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(params.messages).toEqual([{ role: 'user', content: 'Recette : Risotto\n\nÉtapes :\n1. Émincer les échalotes\n2. Servir' }]);
  });

  it.each(['refusal', 'max_tokens'])('stop_reason %s → erreur (le serveur passe aux requêtes de secours)', async (stop_reason) => {
    const { client } = fakeClient({ stop_reason });
    await expect(claudeQueryWriter(client)('R', ['a'])).rejects.toThrow(stop_reason);
  });

  it('JSON invalide → erreur', async () => {
    const { client } = fakeClient({ text: 'pas du json' });
    await expect(claudeQueryWriter(client)('R', ['a'])).rejects.toThrow();
  });
});
