import { expect, test } from './fixtures';

test('parcours complet : recette → planning → mode cuisine', async ({ loggedIn: page }) => {
  await page.getByRole('link', { name: 'Veggie tomato mix' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Veggie tomato mix' })).toBeVisible();
  await expect(page.getByText('4/5 au frigo')).toBeVisible();

  await page.getByRole('button', { name: 'Planifier' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Mercredi · Midi/ }).click();
  await expect(page.getByText('Ajouté au planning')).toBeVisible();

  await page.getByRole('button', { name: 'Commencer à cuisiner' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Étape suivante' }).click();
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByText('Bon appétit !')).toBeVisible();

  await page.getByRole('link', { name: 'Planning', exact: true }).click();
  await page.getByRole('tab', { name: 'Mercredi' }).click();
  await expect(page.getByTestId('slot-0')).toContainText('Veggie tomato mix');
  await expect(page.getByText('1 repas sur 14')).toBeVisible();
});

test('le frigo pilote les suggestions et persiste après rechargement', async ({ loggedIn: page }) => {
  await page.getByRole('link', { name: 'Frigo', exact: true }).click();
  await page.getByRole('button', { name: 'Poisson' }).click();
  await page.getByLabel('Nouvel aliment').fill('espadon');
  await page.getByRole('button', { name: 'Ajouter au frigo' }).click();
  await page.getByLabel('Nouvel aliment').fill('asperge');
  await page.getByRole('button', { name: 'Légume' }).click();
  await page.getByRole('button', { name: 'Ajouter au frigo' }).click();
  await expect(page.getByRole('region', { name: 'Poisson' })).toContainText('Espadon');

  await page.reload();
  await expect(page.getByRole('region', { name: 'Poisson' })).toContainText('Espadon');

  await page.getByRole('button', { name: 'Voir mes suggestions' }).click();
  const espadon = page.getByRole('link', { name: /Espadon grillé/ });
  await expect(espadon).toContainText('4/4 ingrédients');
});

test('créer une recette depuis un modèle importé', async ({ loggedIn: page }) => {
  await page.getByRole('button', { name: 'Ajouter une recette' }).click();
  await page.getByRole('link', { name: /Importer une recette/ }).click();
  await page.getByRole('button', { name: /Lasagnes/ }).click();
  await expect(page.getByLabel('Nom du plat')).toHaveValue('Lasagnes');
  await page.getByLabel('Nom du plat').fill('Lasagnes de mamie');
  await page.getByRole('button', { name: 'Ajouter la recette' }).click();
  await expect(page.getByText('Recette ajoutée')).toBeVisible();

  await page.getByRole('tab', { name: 'Plats' }).click();
  await page.getByRole('link', { name: 'Lasagnes de mamie' }).click();
  await expect(page.getByText('Boeuf haché')).toBeVisible();
});

test('favoris et déconnexion / reconnexion', async ({ loggedIn: page }) => {
  await page.getByRole('button', { name: 'Ajouter Mousse au chocolat aux favoris' }).click();
  await page.getByRole('tab', { name: /Favoris/ }).click();
  await expect(page.getByRole('list', { name: 'Recettes' }).getByRole('listitem')).toHaveCount(1);

  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  // Le splash a déjà été vu : retour direct à l'écran de connexion.
  await expect(page.getByRole('heading', { name: 'Content de vous revoir.' })).toBeVisible();
  await page.getByLabel('Email').fill('toto@cuisine.fr');
  await page.getByLabel('Mot de passe').fill('secret1');
  await page.getByRole('button', { name: 'Me connecter' }).click();
  await page.getByRole('tab', { name: /Favoris/ }).click();
  await expect(page.getByRole('link', { name: 'Mousse au chocolat' })).toBeVisible();
});

test('le bouton retour du navigateur fonctionne', async ({ loggedIn: page }) => {
  await page.getByRole('link', { name: 'Salade de tomate' }).click();
  await expect(page).toHaveURL(/#\/recipe\//);
  await page.goBack();
  await expect(page.getByText('Que cuisine-t-on')).toBeVisible();
});
