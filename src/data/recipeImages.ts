import { imageQueries, safeImageUrl } from '../domain/images';
import { normalize } from '../domain/logic';
import type { Recipe } from '../domain/types';
import type { RecipeImporter, SearchPage } from './recipeImport';

/**
 * Trouve automatiquement une photo pour une recette qui n'en a pas (recettes de départ, saisies à la main),
 * en cherchant son nom sur Marmiton via le proxy d'import déjà en place.
 */
export interface ImageFinder {
  /**
   * Première photo trouvée, hors URL `exclude` (images cassées), ou `null` si aucune.
   * Rejette en cas d'erreur passagère (hors ligne, service indisponible) : rien n'est alors mis en cache,
   * un nouvel essai pourra aboutir.
   */
  find(recipe: Pick<Recipe, 'name' | 'ingredients'>, exclude?: ReadonlySet<string>): Promise<string | null>;
}

export interface ImageFinderOptions {
  /** Recherches simultanées maximum : au premier chargement, 8 recettes demandent une photo d'un coup. */
  concurrency?: number;
}

/** Ne cherche rien (tests, environnements sans import en ligne). */
export const noImageFinder: ImageFinder = { find: async () => null };

export function createImageFinder(importer: RecipeImporter, { concurrency = 2 }: ImageFinderOptions = {}): ImageFinder {
  /** Résultats par requête normalisée (la promesse est partagée : deux cartes identiques = une requête). */
  const searches = new Map<string, Promise<string[]>>();
  const queue: (() => void)[] = [];
  let running = 0;

  async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (running >= concurrency) await new Promise<void>((resolve) => queue.push(resolve));
    running++;
    try {
      return await task();
    } finally {
      running--;
      queue.shift()?.();
    }
  }

  function imagesFor(query: string): Promise<string[]> {
    const key = normalize(query);
    let p = searches.get(key);
    if (!p) {
      p = limited(() => importer.search(query, 1)).then((page: SearchPage) =>
        page.results.map((r) => safeImageUrl(r.imageUrl)).filter((u): u is string => u !== null),
      );
      // Erreur passagère : on oublie la requête pour pouvoir réessayer plus tard.
      p.catch(() => searches.delete(key));
      searches.set(key, p);
    }
    return p;
  }

  return {
    async find(recipe, exclude) {
      for (const query of imageQueries(recipe)) {
        const found = (await imagesFor(query)).find((u) => !exclude?.has(u));
        if (found) return found;
      }
      return null;
    },
  };
}
