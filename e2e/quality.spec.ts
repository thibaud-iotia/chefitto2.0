import AxeBuilder from '@axe-core/playwright';
import { PHOTO_ORIGIN, expect, photoUrl, test } from './fixtures';

const SCREENS = ['/home', '/fridge', '/planning', '/suggestions', '/add', '/add/import', '/profile'];

test.describe('accessibilité (axe, WCAG 2.1 AA)', () => {
  test('splash et auth', async ({ page }) => {
    await page.goto('./');
    let res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations, JSON.stringify(res.violations, null, 2)).toEqual([]);
    await page.getByRole('button', { name: 'Commencer' }).click();
    res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations, JSON.stringify(res.violations, null, 2)).toEqual([]);
  });

  for (const path of SCREENS) {
    test(`écran ${path}`, async ({ loggedIn: page }) => {
      await page.goto(`./#${path}`);
      await page.waitForTimeout(300);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(res.violations, JSON.stringify(res.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]), null, 2)).toEqual([]);
    });
  }
});

test.describe('PWA', () => {
  test('manifest, icône Apple et mode standalone', async ({ page, request }) => {
    await page.goto('./');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ display: 'standalone', lang: 'fr', short_name: 'Chefitto' });
    expect((await request.get('/apple-touch-icon.png')).ok()).toBe(true);
  });

  test('fonctionne hors-ligne après la première visite', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service worker testé sur Chromium');
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // la page est désormais contrôlée par le SW
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible();
    await context.setOffline(false);
  });

  test('les photos des recettes restent visibles hors-ligne', async ({ loggedIn: page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service worker testé sur Chromium');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // page contrôlée par le SW : les photos passent par son cache
    const img = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Mousse au chocolat' }) }).locator('[data-photo] img');
    const loaded = () => img.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0));
    await expect(img).toHaveAttribute('src', photoUrl('Mousse au chocolat'));
    await expect.poll(loaded).toBeGreaterThan(0);

    // Plus de serveur de photos ni de réseau : seule la copie en cache peut s'afficher.
    await context.unroute(`${PHOTO_ORIGIN}/**`);
    await context.setOffline(true);
    await page.reload();
    await expect(img).toHaveAttribute('src', photoUrl('Mousse au chocolat'));
    await expect.poll(loaded).toBeGreaterThan(0);
    await context.setOffline(false);
  });
});
