// Budget de taille du bundle (gzip). Échoue si dépassé. À lancer après `npm run build`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGETS = {
  js: 130 * 1024, // JS initial total
  css: 12 * 1024,
  image: 150 * 1024, // par image
};

const dir = 'dist/assets';
let js = 0;
let css = 0;
const failures = [];

for (const f of readdirSync(dir)) {
  const buf = readFileSync(join(dir, f));
  const gz = gzipSync(buf).length;
  if (f.endsWith('.js') && !f.startsWith('supabase')) js += gz;
  if (f.endsWith('.css')) css += gz;
}

const imgDir = 'dist/images';
try {
  for (const f of readdirSync(imgDir)) {
    if (f === 'dish1.png') continue; // source d'origine, servie seulement en secours
    const size = statSync(join(imgDir, f)).size;
    if (size > BUDGETS.image) failures.push(`image ${f}: ${(size / 1024).toFixed(1)} KiB > ${BUDGETS.image / 1024} KiB`);
  }
} catch {
  /* pas d'images */
}

const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
console.log(`JS  ${kb(js)} / ${kb(BUDGETS.js)}`);
console.log(`CSS ${kb(css)} / ${kb(BUDGETS.css)}`);
if (js > BUDGETS.js) failures.push(`JS ${kb(js)} > ${kb(BUDGETS.js)}`);
if (css > BUDGETS.css) failures.push(`CSS ${kb(css)} > ${kb(BUDGETS.css)}`);

if (failures.length) {
  console.error('✗ Budget dépassé :\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('✓ Budgets respectés');
