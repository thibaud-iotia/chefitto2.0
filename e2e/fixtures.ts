import { expect, test as base, type Page } from '@playwright/test';

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
  loggedIn: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };
