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
| `npm run e2e` | Tests E2E Playwright (iPhone + Android, axe, hors-ligne) |
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

En attendant, une illustration de secours s'affiche.

### 2. Supabase

1. Crée un projet sur https://supabase.com (offre gratuite).
2. **SQL Editor** : colle et exécute `supabase/schema.sql`.
3. **Authentication › URL Configuration** : *Site URL* = `https://<ton-user>.github.io/<repo>/`
   (et ajoute la même URL dans *Redirect URLs*).
4. Optionnel : **Authentication › Providers › Email** : désactive « Confirm email » si tu veux
   te connecter sans valider l'email.
5. **Project Settings › API** : récupère `Project URL` et la clé `anon public`.

### 3. GitHub

1. Pousse le code sur la branche `main`.
2. **Settings › Secrets and variables › Actions** : ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
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
e2e/           tests Playwright
```
