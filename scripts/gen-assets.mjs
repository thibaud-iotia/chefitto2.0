// Génère les icônes PWA / Apple à partir de public/icon.svg (carré plein, sans coins arrondis :
// iOS et Android appliquent eux-mêmes leur masque), et une version WebP optimisée de
// public/images/dish1.png si présente. public/favicon.svg = même dessin, coins arrondis (onglet navigateur).
// Usage : node scripts/gen-assets.mjs
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile('public/icon.svg');

// Le dessin tient dans la zone sûre « maskable » (cercle de 80 %) : même source pour toutes les tailles.
// flatten() : aucune transparence, sinon iOS remplit en noir.
async function icon(size, out) {
  await sharp(svg, { density: 1024 }).resize(size, size).flatten({ background: '#F5254A' }).png({ compressionLevel: 9 }).toFile(out);
  console.log('✓', out);
}

await icon(180, 'public/apple-touch-icon.png');
await icon(192, 'public/icons/icon-192.png');
await icon(512, 'public/icons/icon-512.png');
await icon(512, 'public/icons/icon-maskable-512.png');

if (existsSync('public/images/dish1.png')) {
  await sharp('public/images/dish1.png')
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile('public/images/dish.webp');
  console.log('✓ public/images/dish.webp');
} else {
  console.log('ℹ public/images/dish1.png absent — copie-le depuis le projet Claude Design puis relance.');
}
