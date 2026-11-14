import { useEffect, useState } from 'react';
import { ImportError, type RecipeImporter, type SearchResult } from '../data/recipeImport';

export const MIN_QUERY = 2;
export const DEBOUNCE_MS = 350;

interface Data {
  term: string;
  page: number;
  results: SearchResult[];
  hasMore: boolean;
}

interface Failure {
  term: string;
  page: number;
  nonce: number;
  message: string;
}

function merge(a: SearchResult[], b: SearchResult[]): SearchResult[] {
  const seen = new Set(a.map((r) => r.url));
  return [...a, ...b.filter((r) => !seen.has(r.url))];
}

/**
 * Recherche en ligne pendant la saisie : anti-rebond, annulation de la requête précédente,
 * pagination (« Plus de résultats ») et nouvel essai après erreur.
 * `term` est la requête normalisée, ou `''` pour désactiver la recherche.
 */
export function useRecipeSearch(importer: RecipeImporter, term: string) {
  const [debounced, setDebounced] = useState('');
  const [want, setWant] = useState({ term: '', page: 1 });
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<Data>({ term: '', page: 0, results: [], hasMore: false });
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), term.length >= MIN_QUERY ? DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [term]);

  const page = want.term === debounced ? want.page : 1;
  const active = debounced.length >= MIN_QUERY;

  useEffect(() => {
    if (!active) return;
    const ac = new AbortController();
    importer.search(debounced, page, ac.signal).then(
      (res) =>
        setData((prev) => ({
          term: debounced,
          page,
          results: page > 1 && prev.term === debounced ? merge(prev.results, res.results) : res.results,
          hasMore: res.hasMore,
        })),
      (e: unknown) => {
        if (ac.signal.aborted) return;
        setFailure({ term: debounced, page, nonce, message: e instanceof ImportError ? e.message : 'Recherche impossible pour le moment.' });
      },
    );
    return () => ac.abort();
  }, [importer, debounced, page, nonce, active]);

  const current = active && data.term === debounced ? data : null;
  const error = failure && failure.term === debounced && failure.page === page && failure.nonce === nonce ? failure.message : null;
  const typing = term !== debounced;
  const loading = term.length >= MIN_QUERY && !error && (typing || !current || current.page < page);

  return {
    results: term.length >= MIN_QUERY ? (current?.results ?? []) : [],
    loading,
    /** Chargement d'une page supplémentaire (les premiers résultats restent affichés). */
    loadingMore: loading && !typing && !!current && current.page < page,
    hasMore: !!current?.hasMore && !loading && !error,
    /** Une réponse est arrivée pour la saisie actuelle. */
    done: !!current && !loading,
    error,
    loadMore: () => {
      if (current) setWant({ term: debounced, page: current.page + 1 });
    },
    retry: () => setNonce((n) => n + 1),
  };
}
