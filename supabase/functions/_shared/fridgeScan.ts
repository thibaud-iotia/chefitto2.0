// Détection d'aliments sur photo (frigo, placard, courses, ticket de caisse) via Claude (vision).
// Code commun : Supabase Edge Function `fridge-scan` (Deno) et middleware Vite `/api/fridge-scan` (Node).
// `@anthropic-ai/sdk` est résolu par npm côté Node et par `fridge-scan/deno.json` côté Deno.

import Anthropic from '@anthropic-ai/sdk';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MEDIA_TYPES,
  SCAN_CATEGORIES,
  type DetectedFood,
  type ScanCategory,
  type ScanImage,
  type ScanMediaType,
  type ScanResponseBody,
} from './fridgeScanContract.ts';

export * from './fridgeScanContract.ts';

export const SCAN_MODEL = 'claude-opus-5-5';
const MAX_ITEMS = 80;
const MAX_NAME = 60;

export interface ScanResult {
  status: number;
  body: ScanResponseBody;
}

/** Sous-ensemble du client utilisé : permet de passer un faux client dans les tests. */
export type ScanClient = Pick<Anthropic, 'beta'>;

const SYSTEM_PROMPT = `Tu es l'assistant d'inventaire de Chefitto, une application de recettes. L'utilisateur photographie son frigo, son placard, ses courses ou un ticket de caisse pour remplir la liste « Mon frigo ». L'application propose ensuite des recettes en comparant chaque nom d'aliment aux ingrédients des recettes (correspondance par inclusion de texte, sans accents ni majuscules). Des noms simples et génériques donnent donc de bien meilleures suggestions.

Liste les aliments présents sur la ou les photos :
- Nom en français, au singulier, première lettre en majuscule, sans marque ni quantité ni conditionnement : « Tomate », « Lait », « Œuf », « Poulet », « Yaourt nature ». Garde une précision quand elle change l'usage en cuisine : « Crème fraîche », « Fromage râpé », « Lardon ».
- Catégorie : Légume (y compris herbes aromatiques, champignons, ail, oignon, pomme de terre), Fruit (y compris citron et avocat), Viande (y compris volaille et charcuterie), Poisson (y compris fruits de mer, poisson en conserve), Autre (produits laitiers, œufs, féculents, épicerie, sauces, condiments, boissons, plats préparés).
- Ticket de caisse : une entrée par produit alimentaire ; décode les abréviations (« YAOURT NAT. X4 » → « Yaourt nature ») ; ignore les lignes non alimentaires, totaux et remises.
- N'invente pas le contenu d'un emballage opaque ou illisible. En cas de doute sur l'identification, mets la confiance à « low » ; « high » seulement si l'aliment est clairement identifiable.
- Un aliment visible sur plusieurs photos n'apparaît qu'une fois.
- Ignore tout ce qui n'est pas comestible.
Si aucun aliment n'est identifiable, renvoie une liste vide.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: [...SCAN_CATEGORIES] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'category', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Valide le corps `{ images: [{ mediaType, data }] }` ; renvoie un message d'erreur ou les images. */
export function parseScanInput(body: unknown): ScanImage[] | string {
  const images = (body as { images?: unknown } | null)?.images;
  if (!Array.isArray(images) || images.length === 0) return 'Ajoutez au moins une photo';
  if (images.length > MAX_IMAGES) return `${MAX_IMAGES} photos maximum par analyse`;
  const out: ScanImage[] = [];
  for (const img of images as { mediaType?: unknown; data?: unknown }[]) {
    if (!MEDIA_TYPES.includes(img?.mediaType as ScanMediaType)) return 'Format de photo non pris en charge (JPEG, PNG, WebP)';
    if (typeof img.data !== 'string' || img.data.length < 16 || !BASE64.test(img.data)) return 'Photo illisible';
    const bytes = Math.floor((img.data.length * 3) / 4) - (img.data.endsWith('==') ? 2 : img.data.endsWith('=') ? 1 : 0);
    if (bytes > MAX_IMAGE_BYTES) return 'Photo trop lourde (5 Mo maximum)';
    out.push({ mediaType: img.mediaType as ScanMediaType, data: img.data });
  }
  return out;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Nettoie la sortie du modèle : noms bornés et capitalisés, catégories valides, doublons fusionnés. */
export function normalizeDetected(raw: unknown): DetectedFood[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: DetectedFood[] = [];
  for (const it of items as Partial<Record<keyof DetectedFood, unknown>>[]) {
    if (typeof it?.name !== 'string') continue;
    const name = it.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
    const key = fold(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: name[0]!.toUpperCase() + name.slice(1),
      category: SCAN_CATEGORIES.includes(it.category as ScanCategory) ? (it.category as ScanCategory) : 'Autre',
      confidence: it.confidence === 'high' || it.confidence === 'low' ? it.confidence : 'medium',
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** Appel Claude : images + consigne → JSON conforme à `OUTPUT_SCHEMA` (structured outputs). */
export async function detectFoods(client: ScanClient, images: ScanImage[]): Promise<ScanResult> {
  const response = await client.beta.messages.create({
    model: SCAN_MODEL,
    max_tokens: 16000,
    // Perception plus que raisonnement : effort bas = réponse rapide (quelques secondes) et peu coûteuse.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    // Si un classifieur de sécurité refuse (faux positif), l'API rejoue la requête sur un modèle de repli.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
          })),
          {
            type: 'text' as const,
            text: images.length > 1 ? `Voici ${images.length} photos. Liste les aliments.` : 'Liste les aliments de cette photo.',
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    return { status: 422, body: { error: "Cette photo n'a pas pu être analysée. Essayez avec une autre photo." } };
  }
  if (response.stop_reason === 'max_tokens') {
    return { status: 502, body: { error: 'Trop d’aliments sur ces photos : essayez avec moins de photos à la fois.' } };
  }
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 502, body: { error: 'Réponse inattendue du service de détection. Réessayez.' } };
  }
  return { status: 200, body: { items: normalizeDetected(parsed) } };
}

/** Point d'entrée commun : validation, appel, traduction des erreurs en messages lisibles. */
export async function handleScanRequest(body: unknown, client: ScanClient | null): Promise<ScanResult> {
  const images = parseScanInput(body);
  if (typeof images === 'string') return { status: 400, body: { error: images } };
  if (!client) {
    return { status: 503, body: { error: "La détection d'aliments n'est pas configurée (clé ANTHROPIC_API_KEY absente)." } };
  }
  try {
    return await detectFoods(client, images);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return { status: 429, body: { error: 'Service très sollicité : réessayez dans une minute.' } };
    }
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      return { status: 503, body: { error: "La détection d'aliments est mal configurée (clé API refusée)." } };
    }
    if (e instanceof Anthropic.BadRequestError) {
      return { status: 400, body: { error: 'Photo refusée par le service de détection. Essayez une autre photo.' } };
    }
    if (e instanceof Anthropic.APIError) {
      return { status: 502, body: { error: 'Le service de détection est indisponible. Réessayez dans un instant.' } };
    }
    throw e;
  }
}

/**
 * Limiteur en mémoire (fenêtre glissante) par utilisateur. Garde-fou contre l'emballement des coûts ;
 * en Edge Function, la mémoire est propre à chaque instance : c'est une borne, pas un quota exact.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** `true` si l'appel est autorisé (et le comptabilise). */
    take(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 5000) hits.delete(hits.keys().next().value!);
      return true;
    },
  };
}
