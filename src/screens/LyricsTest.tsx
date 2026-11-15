import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBack } from '../components/hooks';
import { ChevronLeft, Search } from '../components/icons';
import type { LyricsHit, LyricsSource } from '../../supabase/functions/_shared/lyricsScraper.ts';
import type { LyricsOutcome } from '../data/lyrics';
import { useApp } from '../store/storeContext';
import { Button, IconButton } from '../ui';
import s from './screens.module.css';

/**
 * Page de test `#/test` : compare le scraping Genius et l'API LRCLIB.
 * Mode local : middleware Vite `/api/lyrics`. Mode Supabase : Edge Function `lyrics` (utilisateur connecté).
 */

const SOURCES: { id: LyricsSource; label: string }[] = [
  { id: 'genius', label: 'Genius (scraping)' },
  { id: 'lrclib', label: 'LRCLIB (API)' },
];

type Outcome<T> = LyricsOutcome<T>;

interface Selected {
  hit: LyricsHit;
  outcome: Outcome<{ lyrics: string }> | null;
}

export default function LyricsTest() {
  const back = useBack('/home');
  const api = useApp((st) => st.lyrics);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Partial<Record<LyricsSource, Outcome<{ hits: LyricsHit[] }> | 'loading'>>>({});
  const [selected, setSelected] = useState<Selected | null>(null);
  // Recherche et lecture des paroles annulables séparément.
  const searchAbort = useRef<AbortController | null>(null);
  const lyricsAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      searchAbort.current?.abort();
      lyricsAbort.current?.abort();
    },
    [],
  );

  function renew(ref: { current: AbortController | null }): AbortSignal {
    ref.current?.abort();
    ref.current = new AbortController();
    return ref.current.signal;
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.replace(/\s+/g, ' ').trim();
    if (term.length < 2) return;
    const signal = renew(searchAbort);
    lyricsAbort.current?.abort();
    setSelected(null);
    setResults({ genius: 'loading', lrclib: 'loading' });
    for (const { id } of SOURCES) {
      api.call<{ hits: LyricsHit[] }>({ source: id, q: term }, signal)
        .then((r) => setResults((prev) => ({ ...prev, [id]: r })))
        .catch(() => undefined);
    }
  }

  function open(hit: LyricsHit) {
    if (hit.lyrics !== null) {
      setSelected({ hit, outcome: { ok: true, data: { lyrics: hit.lyrics }, ms: 0 } });
      return;
    }
    setSelected({ hit, outcome: null });
    api.call<{ lyrics: string }>({ source: 'genius', url: hit.url ?? '' }, renew(lyricsAbort))
      .then((outcome) => setSelected((cur) => (cur?.hit === hit ? { hit, outcome } : cur)))
      .catch(() => undefined);
  }

  if (selected) {
    const { hit, outcome } = selected;
    return (
      <main className={s.page}>
        <IconButton label="Retour aux résultats" onClick={() => setSelected(null)}>
          <ChevronLeft />
        </IconButton>
        <h1 className={s.title}>{hit.title}</h1>
        <p className={s.importLead}>
          {hit.artist} · {hit.source === 'genius' ? 'Genius' : 'LRCLIB'}
          {hit.synced ? ' · synchronisées dispo' : ''}
          {outcome && hit.source === 'genius' ? ` · page lue en ${outcome.ms} ms` : ''}
        </p>
        {!outcome && <p className={s.empty}>Récupération des paroles…</p>}
        {outcome && !outcome.ok && (
          <div className={s.importError} role="alert">
            <span>{outcome.error}</span>
            <Button variant="outline" size="sm" onClick={() => open(hit)}>
              Réessayer
            </Button>
          </div>
        )}
        {outcome?.ok && (
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.55, margin: 0 }}>
            {outcome.data.lyrics}
          </pre>
        )}
      </main>
    );
  }

  return (
    <main className={s.page}>
      <IconButton label="Retour" onClick={back}>
        <ChevronLeft />
      </IconButton>
      <h1 className={s.title}>Test paroles</h1>
      <p className={s.importLead}>Même recherche envoyée à Genius (scraping de la page) et à LRCLIB (API publique).</p>
      <p className={s.webMeta}>Via : {api.target}</p>
      <form onSubmit={onSearch} role="search">
        <label className={s.searchBox}>
          <Search />
          <span className="sr-only">Artiste et titre</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Stromae papaoutai…"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
      </form>

      {SOURCES.map(({ id, label }) => {
        const r = results[id];
        if (!r) return null;
        return (
          <section key={id} className={s.importSection} aria-labelledby={`lyrics-${id}`} aria-busy={r === 'loading'}>
            <h2 id={`lyrics-${id}`} className={s.sectionLabel}>
              {label}
              {r !== 'loading' && ` · ${r.ok ? `${r.data.hits.length} résultat(s)` : 'échec'} · ${r.ms} ms`}
            </h2>
            {r === 'loading' && <p className={s.empty}>Recherche…</p>}
            {r !== 'loading' && !r.ok && (
              <div className={s.importError} role="alert">
                <span>{r.error}</span>
              </div>
            )}
            {r !== 'loading' && r.ok && r.data.hits.length === 0 && <p className={s.empty}>Aucun résultat.</p>}
            {r !== 'loading' && r.ok && r.data.hits.length > 0 && (
              <ul className={s.list}>
                {r.data.hits.map((hit) => (
                  <li key={`${hit.source}-${hit.id}`}>
                    <button type="button" className={`${s.card} ${s.clickable} ${s.webItem}`} onClick={() => open(hit)}>
                      {hit.imageUrl ? (
                        <img className={s.webThumb} src={hit.imageUrl} alt="" width={64} height={64} loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <span className={s.webThumb} aria-hidden="true" />
                      )}
                      <span className={s.webBody}>
                        <span className={s.sugName}>{hit.title}</span>
                        <span className={s.webMeta}>{[hit.artist, hit.album, hit.synced ? 'synchro' : ''].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
