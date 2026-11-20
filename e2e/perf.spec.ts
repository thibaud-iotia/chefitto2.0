import type { Page } from '@playwright/test';
import { bigFridge, bigRecipes } from '../src/test/bigData';
import { expect, login, test } from './fixtures';

/**
 * Réactivité en navigateur réel, sur un gros compte (300 recettes, 40 aliments) et un CPU ralenti ×4
 * (téléphone d'entrée de gamme). Mesure la durée des interactions via l'Event Timing API, la même que
 * l'INP de Chrome : de l'appui jusqu'à l'image suivante affichée. Seuil = 200 ms, limite « bon » de l'INP.
 *
 * Projet `perf` séparé, lancé seul (`npm run e2e:perf`, 1 worker) : en parallèle d'autres tests, la machine
 * chargée fausserait les durées.
 */
const INP_GOOD_MS = 200;
const CPU_SLOWDOWN = 4;

/** Remplace les données du compte de démo par un gros jeu, puis recharge (la session est conservée). */
async function seedBigAccount(page: Page) {
  await login(page);
  const data = { recipes: bigRecipes(300), fridge: bigFridge(40) };
  await page.evaluate((d) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('chefitto:v1:data:'))!;
    const stored = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...stored, ...d, favorites: [], plan: {} }));
  }, data);
  await page.reload();
  await expect(page.getByText('Que cuisine-t-on')).toBeVisible();
}

/** Enregistre la durée de chaque interaction (clavier, pointeur) à partir de maintenant. */
async function startMeasuring(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __events: { name: string; duration: number }[] };
    w.__events = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEventTiming[])
        if (e.interactionId) w.__events.push({ name: e.name, duration: e.duration });
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  });
}

/** Interaction la plus lente depuis `startMeasuring` (ms), après que le navigateur a tout rapporté. */
async function slowestInteraction(page: Page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100))));
  const events = await page.evaluate(() => (window as unknown as { __events: { name: string; duration: number }[] }).__events);
  return Math.max(0, ...events.map((e) => e.duration));
}

function report(ms: number) {
  const description = `${Math.round(ms)} ms (seuil ${INP_GOOD_MS} ms, CPU ×${CPU_SLOWDOWN})`;
  test.info().annotations.push({ type: 'interaction la plus lente', description });
  console.log(`${test.info().title} → interaction la plus lente : ${description}`);
}

test.beforeEach(async ({ page }) => {
  // Photos des recettes de test : servies localement, aucune recherche automatique.
  await page.context().route('https://img.chefitto.test/**', (route) => route.fulfill({ path: 'public/icons/icon-192.png', contentType: 'image/png' }));
  await seedBigAccount(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
});

test('accueil : recherche, filtres et favoris restent réactifs avec 300 recettes', async ({ page }) => {
  await startMeasuring(page);
  const search = page.getByRole('searchbox');
  await search.pressSequentially('tomate', { delay: 80 });
  await expect(page.getByRole('list', { name: 'Recettes' }).getByRole('listitem').first()).toContainText(/tomate/i);
  await search.fill('');
  await page.getByRole('tab', { name: 'Plats' }).click();
  await page.getByRole('tab', { name: 'Tout' }).click();
  const fav = page.getByRole('button', { name: /^Ajouter Recette n°1 .* aux favoris$/ });
  await fav.click();
  await expect(page.getByRole('button', { name: /^Retirer Recette n°1 .* des favoris$/ })).toBeVisible();

  const slowest = await slowestInteraction(page);
  report(slowest);
  expect(slowest).toBeLessThan(INP_GOOD_MS);
});

test('frigo : saisie et ajout réactifs', async ({ page }) => {
  await page.getByRole('link', { name: 'Frigo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mon frigo' })).toBeVisible();
  await startMeasuring(page);
  await page.getByLabel('Nouvel aliment').pressSequentially('Topinambour', { delay: 80 });
  await page.getByRole('button', { name: 'Ajouter au frigo' }).click();
  await expect(page.getByRole('button', { name: 'Retirer Topinambour' })).toBeVisible();

  const slowest = await slowestInteraction(page);
  report(slowest);
  expect(slowest).toBeLessThan(INP_GOOD_MS);
});
