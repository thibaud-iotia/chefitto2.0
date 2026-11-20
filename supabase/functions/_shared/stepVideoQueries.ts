// Formulation, par Claude, d'une requête de recherche YouTube par étape de recette.
// OPTION PAYANTE, désactivée par défaut : n'est utilisée que si `STEP_VIDEOS_CLAUDE=1` (sinon `fallbackQuery`).
// Séparé de `stepVideos.ts` : seul ce fichier embarque le SDK (résolu par npm côté Node,
// par `step-videos/deno.json` côté Deno). L'app n'importe jamais ce fichier.

import type Anthropic from '@anthropic-ai/sdk';
import type { QueryWriter } from './stepVideos.ts';

export const QUERY_MODEL = 'claude-opus-5-5';
const MAX_QUERY_CHARS = 100;

/** Sous-ensemble du client utilisé : permet de passer un faux client dans les tests. */
export type QueryClient = Pick<Anthropic, 'beta'>;

const SYSTEM_PROMPT = `Tu aides Chefitto, une application de recettes, à illustrer son mode cuisine pas à pas : sous chaque étape, l'application affiche une courte vidéo YouTube trouvée avec la requête que tu écris. Le cuisinier a les mains occupées et regarde la vidéo pour voir le geste, pas pour suivre une autre recette.

Pour chaque étape, écris la requête de recherche YouTube, en français, qui trouvera un tutoriel montrant le geste ou la technique principale de l'étape :
- Nomme le geste et l'ingrédient concernés, comme le taperait quelqu'un qui veut apprendre ce geste : « comment émincer une échalote », « nacrer le riz pour un risotto », « monter des blancs en neige », « faire un roux ».
- Quand l'étape est propre au plat (montage, cuisson particulière), ajoute le plat : « monter des lasagnes », « cuire une pâte à crêpes ».
- Sans quantités, durées, températures ni marques ; 3 à 8 mots.
- Plusieurs gestes dans une étape : choisis celui qui a le plus besoin d'être vu.
- Laisse la requête vide quand rien ne mérite d'être montré : servir, goûter, saler, laisser reposer, réserver, attendre, « Bon appétit ».`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'integer' },
          query: { type: 'string' },
        },
        required: ['step', 'query'],
        additionalProperties: false,
      },
    },
  },
  required: ['queries'],
  additionalProperties: false,
} as const;

/** Lit la sortie du modèle : une requête (ou `null`) par étape, dans l'ordre, quelles que soient les étapes oubliées. */
export function readQueries(raw: unknown, count: number): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: count }, () => null);
  const items = (raw as { queries?: unknown } | null)?.queries;
  if (!Array.isArray(items)) return out;
  for (const it of items as { step?: unknown; query?: unknown }[]) {
    const i = typeof it?.step === 'number' ? it.step - 1 : -1;
    if (!Number.isInteger(i) || i < 0 || i >= count || typeof it.query !== 'string') continue;
    const q = it.query.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS);
    out[i] = q || null;
  }
  return out;
}

/** `QueryWriter` adossé à Claude (sortie structurée JSON, effort bas : reformulation simple, réponse en quelques secondes). */
export function claudeQueryWriter(client: QueryClient): QueryWriter {
  return async (recipe, steps) => {
    const response = await client.beta.messages.create({
      model: QUERY_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      // Si un classifieur de sécurité refuse (faux positif), l'API rejoue la requête sur un modèle de repli.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Recette : ${recipe}\n\nÉtapes :\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
        },
      ],
    });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      throw new Error(`Requêtes non rédigées (${response.stop_reason})`);
    }
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    return readQueries(JSON.parse(text), steps.length);
  };
}
