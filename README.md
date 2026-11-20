# Chefitto

Application de recettes en PWA : cuisinez ce qu'il y a déjà dans votre frigo.
Vite + React + TypeScript, données Supabase, hébergée sur GitHub Pages et installable
sur iPhone/Android via « Ajouter à l'écran d'accueil ».

Décisions et suivi : voir [PLAN.md](./PLAN.md).

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173 (mode démo local si pas de .env.local)
```

Pour utiliser Supabase en local : copier `.env.example` en `.env.local` et renseigner les deux variables.

## Scripts

| Commande | Rôle |
|----------|------|
| `npm run dev` | Serveur de dev |
| `npm run build` | Typecheck + build de production dans `dist/` |
| `npm run preview` | Sert le build sur http://localhost:4173 |
| `npm test` / `npm run coverage` | Tests unitaires et d'intégration (Vitest) |
| `npm run e2e` | Tests E2E Playwright (iPhone + Android, axe, hors-ligne, import simulé) |
| `npm run e2e:live` | Tests E2E d'import sur **vraies données** (Marmiton, 750g) — réseau requis |
| `npm run perf` | Lighthouse CI avec budgets (à lancer après `build`) |
| `npm run size` | Budget de taille du bundle (après `build`) |
| `npm run lint` / `npm run typecheck` | Qualité |
| `node scripts/gen-assets.mjs` | Régénère icônes PWA + `dish.webp` à partir de `dish1.png` |

## Mise en production (une seule fois)

### 1. Images de la maquette

Le MCP Claude Design ne transfère pas les fichiers binaires. Télécharge `assets/dish1.png` depuis le
projet Claude Design, place-le dans `public/images/dish1.png`, puis :

```bash
node scripts/gen-assets.mjs   # crée public/images/dish.webp (~50 Ko au lieu de 700 Ko)
```

En attendant, une illustration de secours s'affiche. Ces images ne servent plus que pour l'écran d'accueil
et en attendant la photo d'une recette : chaque recette a sa propre photo (reprise de la page importée,
ou trouvée automatiquement par nom sur Marmiton, via la fonction d'import).

### 2. Supabase

1. Crée un projet sur https://supabase.com (offre gratuite).
2. **SQL Editor** : colle et exécute `supabase/schema.sql`. Le script est ré-exécutable : sur une base
   existante, il ajoute les colonnes `recipes.image_url` (photos des recettes), `recipes.servings`
   (nombre de personnes) et `profiles.household` (taille du foyer). Sans elles, l'app fonctionne mais
   ces informations ne sont pas mémorisées (recettes comptées pour 4, foyer de 2).
   Il crée aussi la table `planned_meals` (planning daté sur plusieurs semaines) et y déplace l'ancien
   planning « semaine type » (`plan_entries`), qui devient la semaine en cours. Tant que ce n'est pas
   fait, seule la semaine en cours est modifiable.
3. **Authentication › URL Configuration** : *Site URL* = `https://<ton-user>.github.io/<repo>/`
   (et ajoute la même URL dans *Redirect URLs*).
4. Optionnel : **Authentication › Providers › Email** : désactive « Confirm email » si tu veux
   te connecter sans valider l'email.
5. **Project Settings › API** : récupère `Project URL` et la clé `anon public`.
6. **Fonction d'import de recettes** (recherche Marmiton + import par lien) :

   ```bash
   npx supabase login
   npx supabase functions deploy recipe-import --project-ref <ref-du-projet> --use-api
   ```

   La fonction exige un utilisateur connecté (JWT `authenticated`). Sans elle, l'écran « Importer »
   affiche les modèles locaux et un message « recherche en ligne indisponible ».
7. **Fonction de détection d'aliments** (écran Frigo › « Remplir avec une photo ») — analyse les
   photos avec Claude (Anthropic). Crée une clé sur https://console.anthropic.com (facturation à l'usage,
   de l'ordre d'un centime par photo), puis :

   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref-du-projet>
   npx supabase functions deploy fridge-scan --project-ref <ref-du-projet> --use-api
   ```

   Réservée aux utilisateurs connectés, 30 analyses/heure/utilisateur (secret optionnel
   `FRIDGE_SCAN_PER_HOUR`). Les photos sont réduites à 1568 px et recompressées en JPEG sur le
   téléphone (métadonnées GPS supprimées) ; elles ne sont pas stockées. En dev : `ANTHROPIC_API_KEY`
   dans `.env.local`.
8. **Fonction des vidéos du mode cuisine** (une vidéo YouTube sous chaque étape) — crée une clé
   *YouTube Data API v3* (Google Cloud Console › API et services › activer « YouTube Data API v3 » ›
   Identifiants › Clé API ; gratuite, quota de 10 000 unités/jour, soit ~100 recherches), puis :

   ```bash
   npx supabase secrets set YOUTUBE_API_KEY=AIza... --project-ref <ref-du-projet>
   npx supabase functions deploy step-videos --project-ref <ref-du-projet> --use-api
   ```

   Par défaut, **sans IA ni coût** : la requête est tirée du texte de l'étape (mots porteurs + nom du plat,
   « Coupez tomates émincez oignon Veggie tomato mix ») ; les étapes sans geste (« Servez frais ») ne sont
   pas cherchées. Option payante : `npx supabase secrets set STEP_VIDEOS_CLAUDE=1` fait formuler les requêtes
   par Claude (« nacrer le riz pour un risotto », plus précises), avec la même `ANTHROPIC_API_KEY` que
   ci-dessus : un appel par recette non encore en cache. Les résultats sont gardés 30 jours dans la table `step_videos_cache` (ré-exécuter `schema.sql`),
   partagée par tous les utilisateurs : une recette déjà ouverte ne consomme plus de quota. Réservée aux
   utilisateurs connectés, 60 recettes/heure/utilisateur (secret optionnel `STEP_VIDEOS_PER_HOUR`).
   Sans clé YouTube, le mode cuisine s'affiche simplement sans vidéo. En dev : `YOUTUBE_API_KEY` (et, en option,
   `STEP_VIDEOS_CLAUDE=1`) dans `.env.local`.

### 3. GitHub

1. Pousse le code sur la branche `main`.
2. **Settings › Secrets and variables › Actions** : ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
   Optionnel : `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` pour redéployer la fonction d'import à chaque push.
3. **Settings › Pages › Source** : « GitHub Actions ».
4. Chaque push sur `main` lance lint → tests → E2E → Lighthouse → déploiement.

> La clé `anon` est publique par nature (elle finit dans le JS). La sécurité repose sur les politiques
> RLS du schéma : chaque utilisateur ne voit que ses propres lignes. Ne mets **jamais** la clé
> `service_role` dans le front ou dans ces secrets.

### 4. Sur le téléphone

- **iPhone (Safari)** : ouvre l'URL › bouton Partager › « Sur l'écran d'accueil ».
- **Android (Chrome)** : menu ⋮ › « Installer l'application ».

L'app s'ouvre alors en plein écran, sans barre d'adresse, et fonctionne hors-ligne pour l'interface
(les données Supabase nécessitent le réseau).

## Import de recettes en ligne

Écran « Importer » : pendant la saisie (anti-rebond 350 ms, requête précédente annulée), recherche sur
Marmiton ; si on colle un lien (Marmiton, 750g, CuisineAZ, Jow…), la recette est lue depuis son
JSON-LD `schema.org/Recipe`. Le navigateur ne pouvant pas lire ces sites (CORS), un proxy fait les
requêtes : Supabase Edge Function en production, middleware Vite en dev / preview / e2e.

- Ingrédients, étapes, temps, catégorie, niveau, coût et source sont repris ; tout reste éditable.
- Garde-fous : URL http(s) publiques uniquement (pas d'IP, localhost, ports exotiques), redirections
  revérifiées, délai 10 s, 3 Mo max, User-Agent explicite `Chefitto/2.0`.
- Le balisage Marmiton peut changer : `npm run e2e:live` le détecte (job CI non bloquant).
- Usage personnel : respecte les CGU des sites sources ; la source et l'auteur sont cités dans la description.

## Architecture

```
src/
  domain/      logique pure (score frigo, suggestions, planning, validation) + données de départ
  data/        Repository : SupabaseRepository (prod) / LocalRepository (démo, tests)
  store/       état global Zustand, mises à jour optimistes avec rollback
  ui/          composants du design system (Button, Input, Tabs, Badge, Tag, ProgressRing…)
  components/  shell (cadre, navigation basse, bottom sheet, toast), images, icônes
  screens/     un fichier par écran de la maquette
supabase/      schéma SQL + RLS
  functions/recipe-import/   Edge Function : proxy de recherche / import (CORS)
  functions/fridge-scan/     Edge Function : détection d'aliments sur photo (Claude vision)
  functions/step-videos/     Edge Function : vidéo YouTube par étape (requêtes Claude + YouTube Data API + cache)
  functions/_shared/         recipeScraper.ts — parsing Marmiton + JSON-LD schema.org, garde-fou SSRF
                             fridgeScan.ts — prompt, sortie structurée, validation, limiteur
                             stepVideos.ts — requêtes, recherche YouTube, cache, sans doublon ; stepVideoQueries.ts — requêtes par Claude (option)
vite-plugin-recipe-import.ts sert /api/recipe-import en dev / preview avec le même code
vite-plugin-fridge-scan.ts   sert /api/fridge-scan en dev / preview avec le même code
vite-plugin-step-videos.ts   sert /api/step-videos en dev / preview avec le même code
e2e/           tests Playwright
```
