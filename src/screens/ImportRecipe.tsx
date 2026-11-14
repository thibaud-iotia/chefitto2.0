import { useEffect, useRef, useState } from 'react';
import { useBack } from '../components/hooks';
import { ChevronLeft, Download, Search } from '../components/icons';
import { asRecipeUrl, ImportError, type SearchResult } from '../data/recipeImport';
import { formatTime, normalize } from '../domain/logic';
import { IMPORT_TEMPLATES } from '../domain/seed';
import { useApp } from '../store/storeContext';
import { Button, IconButton } from '../ui';
import { useRecipeForm } from './formStore';
import s from './screens.module.css';
import { MIN_QUERY, useRecipeSearch } from './useRecipeSearch';

function resultMeta(r: SearchResult): string {
  return [
    r.rating !== null ? `★ ${r.rating.toFixed(1).replace('.', ',')}` : '',
    r.reviews !== null ? `${r.reviews} avis` : '',
    r.category ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function ImportRecipe() {
  const back = useBack('/add');
  const flash = useApp((st) => st.flash);
  const importer = useApp((st) => st.importer);
  const importTemplate = useRecipeForm((st) => st.importTemplate);
  const importRecipe = useRecipeForm((st) => st.importRecipe);
  const [q, setQ] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const link = asRecipeUrl(q);
  const term = link ? '' : q.replace(/\s+/g, ' ').trim();
  const search = useRecipeSearch(importer, term);
  const templates = link ? [] : IMPORT_TEMPLATES.filter((t) => !term || normalize(t.name).includes(normalize(term)));
  const online = term.length >= MIN_QUERY;

  async function importFrom(url: string) {
    if (importing) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setImporting(url);
    try {
      const recipe = await importer.fetchRecipe(url, ac.signal);
      importRecipe(recipe);
      back();
      flash('Recette importée');
    } catch (e) {
      if (ac.signal.aborted) return;
      setImporting(null);
      flash(e instanceof ImportError ? e.message : 'Import impossible');
    }
  }

  const status = importing
    ? 'Import de la recette en cours…'
    : search.loading
      ? 'Recherche en cours…'
      : search.done
        ? `${search.results.length} recette(s) trouvée(s) sur Marmiton`
        : '';

  return (
    <main className={s.page}>
      <IconButton label="Retour" onClick={back}>
        <ChevronLeft />
      </IconButton>
      <h1 className={s.title}>Importer une recette</h1>
      <p className={s.importLead}>Cherchez sur Marmiton, ou collez le lien d'une recette de n'importe quel site.</p>
      <label className={s.searchBox}>
        <Search />
        <span className="sr-only">Rechercher une recette ou coller un lien</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Risotto, crêpes… ou un lien"
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && link) void importFrom(link);
          }}
        />
      </label>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {link && (
        <button
          type="button"
          className={`${s.card} ${s.clickable} ${s.webItem}`}
          onClick={() => void importFrom(link)}
          disabled={!!importing}
          aria-busy={importing === link}
        >
          <span className={s.importIcon} aria-hidden="true">
            <Download />
          </span>
          <span className={s.webBody}>
            <span className={s.sugName}>Importer depuis {new URL(link).hostname.replace(/^www\./, '')}</span>
            <span className={s.webMeta}>{link}</span>
          </span>
          {importing === link ? <span className={s.spinner} aria-hidden="true" /> : <span aria-hidden="true">›</span>}
        </button>
      )}

      {templates.length > 0 && (
        <section className={s.importSection} aria-labelledby="import-templates">
          <h2 id="import-templates" className={s.sectionLabel}>
            {term ? 'Modèles' : 'Idées rapides'}
          </h2>
          <ul className={s.list}>
            {templates.map((t) => (
              <li key={t.name}>
                <button
                  type="button"
                  className={`${s.card} ${s.clickable} ${s.importItem}`}
                  disabled={!!importing}
                  onClick={() => {
                    importTemplate(t);
                    back();
                    flash('Recette importée');
                  }}
                >
                  <span className={s.sugName}>{t.name}</span>
                  <span className={s.mono} style={{ fontSize: 13, color: 'var(--gray-600)' }}>
                    {formatTime(t.timeMin)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {online && (
        <section className={s.importSection} aria-labelledby="import-web" aria-busy={search.loading}>
          <h2 id="import-web" className={s.sectionLabel}>
            Sur Marmiton
          </h2>
          {search.error && (
            <div className={s.importError} role="alert">
              <span>{search.error}</span>
              <Button variant="outline" size="sm" onClick={search.retry}>
                Réessayer
              </Button>
            </div>
          )}
          <ul className={s.list} aria-label="Résultats Marmiton">
            {search.results.map((r) => (
              <li key={r.url}>
                <button
                  type="button"
                  className={`${s.card} ${s.clickable} ${s.webItem}`}
                  onClick={() => void importFrom(r.url)}
                  disabled={!!importing}
                  aria-busy={importing === r.url}
                >
                  {r.imageUrl ? (
                    <img className={s.webThumb} src={r.imageUrl} alt="" width={64} height={64} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  ) : (
                    <span className={s.webThumb} aria-hidden="true" />
                  )}
                  <span className={s.webBody}>
                    <span className={s.sugName}>{r.name}</span>
                    <span className={s.webMeta}>{resultMeta(r)}</span>
                  </span>
                  {importing === r.url ? <span className={s.spinner} aria-hidden="true" /> : <span aria-hidden="true">›</span>}
                </button>
              </li>
            ))}
            {search.loading &&
              Array.from({ length: search.loadingMore ? 1 : 3 }, (_, i) => (
                <li key={`sk${i}`} className={`${s.card} ${s.webItem} ${s.skeleton}`} aria-hidden="true">
                  <span className={s.webThumb} />
                  <span className={s.webBody}>
                    <span className={s.skLine} />
                    <span className={s.skLine} style={{ width: '45%' }} />
                  </span>
                </li>
              ))}
          </ul>
          {search.done && !search.error && search.results.length === 0 && (
            <p className={s.empty}>Aucune recette trouvée sur Marmiton pour « {term} ».</p>
          )}
          {search.hasMore && (
            <Button variant="outline" block onClick={search.loadMore}>
              Plus de résultats
            </Button>
          )}
        </section>
      )}

      {!link && term.length > 0 && !online && templates.length === 0 && (
        <p className={s.empty}>Tapez au moins {MIN_QUERY} lettres pour chercher sur Marmiton.</p>
      )}
    </main>
  );
}
