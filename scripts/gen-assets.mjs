// Génère les icônes PWA / Apple à partir de public/favicon.svg,
// et une version WebP optimisée de public/images/dish1.png si présente.
// Usage : node scripts/gen-assets.mjs
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile('public/favicon.svg');

// Fond plein (pas de transparence) : iOS remplit sinon en noir.
async function icon(size, out, { maskable = false } = {}) {
  const pad = maskable ? Math.round(size * 0.1) : 0;
  const inner = await sharp(svg, { density: 1024 }).resize(size - pad * 2, size - pad * 2).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#F5254A' } })
    .composite([{ input: inner, left: pad, top: pad }])
    .png()
    .toFile(out);
  console.log('✓', out);
}

await icon(192, 'public/icons/icon-192.png');
await icon(512, 'public/icons/icon-512.png');
await icon(512, 'public/icons/icon-maskable-512.png', { maskable: true });
await icon(180, 'public/apple-touch-icon.png');

if (existsSync('public/images/dish1.png')) {
  await sharp('public/images/dish1.png')
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile('public/images/dish.webp');
  console.log('✓ public/images/dish.webp');
} else {
  console.log('ℹ public/images/dish1.png absent — copie-le depuis le projet Claude Design puis relance.');
}
