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

## Tests

- **Unitaires** : Vitest + Testing Library (`npm test`). Domaine, store, composants UI, écrans.
- **E2E** : Playwright, viewport iPhone (`npm run e2e`), en mode `local` (pas de réseau).
- **Performance** : Lighthouse CI (`npm run perf`) avec budgets (perf ≥ 0.9, a11y ≥ 0.9, LCP < 2.5 s, CLS < 0.1)
  + budget de taille de bundle (`npm run size`).
- **CI** GitHub Actions : lint → typecheck → unit → build → e2e → lighthouse → déploiement Pages.

## Modèle de données (Supabase)

Voir `supabase/schema.sql`. Toutes les tables ont `user_id` + RLS `auth.uid() = user_id`.

- `profiles(id, name, email, seeded)`
- `recipes(id, user_id, name, category, price, time_min, level, description, ingredients text[], steps text[], created_at)`
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
| Suggestions | `#/suggestions` | ☑ |
| Nouvelle recette | `#/add` | ☑ |
| Importer | `#/add/import` | ☑ |
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
- [ ] Dans Supabase › Auth › URL configuration : ajouter l'URL GitHub Pages.
- [ ] Secrets GitHub du repo : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- [ ] GitHub › Settings › Pages › Source : « GitHub Actions ».

## Journal

- 2026-11-14 : maquette importée, choix Supabase + Vite validés.
- 2026-11-14 : V1 complète. 75 tests unitaires/intégration (98,7 % lignes), 28 E2E (iPhone + Android,
  axe 0 violation, hors-ligne OK), Lighthouse mobile perf 100 / a11y 100 / best-practices 100,
  LCP 1,4 s, CLS 0,013. JS initial 98 KiB gzip.

## Pistes V2

- Photos par recette (Supabase Storage) au lieu de l'image unique de la maquette.
- Suppression / édition de recette, liste de courses générée depuis les « À acheter ».
- Planning multi-semaines (actuellement une semaine type).
