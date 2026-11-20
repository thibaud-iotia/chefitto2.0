import { expect, test as base, type Page } from '@playwright/test';

/** Origine fictive des photos de recettes servies par les tests (aucun réseau). */
export const PHOTO_ORIGIN = 'https://photos.chefitto.test';
export const photoUrl = (name: string) => `${PHOTO_ORIGIN}/${encodeURIComponent(name.toLowerCase())}.png`;

/**
 * Recherche automatique de photos simulée : `?q=<nom>` renvoie un résultat dont la photo est `photoUrl(nom)`,
 * et ces photos sont servies localement. Les photos sont routées sur le contexte pour intercepter aussi
 * les requêtes du service worker (cache des images) ; un `page.route` posé ensuite par un test reste prioritaire.
 */
export async function stubRecipePhotos(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith('/api/recipe-import') && url.searchParams.has('q'),
    (route) => {
      const q = new URL(route.request().url()).searchParams.get('q') ?? '';
      return route.fulfill({
        json: {
          page: 1,
          hasMore: false,
          results: [
            { url: 'https://www.marmiton.org/recettes/recette_photo.aspx', name: q, imageUrl: photoUrl(q), rating: null, reviews: null, category: null, source: 'marmiton.org' },
          ],
        },
      });
    },
  );
  await page.context().route(`${PHOTO_ORIGIN}/**`, (route) => route.fulfill({ path: 'public/icons/icon-192.png', contentType: 'image/png' }));
}

/**
 * Vidéos du mode cuisine : par défaut « non configurées » (503), comme sans clé YouTube. Les parcours n'appellent
 * jamais YouTube ni Claude, même si `.env.local` contient des clés. Routé sur le contexte : une fois le service worker
 * actif, la requête passe par lui et `page.route` ne la voit plus. Un `context().route` posé ensuite reste prioritaire.
 */
export async function stubStepVideos(page: Page) {
  await page.context().route('**/api/step-videos', (route) =>
    route.fulfill({ status: 503, json: { error: 'Les vidéos ne sont pas configurées (clé YOUTUBE_API_KEY absente).' } }),
  );
}

/** Connexion en mode démo (LocalRepository : aucun réseau). */
export async function login(page: Page, email = 'toto@cuisine.fr') {
  await page.goto('./');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill('secret1');
  await page.getByRole('button', { name: 'Me connecter' }).click();
  await expect(page.getByText('Que cuisine-t-on')).toBeVisible();
}

export const test = base.extend<{ loggedIn: Page }>({
  // Hors projet `live`, photos automatiques et vidéos simulées : les parcours ne dépendent ni de Marmiton ni de YouTube.
  page: async ({ page }, use, testInfo) => {
    if (testInfo.project.name !== 'live') {
      await stubRecipePhotos(page);
      await stubStepVideos(page);
    }
    await use(page);
  },
  loggedIn: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };
