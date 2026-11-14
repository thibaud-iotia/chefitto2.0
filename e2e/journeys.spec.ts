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

test('rechercher en ligne et importer une recette (API simulée)', async ({ loggedIn: page }) => {
  // Réponses figées : ce parcours ne dépend pas du réseau (les vraies données : live.spec.ts).
  const calls: string[] = [];
  await page.route('**/api/recipe-import**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.search);
    if (url.searchParams.get('url')) {
      return route.fulfill({
        json: {
          recipe: {
            name: 'Gratin dauphinois',
            category: 'Plats',
            timeMin: 75,
            level: 'Moyen',
            price: '€',
            description: 'Pour 6 personnes. Source : marmiton.org.',
            ingredients: ['1,5 kg de pommes de terre', '50 cl de crème', '2 gousses d’ail'],
            steps: ['Éplucher les pommes de terre.', 'Napper de crème.', 'Cuire 1 h 15.'],
            servings: '6 personnes',
            imageUrl: null,
            sourceUrl: 'https://www.marmiton.org/recettes/recette_gratin-dauphinois_1.aspx',
            sourceName: 'marmiton.org',
          },
        },
      });
    }
    return route.fulfill({
      json: {
        page: 1,
        hasMore: false,
        results: [
          { url: 'https://www.marmiton.org/recettes/recette_gratin-dauphinois_1.aspx', name: 'Gratin dauphinois', imageUrl: null, rating: 4.8, reviews: 1200, category: 'Accompagnement', source: 'marmiton.org' },
        ],
      },
    });
  });

  await page.getByRole('button', { name: 'Ajouter une recette' }).click();
  await page.getByRole('link', { name: /Importer une recette/ }).click();
  await page.getByRole('searchbox').pressSequentially('gratin', { delay: 30 });
  await page.getByRole('list', { name: 'Résultats Marmiton' }).getByRole('button', { name: /Gratin dauphinois/ }).click();
  await expect(page.getByText('Recette importée')).toBeVisible();
  expect(calls).toHaveLength(2); // une recherche (anti-rebond) + un import
  await expect(page.getByLabel('Ingrédients')).toHaveValue('1,5 kg de pommes de terre\n50 cl de crème\n2 gousses d’ail');
  await page.getByRole('button', { name: 'Ajouter la recette' }).click();

  await page.getByRole('tab', { name: 'Plats' }).click();
  await page.getByRole('link', { name: 'Gratin dauphinois' }).click();
  await expect(page.getByText('1,5 kg de pommes de terre')).toBeVisible();
  await expect(page.locator('dt:text("Temps") + dd')).toHaveText('75 min');
  await expect(page.locator('dt:text("Niveau") + dd')).toHaveText('Moyen');
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
