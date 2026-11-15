import { describe, expect, it, vi } from 'vitest';
import {
  assertGeniusLyricsUrl,
  handleLyricsRequest,
  parseGeniusLyrics,
  parseGeniusSearch,
  parseLrclibSearch,
} from './lyricsScraper';

// Structure réelle d'une page Genius (classes générées, en-tête et pubs exclus), paroles fictives.
const GENIUS_PAGE = `<html><body>
<div data-lyrics-container="true" class="Lyrics__Container-sc-1 abc"><div data-exclude-from-selection="true" class="LyricsHeader"><button><span>12 Contributors</span></button><div><div>Traductions</div></div></div>[Couplet 1]<br/><a href="/1/x" class="ReferentFragment"><span>Première ligne annotée</span></a><br/>Deuxième ligne l&#x27;été<br/><i>Troisième</i> ligne</div>
<div data-lyrics-container="true" class="Lyrics__Container-sc-1 abc"></div>
<div data-exclude-from-selection="true" class="ad"><div id="div-gpt-ad"></div></div>
<div data-lyrics-container="true" class="Lyrics__Container-sc-1 abc">[Refrain]<br/>Oh oh&amp;nbsp;oh<br/><br/>Fin</div>
<div class="footer">Pas des paroles</div>
</body></html>`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('parseGeniusLyrics', () => {
  it('extrait et met en forme les paroles, sans en-tête ni pub', () => {
    expect(parseGeniusLyrics(GENIUS_PAGE)).toBe(
      "[Couplet 1]\nPremière ligne annotée\nDeuxième ligne l'été\nTroisième ligne\n\n[Refrain]\nOh oh&nbsp;oh\n\nFin",
    );
  });

  it('renvoie null sans bloc de paroles', () => {
    expect(parseGeniusLyrics('<div class="x">rien</div>')).toBeNull();
    expect(parseGeniusLyrics('<div data-lyrics-container="true"></div>')).toBeNull();
  });

  it('tolère un bloc non fermé', () => {
    expect(parseGeniusLyrics('<div data-lyrics-container="true">Ligne<div>')).toBeNull();
  });
});

describe('parseGeniusSearch', () => {
  it('garde les chansons https, sans doublon ni instrumental', () => {
    const song = (id: number, extra: object = {}) => ({
      result: {
        _type: 'song',
        id,
        title: `Titre ${id}`,
        artist_names: 'Artiste',
        url: `https://genius.com/Artiste-titre-${id}-lyrics`,
        song_art_image_thumbnail_url: 'https://images.genius.com/a.png',
        ...extra,
      },
    });
    const hits = parseGeniusSearch({
      response: {
        sections: [
          { hits: [song(1), song(1), song(2, { instrumental: true }), song(3, { url: 'http://x' }), { result: { _type: 'artist' } }] },
          { hits: [song(4, { artist_names: '', primary_artist: { name: 'Autre' }, song_art_image_thumbnail_url: null })] },
          'invalide',
        ],
      },
    });
    expect(hits.map((h) => h.id)).toEqual(['1', '4']);
    expect(hits[0]).toMatchObject({ source: 'genius', title: 'Titre 1', artist: 'Artiste', lyrics: null, imageUrl: 'https://images.genius.com/a.png' });
    expect(hits[1]).toMatchObject({ artist: 'Autre', imageUrl: null });
  });

  it('renvoie une liste vide sur une réponse inattendue', () => {
    expect(parseGeniusSearch(null)).toEqual([]);
    expect(parseGeniusSearch({ response: {} })).toEqual([]);
  });
});

describe('parseLrclibSearch', () => {
  it('garde les morceaux avec paroles', () => {
    const hits = parseLrclibSearch([
      { id: 1, trackName: 'A', artistName: 'X', albumName: 'Alb', plainLyrics: 'la la\nla', syncedLyrics: '[00:01.00] la' },
      { id: 2, trackName: 'B', artistName: 'X', instrumental: true, plainLyrics: null },
      { id: 3, name: 'C', artistName: 'Y', plainLyrics: '  ' },
      { id: 4, name: 'D', artistName: 'Y', albumName: '', plainLyrics: 'ok', syncedLyrics: null },
      'invalide',
    ]);
    expect(hits).toEqual([
      { source: 'lrclib', id: '1', title: 'A', artist: 'X', album: 'Alb', imageUrl: null, url: null, lyrics: 'la la\nla', synced: true },
      { source: 'lrclib', id: '4', title: 'D', artist: 'Y', album: null, imageUrl: null, url: null, lyrics: 'ok', synced: false },
    ]);
    expect(parseLrclibSearch({})).toEqual([]);
  });
});

describe('assertGeniusLyricsUrl', () => {
  it('accepte seulement les pages de paroles genius.com', () => {
    expect(assertGeniusLyricsUrl('https://genius.com/Stromae-papaoutai-lyrics?x=1#y')).toBe('https://genius.com/Stromae-papaoutai-lyrics');
    for (const bad of ['pas un lien', 'http://genius.com/a-lyrics', 'https://evil.com/a-lyrics', 'https://genius.com/artists/Stromae', 'https://genius.com.evil.com/a-lyrics']) {
      expect(() => assertGeniusLyricsUrl(bad)).toThrow();
    }
  });
});

describe('handleLyricsRequest', () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);

  it('valide les paramètres', async () => {
    expect((await handleLyricsRequest(params({ q: 'abc' }))).status).toBe(400);
    expect((await handleLyricsRequest(params({ source: 'genius', q: 'a' }))).status).toBe(400);
    expect((await handleLyricsRequest(params({ source: 'genius', q: 'x'.repeat(121) }))).status).toBe(400);
    expect((await handleLyricsRequest(params({ source: 'lrclib', url: 'https://genius.com/a-lyrics' }))).status).toBe(400);
    expect((await handleLyricsRequest(params({ source: 'genius', url: 'https://evil.com/a-lyrics' }))).status).toBe(400);
  });

  it('recherche sur LRCLIB', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: 7, trackName: 'T', artistName: 'A', plainLyrics: 'p' }]));
    const r = await handleLyricsRequest(params({ source: 'lrclib', q: 'stromae  papaoutai' }), { fetchImpl });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ hits: [{ id: '7', lyrics: 'p' }] });
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe('https://lrclib.net/api/search?q=stromae+papaoutai');
  });

  it('recherche sur Genius puis lit les paroles', async () => {
    const search = vi.fn(async () =>
      jsonResponse({ response: { sections: [{ hits: [{ result: { _type: 'song', id: 1, title: 'T', url: 'https://genius.com/A-t-lyrics' } }] }] } }),
    );
    const s = await handleLyricsRequest(params({ source: 'genius', q: 'a t' }), { fetchImpl: search });
    expect(s.body).toMatchObject({ hits: [{ url: 'https://genius.com/A-t-lyrics' }] });

    const page = vi.fn(async () => new Response(GENIUS_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    const l = await handleLyricsRequest(params({ source: 'genius', url: 'https://genius.com/A-t-lyrics' }), { fetchImpl: page });
    expect(l.status).toBe(200);
    expect(l.body).toMatchObject({ url: 'https://genius.com/A-t-lyrics', lyrics: expect.stringContaining('[Refrain]') });
  });

  it('remonte les erreurs du site source', async () => {
    const blocked = await handleLyricsRequest(params({ source: 'genius', q: 'abc' }), { fetchImpl: async () => jsonResponse({}, 403) });
    expect(blocked).toEqual({ status: 502, body: { error: 'Le site source a répondu 403' } });

    const down = await handleLyricsRequest(params({ source: 'lrclib', q: 'abc' }), {
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    expect(down.status).toBe(502);

    const notJson = await handleLyricsRequest(params({ source: 'lrclib', q: 'abc' }), { fetchImpl: async () => new Response('<html>') });
    expect(notJson.body).toEqual({ error: 'Réponse illisible du site source' });

    const slow = await handleLyricsRequest(params({ source: 'lrclib', q: 'abc' }), {
      timeoutMs: 5,
      fetchImpl: (_u, init) =>
        new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))),
    });
    expect(slow.status).toBe(504);

    const empty = await handleLyricsRequest(params({ source: 'genius', url: 'https://genius.com/A-t-lyrics' }), {
      fetchImpl: async () => new Response('<div>rien</div>', { headers: { 'Content-Type': 'text/html' } }),
    });
    expect(empty).toEqual({ status: 422, body: { error: 'Aucune parole trouvée sur cette page' } });
  });
});
