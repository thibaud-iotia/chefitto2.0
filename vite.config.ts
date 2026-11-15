/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fridgeScanApi } from './vite-plugin-fridge-scan.ts';
import { lyricsApi } from './vite-plugin-lyrics.ts';
import { recipeImportApi } from './vite-plugin-recipe-import.ts';

// Base relative : fonctionne sur https://<user>.github.io/<repo>/ sans connaître le nom du repo
// (le routage passe par le hash, donc toutes les URL restent sous index.html).
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? './',
  plugins: [
    react(),
    // `/api/recipe-import` en dev / preview (mode local). En production : Supabase Edge Function.
    recipeImportApi(),
    // `/api/lyrics` en dev / preview : page de test `#/test` (scraping Genius vs API LRCLIB).
    lyricsApi(),
    // `/api/fridge-scan` en dev / preview. Clé serveur lue dans .env.local (sans préfixe VITE_ : jamais dans le bundle).
    fridgeScanApi(loadEnv(mode, process.cwd(), '').ANTHROPIC_API_KEY),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'images/*'],
      manifest: {
        name: 'Chefitto',
        short_name: 'Chefitto',
        description: 'Cuisinez ce qu’il y a déjà dans votre frigo.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#08080C',
        theme_color: '#F7F7FB',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // Photos des recettes (sites tiers, sans CORS → réponses opaques, statut 0) : dispo hors ligne.
            urlPattern: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin,
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipe-images',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'supabase/functions/_shared/**/*.ts'],
      exclude: ['src/**/*.test.{ts,tsx}', 'supabase/**/*.test.ts', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
}));
