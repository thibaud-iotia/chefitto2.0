import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Import sur de VRAIES données : Marmiton et 750g sont interrogés en direct par le middleware
 * `/api/recipe-import` (même code que la Supabase Edge Function).
 * Lancer : `npm run e2e:live`. Échec ici = site injoignable ou balisage modifié → voir recipeScraper.ts.
 */

const MARMITON_RECIPE = 'https://www.marmiton.org/recettes/recette_risotto-au-chorizo_17724.aspx';
const RECIPE_750G = 'https://www.750g.com/pate-a-crepes-r17175.htm';
const NET = { timeout: 25_000 };

async function openImport(page: Page) {
  await page.getByRole('button', { name: 'Ajouter une recette' }).click();
  await page.getByRole('link', { name: /Importer une recette/ }).click();
  await expect(page.getByRole('heading', { name: 'Importer une recette' })).toBeVisible();
}

async function lines(page: Page, label: string): Promise<string[]> {
  return (await page.getByLabel(label).inputValue()).split('\n').filter(Boolean);
}

test.describe('import en ligne — données réelles', () => {
  test('recherche Marmiton pendant la saisie, import, enregistrement et fiche', async ({ loggedIn: page }) => {
    await openImport(page);
    await page.getByRole('searchbox').pressSequentially('risotto', { delay: 40 });

    const results = page.getByRole('list', { name: 'Résultats Marmiton' }).getByRole('button');
    await expect(results.first()).toBeVisible(NET);
    expect(await results.count()).toBeGreaterThanOrEqual(5);
    const names = await results.allInnerTexts();
    expect(names.filter((n) => /risotto/i.test(n)).length).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole('list', { name: 'Résultats Marmiton' }).locator('img').first()).toHaveAttribute('src', /^https:\/\//);

    await results.first().click();
    await expect(page.getByText('Recette importée')).toBeVisible(NET);
    const name = await page.getByLabel('Nom du plat').inputValue();
    expect(name).toMatch(/risotto/i);
    expect((await lines(page, 'Ingrédients')).length).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole('textbox', { name: 'Étape 1', exact: true })).not.toHaveValue('');
    await expect(page.getByRole('link', { name: 'marmiton.org' })).toHaveAttribute('href', /^https:\/\/www\.marmiton\.org\/recettes\/recette_/);

    await page.getByRole('button', { name: 'Ajouter la recette' }).click();
    await expect(page.getByText('Recette ajoutée')).toBeVisible();
    await page.getByRole('link', { name, exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText(/Source : marmiton\.org/)).toBeVisible();
    await expect(page.locator('dt:text("Temps") + dd')).toHaveText(/^\d+ min$/);
    // La photo de la page importée est conservée.
    await expect(page.locator('[data-photo] img')).toHaveAttribute('src', /^https:\/\//);
  });

  test('les recettes de départ reçoivent une vraie photo, qui se charge', async ({ loggedIn: page }) => {
    const img = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Mousse au chocolat' }) }).locator('[data-photo] img');
    await expect(img).toHaveAttribute('src', /^https:\/\/assets\.afcdn\.com\/recipe\/.+_w180h180c1/, NET);
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0)), NET).toBeGreaterThan(0);
  });

  test('« Plus de résultats » charge la page suivante', async ({ loggedIn: page }) => {
    await openImport(page);
    await page.getByRole('searchbox').fill('tarte aux pommes');
    const results = page.getByRole('list', { name: 'Résultats Marmiton' }).getByRole('button');
    await expect(results.first()).toBeVisible(NET);
    const before = await results.count();
    await page.getByRole('button', { name: 'Plus de résultats' }).click();
    await expect.poll(() => results.count(), NET).toBeGreaterThan(before);
  });

  test('lien Marmiton collé : fiche complète', async ({ loggedIn: page }) => {
    await openImport(page);
    await page.getByRole('searchbox').fill(MARMITON_RECIPE);
    await page.getByRole('button', { name: /Importer depuis marmiton\.org/ }).click();
    await expect(page.getByText('Recette importée')).toBeVisible(NET);
    await expect(page.getByLabel('Nom du plat')).toHaveValue(/Risotto au chorizo/i);
    expect(await lines(page, 'Ingrédients')).toEqual(expect.arrayContaining([expect.stringMatching(/riz/i), expect.stringMatching(/chorizo/i)]));
    await expect(page.getByRole('textbox', { name: 'Étape 3', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plats' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Description')).toHaveValue(/Source : marmiton\.org/);

    await page.getByRole('button', { name: 'Ajouter la recette' }).click();
    await page.getByRole('tab', { name: 'Plats' }).click();
    await page.getByRole('link', { name: /Risotto au chorizo/i }).first().click();
    await expect(page.locator('dt:text("Temps") + dd')).toHaveText(/^\d+ min$/);
    await expect(page.getByRole('heading', { name: 'Ingrédients' })).toBeVisible();
  });

  test('lien d’un autre site (750g, JSON-LD schema.org)', async ({ loggedIn: page }) => {
    await openImport(page);
    await page.getByRole('searchbox').fill(RECIPE_750G);
    await page.getByRole('searchbox').press('Enter');
    await expect(page.getByText('Recette importée')).toBeVisible(NET);
    await expect(page.getByLabel('Nom du plat')).toHaveValue(/crêpe/i);
    expect(await lines(page, 'Ingrédients')).toEqual(expect.arrayContaining([expect.stringMatching(/farine/i), expect.stringMatching(/lait/i)]));
    await expect(page.getByRole('button', { name: 'Desserts' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: '750g.com' })).toBeVisible();
  });

  test('page sans recette : message clair, on reste sur l’écran', async ({ loggedIn: page }) => {
    await openImport(page);
    await page.getByRole('searchbox').fill('https://www.marmiton.org/');
    await page.getByRole('button', { name: /Importer depuis marmiton\.org/ }).click();
    await expect(page.getByText('Aucune recette trouvée sur cette page')).toBeVisible(NET);
    await expect(page.getByRole('heading', { name: 'Importer une recette' })).toBeVisible();
  });

  test('accessibilité de l’écran avec résultats réels', async ({ loggedIn: page }) => {
    await openImport(page);
    await page.getByRole('searchbox').fill('gratin dauphinois');
    await expect(page.getByRole('list', { name: 'Résultats Marmiton' }).getByRole('button').first()).toBeVisible(NET);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations, JSON.stringify(res.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]), null, 2)).toEqual([]);
  });
});

test.describe('API /api/recipe-import — données réelles', () => {
  test('contrat de la recherche et de l’import', async ({ request }) => {
    const search = await request.get('/api/recipe-import?q=quiche%20lorraine');
    expect(search.status()).toBe(200);
    const page = (await search.json()) as { results: { url: string; name: string }[]; hasMore: boolean };
    expect(page.results.length).toBeGreaterThan(3);
    for (const r of page.results) expect(r.url).toMatch(/^https:\/\/www\.marmiton\.org\/recettes\/recette_.+\.aspx$/);

    const imported = await request.get(`/api/recipe-import?url=${encodeURIComponent(page.results[0]!.url)}`);
    expect(imported.status()).toBe(200);
    const { recipe } = (await imported.json()) as { recipe: Record<string, unknown> };
    expect(recipe).toMatchObject({ sourceName: 'marmiton.org', category: expect.stringMatching(/^(Entrées|Plats|Desserts|Boissons)$/) });
    expect((recipe.ingredients as string[]).length).toBeGreaterThan(1);
    expect((recipe.steps as string[]).length).toBeGreaterThan(0);
    expect(recipe.timeMin).toBeGreaterThan(0);
  });

  test('refuse les liens vers le réseau local (SSRF)', async ({ request }) => {
    for (const url of ['http://127.0.0.1:4173/', 'http://localhost:4173/', 'http://169.254.169.254/latest/meta-data/']) {
      const res = await request.get(`/api/recipe-import?url=${encodeURIComponent(url)}`);
      expect(res.status(), url).toBe(400);
    }
  });
});
