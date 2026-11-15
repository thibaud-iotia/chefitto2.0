import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import type { Plugin } from 'vite';
import { handleScanRequest, MAX_BODY_BYTES, type ScanClient } from './supabase/functions/_shared/fridgeScan.ts';

export const FRIDGE_SCAN_PATH = '/api/fridge-scan';

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Sert `/api/fridge-scan` en dev et en preview (mode local) avec le même code que l'Edge Function.
 * Clé : `ANTHROPIC_API_KEY` dans `.env.local` (jamais préfixée `VITE_` : elle finirait dans le bundle),
 * à défaut le profil `ant auth login`. Sans identifiants : 503 lisible côté app.
 */
export function fridgeScanApi(apiKey?: string): Plugin {
  let client: ScanClient | null | undefined;
  const getClient = (): ScanClient | null => {
    if (client === undefined) {
      try {
        client = new Anthropic({ ...(apiKey ? { apiKey } : {}), timeout: 90_000, maxRetries: 1 });
      } catch {
        client = null;
      }
    }
    return client;
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.endsWith(FRIDGE_SCAN_PATH)) return next();
    if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée' });
    try {
      const raw = await readBody(req);
      if (raw === null) return send(res, 413, { error: 'Photos trop lourdes' });
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        /* corps invalide : handleScanRequest renvoie 400 */
      }
      const { status, body: out } = await handleScanRequest(body, getClient());
      send(res, status, out);
    } catch (e) {
      console.error('[fridge-scan]', e);
      send(res, 500, { error: 'Erreur inattendue pendant l’analyse' });
    }
  };

  return {
    name: 'chefitto:fridge-scan-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
  };
}
