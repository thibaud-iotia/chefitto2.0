import { PHOTO_ORIGIN, expect, photoUrl, test } from './fixtures';

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
  // Image de chaque aliment : emoji reconnu, sinon celui de la catégorie (espadon → poisson).
  await expect(page.getByRole('listitem').filter({ hasText: 'Tomate' }).getByTestId('food-icon')).toHaveText('🍅');
  await expect(page.getByRole('listitem').filter({ hasText: 'Asperge' }).getByTestId('food-icon')).toHaveText('🥬');
  await expect(page.getByRole('region', { name: 'Poisson' }).getByTestId('food-icon')).toHaveText('🐟');
  const icon = (await page.getByRole('listitem').filter({ hasText: 'Tomate' }).getByTestId('food-icon').boundingBox())!;
  expect(icon.width).toBeGreaterThan(0); // réellement rendue (police emoji présente)

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
  // Les photos automatiques des recettes de départ sont d'abord toutes trouvées, pour ne compter que l'import.
  await expect(page.getByRole('list', { name: 'Recettes' }).locator('[data-photo]')).toHaveCount(8);
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

test('photos : trouvées automatiquement, mémorisées, conservées à l’import', async ({ loggedIn: page }) => {
  const lookups: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.endsWith('/api/recipe-import') && url.searchParams.has('q')) lookups.push(url.searchParams.get('q')!);
  });
  const photo = page.locator('[data-photo] img');
  const loaded = (img: ReturnType<typeof page.locator>) => img.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0));

  // Accueil : chaque carte affiche la photo trouvée pour son nom.
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Mousse au chocolat' }) });
  await expect(card.locator('[data-photo] img')).toHaveAttribute('src', photoUrl('Mousse au chocolat'));
  await expect.poll(() => loaded(card.locator('[data-photo] img'))).toBeGreaterThan(0);
  await expect(page.getByRole('list', { name: 'Recettes' }).locator('[data-photo]')).toHaveCount(8);

  // Détail, puis rechargement : la photo est mémorisée, pas de nouvelle recherche.
  await page.getByRole('link', { name: 'Mousse au chocolat' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mousse au chocolat' })).toBeVisible();
  await expect(photo).toHaveAttribute('src', photoUrl('Mousse au chocolat'));
  const before = lookups.length;
  await page.reload();
  await expect(photo).toHaveAttribute('src', photoUrl('Mousse au chocolat'));
  await expect.poll(() => loaded(photo)).toBeGreaterThan(0);
  expect(lookups.length).toBe(before);

  // Import par lien : la photo de la page est gardée (aperçu puis fiche).
  await page.route('**/api/recipe-import**', (route) => {
    if (!new URL(route.request().url()).searchParams.has('url')) return route.fallback();
    return route.fulfill({
      json: {
        recipe: {
          name: 'Tarte aux pommes',
          category: 'Desserts',
          timeMin: 50,
          level: 'Facile',
          price: '€',
          description: 'Source : marmiton.org.',
          ingredients: ['4 pommes', '1 pâte brisée'],
          steps: ['Garnir.', 'Cuire 40 min.'],
          servings: null,
          imageUrl: `${PHOTO_ORIGIN}/tarte-importee.png`,
          sourceUrl: 'https://www.marmiton.org/recettes/recette_tarte-aux-pommes_1.aspx',
          sourceName: 'marmiton.org',
        },
      },
    });
  });
  await page.goto('./#/add/import');
  await page.getByRole('searchbox').fill('https://www.marmiton.org/recettes/recette_tarte-aux-pommes_1.aspx');
  await page.getByRole('searchbox').press('Enter');
  await expect(page.getByText('Recette importée')).toBeVisible();
  await expect(photo).toHaveAttribute('src', `${PHOTO_ORIGIN}/tarte-importee.png`);
  await page.getByRole('button', { name: 'Ajouter la recette' }).click();
  await expect(page.getByText('Recette ajoutée')).toBeVisible();
  await page.getByRole('link', { name: 'Tarte aux pommes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tarte aux pommes' })).toBeVisible();
  await expect(photo).toHaveAttribute('src', `${PHOTO_ORIGIN}/tarte-importee.png`);
  expect(lookups).not.toContain('Tarte aux pommes');
});

test('scanner le frigo en photo : image recompressée en JPEG, revue, ajout (API simulée)', async ({ loggedIn: page }) => {
  let sent: { mediaType: string; data: string }[] = [];
  await page.route('**/api/fridge-scan', async (route) => {
    sent = (route.request().postDataJSON() as { images: typeof sent }).images;
    await route.fulfill({
      json: {
        items: [
          { name: 'Lait', category: 'Autre', confidence: 'high' },
          { name: 'Tomate', category: 'Légume', confidence: 'high' },
          { name: 'Saumon', category: 'Poisson', confidence: 'low' },
        ],
      },
    });
  });
  await page.getByRole('link', { name: 'Frigo', exact: true }).click();
  await page.getByLabel('Choisir des photos').setInputFiles('public/icons/icon-512.png');

  await expect(page.getByRole('heading', { name: '3 aliments détectés' })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]!.mediaType).toBe('image/jpeg');
  expect(Buffer.from(sent[0]!.data, 'base64').subarray(0, 2).toString('hex')).toBe('ffd8'); // vrai JPEG
  await expect(page.getByRole('checkbox', { name: 'Ajouter Tomate' })).not.toBeChecked();

  await page.getByRole('button', { name: 'Ajouter 2 aliments' }).click();
  await expect(page.getByText('2 aliments ajoutés au frigo')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Poisson' })).toContainText('Saumon');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Autre' })).toContainText('Lait');
});

test('« Ajouter la recette » n’est jamais masqué par la barre de navigation', async ({ loggedIn: page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); // iPhone 16
  await page.getByRole('button', { name: 'Ajouter une recette' }).click();
  const submit = page.getByRole('button', { name: 'Ajouter la recette' });
  await expect(submit).toBeVisible();
  const main = page.getByRole('main');
  await main.evaluate((el) => (el.scrollTop = el.scrollHeight));
  // Aucun débordement horizontal (le bloc « Étapes » ne doit pas élargir la page).
  expect(await main.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  const btn = (await submit.boundingBox())!;
  const fab = (await page.getByRole('navigation').getByRole('button', { name: 'Ajouter une recette' }).boundingBox())!;
  expect(btn.y + btn.height).toBeLessThan(fab.y);
  await submit.click({ trial: true }); // cliquable : rien ne le recouvre
});
