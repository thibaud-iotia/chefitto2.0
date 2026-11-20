import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { PHOTO_ORIGIN, expect, login, photoUrl, test } from './fixtures';

/** Fige la date du jour (l'horloge continue d'avancer : minuteries et animations normales). À appeler avant `login`. */
async function setToday(page: Page, isoDate: string) {
  await page.clock.install({ time: new Date(`${isoDate}T10:00:00`) });
}

test('parcours complet : recette → planning → mode cuisine', async ({ page }) => {
  await setToday(page, '2026-11-16'); // lundi : toute la semaine est planifiable
  await login(page);
  await page.getByRole('link', { name: 'Veggie tomato mix' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Veggie tomato mix' })).toBeVisible();
  await expect(page.getByText('4/5 au frigo')).toBeVisible();

  await page.getByRole('button', { name: 'Planifier' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Mercredi 18 · Midi/ }).click();
  await expect(page.getByText('Ajouté au planning · mercredi 18 nov. midi')).toBeVisible();

  await page.getByRole('button', { name: 'Commencer à cuisiner' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Étape suivante' }).click();
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByText('Bon appétit !')).toBeVisible();

  await page.getByRole('link', { name: 'Planning', exact: true }).click();
  await page.getByRole('tab', { name: 'Mercredi 18 novembre' }).click();
  await expect(page.getByTestId('slot-0')).toContainText('Veggie tomato mix');
  await expect(page.getByText('1 repas sur 14 cette semaine')).toBeVisible();
});

test('planning sur 4 semaines : semaine prochaine, persistance, horizon, mise en page iPhone, axe', async ({ page }) => {
  await setToday(page, '2026-11-20'); // vendredi
  await login(page);
  await page.setViewportSize({ width: 393, height: 852 }); // iPhone 16
  const axe = async () => {
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations, JSON.stringify(res.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]), null, 2)).toEqual([]);
  };

  await page.getByRole('link', { name: 'Planning', exact: true }).click();
  const next = page.getByRole('button', { name: 'Semaine suivante' });
  await expect(page.getByText('Semaine du 16 au 22 nov.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Vendredi 20 novembre' })).toHaveAttribute('aria-current', 'date');

  // Les 7 jours tiennent sur la largeur de l'écran, sans défilement horizontal.
  const main = page.getByRole('main');
  expect(await main.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  const sunday = (await page.getByRole('tab', { name: 'Dimanche 22 novembre' }).boundingBox())!;
  expect(sunday.x + sunday.width).toBeLessThanOrEqual(393 - 16);
  await axe(); // jours passés atténués, aujourd'hui marqué

  // Semaine prochaine : lundi 23 au soir.
  await next.click();
  await expect(page.getByText('Semaine du 23 au 29 nov.')).toBeVisible();
  await page.getByRole('tab', { name: 'Lundi 23 novembre' }).click();
  await page.getByRole('button', { name: 'Choisir le repas du Lundi 23 novembre soir' }).click();
  await page.getByRole('dialog', { name: 'Lundi 23 nov. · Soir' }).getByRole('button', { name: /Mousse au chocolat/ }).click();
  await expect(page.getByTestId('slot-1')).toContainText('Mousse au chocolat');
  await expect(page.getByText('1 repas sur 14 la semaine prochaine')).toBeVisible();
  await axe();

  // Persisté : après rechargement, le planning rouvre sur aujourd'hui et la semaine prochaine est intacte.
  await page.reload();
  await expect(page.getByText('Semaine du 16 au 22 nov.')).toBeVisible();
  await expect(page.getByText('0 repas sur 14 cette semaine')).toBeVisible();
  await next.click();
  await page.getByRole('tab', { name: 'Lundi 23 novembre' }).click();
  await expect(page.getByTestId('slot-1')).toContainText('Mousse au chocolat');

  // Horizon : 3 semaines après la semaine en cours, puis retour à aujourd'hui.
  await next.click();
  await next.click();
  await expect(page.getByText('Semaine du 7 au 13 déc.')).toBeVisible();
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: "Aujourd'hui" }).click();
  await expect(page.getByRole('tab', { name: 'Vendredi 20 novembre' })).toHaveAttribute('aria-selected', 'true');

  // Depuis la fiche : « Planifier » dans 3 semaines.
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await page.getByRole('link', { name: 'Veggie tomato mix' }).click();
  await page.getByRole('button', { name: 'Planifier' }).click();
  const sheet = page.getByRole('dialog', { name: 'Planifier Veggie tomato mix' });
  await expect(sheet.getByRole('button', { name: /Jeudi 19 · Midi/ })).toHaveCount(0); // passé : non proposé
  await expect(sheet.getByRole('button', { name: /Vendredi 20 · Soir/ })).toBeVisible();
  await axe();
  for (let i = 0; i < 3; i++) await sheet.getByRole('button', { name: 'Semaine suivante' }).click();
  await expect(sheet.getByText('Semaine du 7 au 13 déc.')).toBeVisible();
  await sheet.getByRole('button', { name: /Dimanche 13 · Midi/ }).click();
  await expect(page.getByText('Ajouté au planning · dimanche 13 déc. midi')).toBeVisible();

  await page.getByRole('button', { name: 'Retour' }).click();
  await page.getByRole('link', { name: 'Planning', exact: true }).click();
  for (let i = 0; i < 3; i++) await next.click();
  await page.getByRole('tab', { name: 'Dimanche 13 décembre' }).click();
  await expect(page.getByTestId('slot-0')).toContainText('Veggie tomato mix');
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
            description: 'Source : marmiton.org.',
            ingredients: ['1,5 kg de pommes de terre', '50 cl de crème', '2 gousses d’ail'],
            steps: ['Éplucher les pommes de terre.', 'Napper de crème.', 'Cuire 1 h 15.'],
            servings: '6 personnes',
            servingsCount: 6,
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
  await expect(page.getByRole('group', { name: 'Nombre de personnes' })).toContainText('6 personnes');
  await page.getByRole('button', { name: 'Ajouter la recette' }).click();

  await page.getByRole('tab', { name: 'Plats' }).click();
  await page.getByRole('link', { name: 'Gratin dauphinois' }).click();
  await expect(page.locator('dt:text("Temps") + dd')).toHaveText('75 min');
  await expect(page.locator('dt:text("Niveau") + dd')).toHaveText('Moyen');

  // La fiche s'ouvre pour le foyer (2 personnes par défaut) : quantités recalculées pour 2 au lieu de 6.
  const stepper = page.getByRole('group', { name: 'Nombre de personnes' });
  await expect(stepper).toContainText('2 personnes');
  await expect(page.getByText('0,5 kg de pommes de terre')).toBeVisible();
  await expect(page.getByText('17 cl de crème')).toBeVisible();
  await expect(page.getByText(/recette prévue pour 6 personnes/)).toBeVisible();
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(res.violations, JSON.stringify(res.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]), null, 2)).toEqual([]);
  await page.getByRole('button', { name: 'Revenir à 6' }).click();
  await expect(stepper).toContainText('6 personnes');
  await expect(page.getByText('1,5 kg de pommes de terre')).toBeVisible();

  // Taille du foyer réglée dans le profil (persistée) : les fiches s'ouvrent désormais pour 3.
  await page.goto('./#/profile');
  await page.getByRole('button', { name: 'Une personne de plus dans le foyer' }).click();
  await page.getByRole('button', { name: 'Mettre à jour' }).click();
  await expect(page.getByText('Profil mis à jour')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Taille du foyer' })).toContainText('3 personnes');
  await page.goto('./#/home');
  await page.getByRole('tab', { name: 'Plats' }).click();
  await page.getByRole('link', { name: 'Gratin dauphinois' }).click();
  await expect(page.getByText('0,75 kg de pommes de terre')).toBeVisible();
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
  await card.locator('[data-photo] img').scrollIntoViewIfNeeded(); // loading="lazy" : carte sous la ligne de flottaison
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

test('fiche recette : les ingrédients ne passent jamais sous « Planifier » / « Commencer à cuisiner »', async ({ loggedIn: page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); // iPhone 16
  await page.getByRole('link', { name: 'Veggie tomato mix' }).click();
  const main = page.getByRole('main');
  const bar = page.getByRole('group', { name: 'Actions de la recette' });
  const plan = page.getByRole('button', { name: 'Planifier' });
  const cook = page.getByRole('button', { name: 'Commencer à cuisiner' });
  await expect(cook).toBeVisible();

  const barBox = (await bar.boundingBox())!;
  // La barre est hors de la zone de défilement : la page s'arrête à son bord supérieur.
  const mainBox = (await main.boundingBox())!;
  expect(mainBox.y + mainBox.height).toBeLessThanOrEqual(barBox.y + 1);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(852);

  for (const pos of ['middle', 'end'] as const) {
    await main.evaluate((el, p) => (el.scrollTop = p === 'end' ? el.scrollHeight : el.scrollHeight / 2), pos);
    // Aucun ingrédient visible ne chevauche la barre d'actions.
    const rows = await page.locator('main li').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => ({ top: r.top, bottom: r.bottom })),
    );
    const area = await main.evaluate((el) => el.getBoundingClientRect().bottom);
    for (const r of rows.filter((r) => r.top < area)) expect(Math.min(r.bottom, area)).toBeLessThanOrEqual(barBox.y + 1);
    // Ce qui est réellement peint au centre des boutons, ce sont les boutons.
    for (const btn of [plan, cook]) {
      expect(await btn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && el.contains(hit);
      })).toBe(true);
    }
  }
  // Le dernier ingrédient reste atteignable au-dessus de la barre.
  const last = (await page.locator('main li').last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(barBox.y);
  await cook.click({ trial: true });
  await plan.click({ trial: true });
});

/** Vrai appui long au doigt (événements tactiles CDP, comme sur le téléphone), puis relâchement. */
async function longPress(page: Page, target: Locator, ms = 800) {
  await target.scrollIntoViewIfNeeded(); // les événements tactiles CDP visent des coordonnées à l'écran
  const box = (await target.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('appui long sur une carte : sélectionner, modifier, supprimer (persistant)', async ({ loggedIn: page }) => {
  const card = (name: string) => page.getByRole('list', { name: 'Recettes' }).getByRole('listitem').filter({ hasText: name });
  const bar = page.getByRole('group', { name: 'Recettes sélectionnées' });

  // Pas de href sur la carte : sinon Safari iOS ouvre son aperçu de lien à l'appui long.
  await expect(page.getByRole('link', { name: 'Spicy fish sauce' })).not.toHaveAttribute('href');
  // Un appui court ouvre toujours la recette.
  await page.getByRole('link', { name: 'Spicy fish sauce' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Spicy fish sauce' })).toBeVisible();
  await page.goBack();

  // Appui long : sélection, sans navigation ; la barre recouvre l'en-tête.
  await longPress(page, card('Veggie tomato mix'));
  await expect(bar).toContainText('1 sélectionnée');
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole('button', { name: 'Veggie tomato mix', pressed: true })).toBeVisible();
  // Le bouton posé sur la carte reste transparent : l'image reste visible (régression : fond natif gris).
  await expect(page.getByRole('button', { name: 'Veggie tomato mix', pressed: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  // Appui court en mode sélection : coche / décoche.
  await page.getByRole('button', { name: 'Spicy fish sauce', pressed: false }).tap();
  await expect(bar).toContainText('2 sélectionnées');
  await expect(bar.getByRole('button', { name: 'Modifier' })).toBeDisabled();
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations.map((v) => [v.id, v.nodes.map((n) => n.target)])).toEqual([]);
  await page.getByRole('button', { name: 'Spicy fish sauce', pressed: true }).tap();

  // Modifier.
  await bar.getByRole('button', { name: 'Modifier' }).tap();
  await expect(page.getByRole('heading', { name: 'Modifier la recette' })).toBeVisible();
  await expect(page.getByLabel('Nom du plat')).toHaveValue('Veggie tomato mix');
  const a11yEdit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11yEdit.violations.map((v) => [v.id, v.nodes.map((n) => n.target)])).toEqual([]);
  await page.getByLabel('Nom du plat').fill('Veggie du jardin');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Recette modifiée')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Veggie du jardin' })).toBeVisible();
  await expect(bar).toBeHidden();

  // Supprimer, après confirmation.
  await longPress(page, card('Veggie du jardin'));
  await bar.getByRole('button', { name: 'Supprimer' }).tap();
  await page.getByRole('dialog', { name: 'Supprimer « Veggie du jardin » ?' }).getByRole('button', { name: /Supprimer définitivement/ }).tap();
  await expect(page.getByText('Recette supprimée')).toBeVisible();
  await expect(card('Veggie du jardin')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Spicy fish sauce' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Veggie du jardin' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Veggie tomato mix' })).toHaveCount(0);
});

test('planning : vignettes dans le choix du plat ; glisser la feuille vers le bas la ferme', async ({ page }) => {
  await setToday(page, '2026-11-16');
  await login(page);
  await page.getByRole('link', { name: 'Planning', exact: true }).click();
  await page.getByRole('button', { name: /^Choisir le repas/ }).first().click();
  const sheet = page.getByRole('dialog');
  const item = sheet.getByRole('button', { name: /Veggie tomato mix/ });
  await expect(item.locator('img')).toBeVisible();
  await page.waitForTimeout(400); // fin de l'animation d'ouverture

  // Vrais événements tactiles (CDP) : écouteurs non passifs, preventDefault, transitions.
  const cdp = await page.context().newCDPSession(page);
  const box = (await item.boundingBox())!;
  const x = box.x + box.width / 2;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [{ x, y }] });
  await touch('touchStart', box.y + 10);
  for (let dy = 20; dy <= 200; dy += 20) await touch('touchMove', box.y + 10 + dy);
  await touch('touchEnd');

  await expect(sheet).toBeHidden();
  // Le glissement ne choisit pas le plat sous le doigt.
  await expect(page.getByTestId('slot-0')).toContainText('Rien de prévu');
});
