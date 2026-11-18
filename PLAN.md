# Chefitto 2.0 — Plan & journal de décisions

Source de vérité pour l'implémentation. À tenir à jour à chaque étape.

## Objectif

Application web mobile (PWA) de recettes, fidèle à la maquette Claude Design
« Chefitto Moderne », hébergée sur **GitHub Pages** et installée sur le téléphone
via « Ajouter à l'écran d'accueil » (pas de compte Apple Developer).

## Décisions (ADR courts)

| # | Décision | Pourquoi |
|---|----------|----------|
| 1 | **Vite + React 19 + TypeScript** (SPA statique) | GitHub Pages = statique. Next.js sans serveur n'apporte rien (pas de SSR / API routes) et complique basePath/images. |
| 2 | **Supabase** (Auth email/mdp + Postgres + RLS) | Vraie auth et synchro multi-appareils sans serveur à maintenir. Offre gratuite. Clé `anon` publique côté client, sécurité assurée par RLS. |
| 3 | **Couche `Repository`** (`SupabaseRepository` / `LocalRepository`) | Tests unitaires/e2e sans réseau ; mode démo local si variables Supabase absentes (`VITE_DATA_MODE=local`). |
| 4 | **HashRouter** (react-router) | GitHub Pages ne gère pas le fallback SPA ; `#/` évite les 404 au rafraîchissement. Bouton retour natif du téléphone fonctionne. |
| 5 | **Zustand** pour l'état | Léger, testable hors React, mises à jour optimistes simples. |
| 6 | **CSS Modules + tokens du design system** (copiés dans `src/styles/tokens`) | Fidélité à la maquette, zéro runtime CSS-in-JS. |
| 7 | **Composants DS portés en TSX** (`src/ui`) : Button, IconButton, Input, Tabs, Badge, Tag, Avatar, ProgressBar, ProgressRing | Le bundle DS de la maquette est un script global ; on le réécrit typé et tree-shakable. |
| 8 | **vite-plugin-pwa** | Manifest, icônes, service worker (hors-ligne), `display: standalone` pour l'effet appli native. |
| 9 | Logique métier pure dans `src/domain` | Score frigo, suggestions, planning : testés unitairement. |
| 10 | Seed Supabase via « réservation » atomique (`update … where seeded=false`) | Évite les doublons si deux chargements partent en parallèle. |
| 11 | Contrastes légèrement renforcés vs maquette (gris #7C7C95 → #5A5A72, rouge #F5254A → #D6153A sur petits textes) | Exigé par l'audit axe WCAG 2.1 AA ; rendu visuel quasi identique. |
| 12 | Image plat en WebP + fallback PNG + illustration | Le PNG d'origine fait 700 Ko ; budget 150 Ko/image. |
| 13 | Wake Lock en mode cuisine | L'écran reste allumé pendant qu'on cuisine. |
| 14 | Base Vite relative (`./`) | Marche quel que soit le nom du repo GitHub. |
| 15 | Import en ligne via **proxy** : Supabase Edge Function `recipe-import` (prod) + middleware Vite `/api/recipe-import` (dev/preview/e2e), code commun `supabase/functions/_shared/recipeScraper.ts` | GitHub Pages est statique et Marmiton ne permet pas le CORS. Un seul code testé, exécuté par Deno et Node. Fonction réservée aux utilisateurs connectés (rôle JWT `authenticated`). |
| 16 | Recherche = parsing HTML Marmiton ; import = JSON-LD `schema.org/Recipe` | Le JSON-LD est publié par quasiment tous les sites de recettes (SEO Google) : un seul parseur couvre Marmiton, 750g, CuisineAZ… Regex plutôt que DOM : pas de dépendance, même code Deno/Node. |
| 17 | Garde-fou SSRF : http(s) publics, pas d'IP littérale ni de nom local, port standard, redirections revérifiées, 10 s / 3 Mo max | Le proxy accepte des URL saisies par l'utilisateur. |
| 18 | Ingrédients : un par ligne (virgules acceptées si une seule ligne) | Les ingrédients importés contiennent des virgules (« 1,5 l de lait »). |
| 19 | **Photo par recette** = URL https en base (`recipes.image_url`), pas de copie dans Supabase Storage | Choix validé : zéro quota/config en plus. Import : photo JSON-LD de la page (à défaut, vignette du résultat de recherche). |
| 20 | Recettes sans photo (départ, saisie manuelle) : **recherche Marmiton automatique par nom**, puis par 2 premiers ingrédients ; résultat persisté | Aucune clé API (proxy d'import existant). Une tentative par recette et par session, 2 recherches simultanées max, erreurs passagères non mémorisées. |
| 21 | Photo cassée (`onerror`) → nouvelle recherche en excluant l'URL, sinon illustration | Les liens tiers peuvent disparaître ; l'app se répare seule. |
| 22 | Vignettes redimensionnées par le CDN Marmiton (`_w{n}h{n}c1`, `srcset` 1x/2x/3x) ; cache SW `recipe-images` (CacheFirst, 150 entrées, 30 j) | 10 Ko au lieu de 70 Ko par carte ; photos visibles hors ligne. `referrerPolicy=no-referrer`. |
| 23 | `image_url` filtrée (https, ≤ 2048, sans identifiants) côté client **et** par contrainte SQL ; insert sans la colonne si absente | Données tierces affichées ; front déployable avant la migration SQL. |
| 24 | **Icône** = toque de chef blanche en tracés vectoriels sur dégradé rouge ; source `public/icon.svg` carrée pleine (sans coins arrondis), `favicon.svg` = même dessin arrondi ; PNG via `node scripts/gen-assets.mjs` ; lien `apple-touch-icon` versionné (`?v=2`) | iOS applique son propre masque (l'ancienne icône montrait un double arrondi) ; pas de texte = pas de dépendance à une police absente de sharp ; iOS garde l'ancienne icône en cache sans changement d'URL. |
| 25 | **Détection d'aliments sur photo** (frigo, placard, courses, ticket) : Edge Function `fridge-scan` → Claude `claude-opus-5-5` (vision, `effort: low`, sortie structurée JSON schema, `fallbacks: "default"`) ; code commun `_shared/fridgeScan.ts` + middleware Vite `/api/fridge-scan` | Aucun modèle embarqué fiable pour des aliments variés / tickets ; un LLM vision lit aussi les étiquettes et abréviations. Clé API côté serveur uniquement (secret Supabase). Sortie structurée = JSON toujours valide. Effort bas : perception, pas de raisonnement → rapide et ~1 ct/photo. |
| 26 | Photos **redimensionnées sur le téléphone** (1568 px max, JPEG 0,82, EXIF/GPS retirés), 4 max par analyse, non stockées | Upload rapide en 4G, coût réduit, vie privée. 1568 px = taille utile maximale pour la vision Claude. |
| 27 | **Revue obligatoire** avant ajout (cocher / renommer / changer de catégorie) ; doublons « déjà au frigo » décochés (`sameFood` : casse, accents, pluriel) ; insertion groupée `addFridgeItems` (1 requête) | La détection peut se tromper ; l'utilisateur garde la main. « Lait » ≠ « Laitue » (comparaison stricte, pas par inclusion). |
| 28 | Garde-fous coût : JWT `authenticated` exigé, limiteur 30 analyses/h/utilisateur (mémoire d'instance), corps ≤ ~27 Mo, validation base64/type/taille | Inscription ouverte → éviter l'emballement de la facture API. Limiteur en mémoire = borne simple ; quota exact = table SQL si besoin. |
| 29 | `_shared/fridgeScanContract.ts` sans dépendance, seul importé par l'app ; `@anthropic-ai/sdk` résolu par `fridge-scan/deno.json` (Deno) et npm (Node) | Le SDK ne doit jamais entrer dans le bundle navigateur (vérifié : budget JS inchangé). |
| 30 | Réserve sous la barre de nav = pseudo-élément `.page::after` (112 px + safe-area), pas `padding-bottom` ; `fieldset` en `min-width: 0` | Sur iPhone, « Ajouter la recette » restait caché sous la barre : certains Safari iOS ignorent le padding de fin d'un conteneur flex scrollable. Un `fieldset` prend par défaut la largeur min-content de son contenu : le bloc « Étapes » débordait à droite sur 393 px (iPhone 16). Test e2e de non-régression. |
| 31 | **Image des aliments du frigo = emoji Unicode** (≤ Emoji 14) choisi par mot-clé : `domain/foodIcons.ts` (`foodIcon(nom, catégorie)`), mots entiers via `foodKey` (accents, pluriel), mot-clé le plus long puis le premier ; sinon emoji de la catégorie. Composant `FoodIcon` décoratif (`aria-hidden`) dans les étiquettes du frigo et la revue du scan (suit les corrections en direct) | Zéro requête, zéro octet d'image, hors ligne, rendu natif iOS/Android ; une banque de photos (API tierce) coûterait réseau, quota et CSP pour un gain faible. « Pomme de terre » ≠ pomme, « Laitue » ≠ lait. |
| 32 | **Barre d'actions de la fiche recette dans le flux** (dernier enfant flex du cadre, fond plein + bordure), plus en `position: absolute` par-dessus la page ; page en `.pageWithBar` (réserve basse 24 px) ; « Planifier » sur fond blanc | Sur iPhone 16, les ingrédients défilaient sous le dégradé semi-transparent et le bouton outline transparent (et Safari iOS peut peindre la couche scrollable au-dessus). La zone de défilement s'arrête désormais au bord de la barre : aucun chevauchement possible. Test e2e (393×852, scroll milieu/fin, `elementFromPoint`). |
| 33 | **Nombre de personnes** = entier 1–50 par recette (`recipes.servings`, défaut 4) + **taille du foyer** par profil (`profiles.household`, défaut 2). Lecture du `recipeYield` dans `_shared/servings.ts` (sans dépendance, importé par l'Edge Function et l'app) : nombre seul ou suivi d'une unité de convives (personnes, parts, portions, couverts…), plage → borne basse ; « 1 gâteau », « 12 crêpes » → `null` (reste écrit dans la description) | Un rendement en pièces n'est pas une base de calcul par personne. Un seul parseur testé pour l'import et pour relire le texte renvoyé par une ancienne Edge Function (`servingsCount` absent). |
| 34 | **Recalcul à l'affichage seulement** (`domain/servings.ts`, `scaleIngredient`) : seule la quantité de tête est modifiée (ou après « Libellé : ») ; entiers, décimales FR, `1/2`, `½`, `1 ½`, plages `2-3` / `2 à 3` ; arrondi cuisine (≥ 100 → à 5 près, ≥ 10 → entier, sinon fraction usuelle ¼ ⅓ ½ ⅔ ¾ ou décimale si l'original l'était) ; le frigo est comparé au texte d'origine | Texte libre importé : on ne réécrit jamais la recette (aller-retour sans perte). « 1 boîte de 400 g » → « 2 boîte de 400 g » (pas d'accord du nom : le français est trop irrégulier pour le deviner sans risque). |
| 35 | Fiche : s'ouvre **pour le foyer**, stepper − / + (`Stepper` dans `src/ui`, `role=group`, valeur `aria-live`), note « Quantités recalculées · recette prévue pour N » + « Revenir à N » seulement si une quantité change | Les recettes de départ n'ont pas de quantités : pas de note inutile. |
| 36 | Colonnes optionnelles (`image_url`, `servings`, `household`) : écriture réessayée **sans la colonne** si PostgREST la dit inconnue (message contenant « column ») ; lecture du profil en `select('*')` | Front déployable avant la migration SQL ; une violation de contrainte reste une vraie erreur (non masquée). |

## Nombre de personnes (terminé le 2026-11-18)

Choix validés : stepper − / + sur la fiche avec **recalcul des quantités affichées** (rien n'est
réécrit en base), **taille du foyer** dans le Profil (valeur de départ du formulaire et de la fiche),
pas de nombre de personnes par repas du planning (piste V2). Détails : ADR 33-36.

- [x] `_shared/servings.ts` : bornes 1–50, `parseServings` (« 4 personnes », « 4-6 parts », 6, tableau…) partagé Deno / navigateur
- [x] Import : `servingsCount` dans `ImportedRecipe` (Marmiton, 750g, tout JSON-LD) ; « Pour N personnes » retiré de la description
- [x] Client tolérant à l'ancienne Edge Function (`servingsCount` absent → `parseServings(servings)`)
- [x] Domaine : `Recipe.servings`, `Profile.household`, `scaleIngredient` (entiers, décimales, fractions, ½, plages, « Farine : 200 g »)
- [x] SQL : `recipes.servings`, `profiles.household` (+ migration idempotente) ; front tolérant tant que la migration n'est pas passée
- [x] Repos Supabase / local (anciennes données sans champ → valeurs par défaut)
- [x] UI : composant `Stepper`, fiche (stepper + quantités recalculées), formulaire, Profil
- [x] Tests unitaires + E2E, doc

## Tests

- **Unitaires** : Vitest + Testing Library (`npm test`). Domaine, store, composants UI, écrans.
- **E2E** : Playwright, viewport iPhone (`npm run e2e`), en mode `local` (pas de réseau ; API d'import simulée par `page.route`).
- **E2E live** (`npm run e2e:live`) : import sur vraies pages Marmiton / 750g via le middleware Vite (recherche, pagination, lien collé, page sans recette, axe, contrat API, SSRF). Job CI non bloquant.
- **Performance** : Lighthouse CI (`npm run perf`) avec budgets (perf ≥ 0.9, a11y ≥ 0.9, LCP < 2.5 s, CLS < 0.1)
  + budget de taille de bundle (`npm run size`).
- **CI** GitHub Actions : lint → typecheck → unit → build → e2e → lighthouse → déploiement Pages.

## Modèle de données (Supabase)

Voir `supabase/schema.sql`. Toutes les tables ont `user_id` + RLS `auth.uid() = user_id`.

- `profiles(id, name, email, seeded, household 1-50)`
- `recipes(id, user_id, name, category, price, time_min, level, description, ingredients text[], steps text[], servings 1-50, image_url, created_at)`
- `favorites(user_id, recipe_id)`
- `fridge_items(id, user_id, name, category, created_at)`
- `plan_entries(user_id, day 0-6, meal 0-1, recipe_id)` — PK (user_id, day, meal)

Au premier login, les 8 recettes de la maquette sont insérées pour l'utilisateur (`profiles.seeded`).

## Écrans (maquette → route)

| Écran | Route | Statut |
|-------|-------|--------|
| Splash | `#/` (si non connecté) | ☑ |
| Auth (connexion / inscription) | `#/auth` | ☑ |
| Accueil | `#/home` | ☑ |
| Détail recette | `#/recipe/:id` | ☑ |
| Mode cuisine | `#/recipe/:id/cook` | ☑ |
| Planning | `#/planning` | ☑ |
| Frigo | `#/fridge` | ☑ |
| Frigo › Remplir avec une photo (scan + revue) | `#/fridge` | ☑ |
| Suggestions | `#/suggestions` | ☑ |
| Nouvelle recette | `#/add` | ☑ |
| Importer (recherche Marmiton + lien) | `#/add/import` | ☑ |
| Profil | `#/profile` | ☑ |
| Bottom sheet + toast | global | ☑ |

## Étapes

1. ☑ Scaffold Vite/TS, lint, Vitest, Playwright, PWA
2. ☑ Tokens + composants UI
3. ☑ Domaine (score, suggestions, planning) + tests
4. ☑ Repository local + Supabase, store Zustand + tests
5. ☑ Écrans
6. ☑ E2E
7. ☑ Lighthouse CI + budgets
8. ☑ Workflow GitHub Actions (CI + deploy Pages)
9. ☑ Doc : config Supabase, installation sur téléphone

## Actions manuelles (toi)

- [ ] Copier `assets/dish1.png` (et `logo.png`) du projet Claude Design vers `public/images/` (le MCP ne transfère pas les binaires).
- [ ] Créer un projet Supabase, exécuter `supabase/schema.sql` dans le SQL editor.
- [ ] Base déjà créée : ré-exécuter `supabase/schema.sql` (ajoute `recipes.image_url` pour mémoriser les photos).
- [ ] Dans Supabase › Auth › URL configuration : ajouter l'URL GitHub Pages.
- [ ] Secrets GitHub du repo : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- [ ] GitHub › Settings › Pages › Source : « GitHub Actions ».
- [ ] Détection d'aliments : créer une clé API Anthropic, puis
      `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>` et
      `npx supabase functions deploy fridge-scan --project-ref <ref> --use-api` (auto en CI si secrets Supabase présents).
- [ ] Déployer la fonction d'import : `npx supabase functions deploy recipe-import --project-ref <ref> --use-api`
      (ou secrets `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` pour le déploiement auto en CI).
- [ ] Nombre de personnes : ré-exécuter `supabase/schema.sql` (ajoute `recipes.servings` et `profiles.household`),
      puis redéployer `recipe-import` (champ `servingsCount`). Sans redéploiement, l'app relit « 4 personnes » elle-même.

## Journal

- 2026-11-14 : maquette importée, choix Supabase + Vite validés.
- 2026-11-14 : V1 complète. 75 tests unitaires/intégration (98,7 % lignes), 28 E2E (iPhone + Android,
  axe 0 violation, hors-ligne OK), Lighthouse mobile perf 100 / a11y 100 / best-practices 100,
  LCP 1,4 s, CLS 0,013. JS initial 98 KiB gzip.
- 2026-11-14 : import de recettes réel (remplace les 3 modèles simulés, conservés en « Idées rapides »).
  Recherche Marmiton pendant la saisie (anti-rebond 350 ms, annulation, pagination, cache 5 min),
  import par lien (JSON-LD), temps/niveau/coût/source repris. 141 tests unitaires (97,5 % lignes),
  32 E2E hors réseau, 8 E2E live sur vraies données. Edge Function vérifiée sous Deno 2. JS initial 100,5 KiB.
- 2026-11-14 : photos par recette (ADR 19-23). Import : photo d'origine conservée ; sans photo : recherche
  Marmiton automatique par nom, persistée ; auto-réparation des liens cassés ; cache hors ligne.
  180 tests unitaires/intégration (97,8 % lignes), 36 E2E hors réseau (séquentiel), 9 E2E live. JS initial 101,5 KiB.
  Note : en parallèle (3 workers) sous Windows, quelques E2E échouent par intermittence (`ERR_ABORTED` au
  `goto`/`reload`), déjà le cas avant ce changement ; CI : 2 workers + 2 relances.

- 2026-11-17 : images des aliments sur l'écran Frigo (ADR 31) : emoji par aliment (~250 mots-clés, repli par catégorie),
  aussi dans la revue du scan photo. 234 tests unitaires, E2E frigo + axe verts (iPhone + Android). Aucun impact bundle notable.

- 2026-11-18 : nombre de personnes (ADR 33-36). Import (Marmiton, 750g, tout JSON-LD) → `servingsCount` ;
  fiche ouverte pour la taille du foyer (Profil), stepper − / + qui recalcule les quantités ; formulaire et profil réglables.
  307 tests unitaires/intégration (96,5 % lignes), 42 E2E hors réseau verts (iPhone + Android, axe sur la fiche recalculée),
  E2E live Marmiton verts. JS initial 107,9 KiB / 130.

## Pistes V2

- Nombre de personnes par repas du planning (ex. mardi soir pour 6), utilisé à l'ouverture de la fiche depuis le planning.
- Liste de courses : additionner les quantités recalculées des recettes planifiées.
- Choisir / prendre sa propre photo pour une recette (upload Supabase Storage), en plus de la photo automatique.
- Suppression / édition de recette, liste de courses générée depuis les « À acheter ».
- Planning multi-semaines (actuellement une semaine type).
- Web Share Target (PWA) : « Partager › Chefitto » depuis Marmiton ouvre directement l'import du lien.
- Limitation de débit sur l'Edge Function si l'app est ouverte à d'autres utilisateurs.
