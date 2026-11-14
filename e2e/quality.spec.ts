import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const SCREENS = ['/home', '/fridge', '/planning', '/suggestions', '/add', '/profile'];

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
});
