import { foodKey } from './logic';
import type { FoodCategory } from './types';

/**
 * Image d'un aliment = emoji Unicode (≤ Emoji 14, affiché nativement sur iOS 15.4+ / Android 12+).
 * Zéro requête, zéro octet d'image, fonctionne hors ligne, et suit le style du système.
 * Clés écrites en minuscules sans accents ; elles passent par `foodKey` (singulier) comme le nom saisi.
 */
const ICONS: Record<string, readonly string[]> = {
  // Légumes
  '🍅': ['tomate'],
  '🥒': ['courgette', 'concombre', 'cornichon'],
  '🧅': ['oignon', 'echalote'],
  '🧄': ['ail'],
  '🌿': ['basilic', 'persil', 'coriandre', 'menthe', 'thym', 'romarin', 'ciboulette', 'estragon', 'aneth', 'laurier', 'sauge', 'herbe'],
  '🥕': ['carotte', 'navet', 'panais', 'radis', 'betterave'],
  '🥔': ['pomme de terre', 'patate'],
  '🍠': ['patate douce'],
  '🥦': ['brocoli', 'chou fleur', 'chou romanesco'],
  '🥬': ['salade', 'laitue', 'epinard', 'chou', 'blette', 'mache', 'roquette', 'endive', 'poireau', 'celeri', 'fenouil', 'artichaut', 'asperge'],
  '🫑': ['poivron'],
  '🌶️': ['piment'],
  '🍆': ['aubergine'],
  '🌽': ['mais'],
  '🍄': ['champignon', 'cepe', 'girolle', 'morille'],
  '🫘': ['haricot', 'lentille', 'pois chiche', 'flageolet', 'pois', 'feve'],
  '🥑': ['avocat'],
  '🫒': ['olive', 'huile d olive'],
  '🎃': ['potiron', 'citrouille', 'courge', 'butternut', 'potimarron'],
  // Fruits
  '🍋': ['citron'],
  '🍊': ['orange', 'clementine', 'mandarine', 'pamplemousse'],
  '🍎': ['pomme'],
  '🍐': ['poire'],
  '🍌': ['banane'],
  '🍇': ['raisin'],
  '🍓': ['fraise', 'framboise'],
  '🫐': ['myrtille', 'cassis', 'mure'],
  '🍒': ['cerise'],
  '🍑': ['peche', 'abricot', 'nectarine', 'prune'],
  '🥭': ['mangue'],
  '🍍': ['ananas'],
  '🥝': ['kiwi'],
  '🍉': ['pasteque'],
  '🍈': ['melon'],
  '🥥': ['coco', 'noix de coco'],
  '🌰': ['chataigne', 'marron', 'noisette', 'noix', 'amande'],
  '🥜': ['cacahuete', 'arachide'],
  // Viandes
  '🥩': ['viande', 'boeuf', 'steak', 'veau', 'agneau', 'entrecote', 'bavette', 'roti', 'filet mignon'],
  '🍔': ['steak hache'],
  '🍗': ['poulet', 'dinde', 'volaille', 'canard', 'pintade'],
  '🥓': ['lardon', 'bacon', 'poitrine'],
  '🍖': ['porc', 'jambon', 'gigot', 'cote', 'travers'],
  '🌭': ['saucisse', 'merguez', 'chipolata', 'chorizo', 'saucisson'],
  // Poissons & fruits de mer
  '🐟': ['poisson', 'cabillaud', 'colin', 'merlu', 'lieu', 'truite', 'bar', 'dorade', 'sardine', 'maquereau', 'espadon', 'sole', 'thon', 'hareng', 'anchois', 'eglefin'],
  '🍣': ['saumon'],
  '🦐': ['crevette', 'gambas', 'langoustine'],
  '🦀': ['crabe', 'tourteau'],
  '🦞': ['homard', 'langouste'],
  '🦑': ['calamar', 'encornet', 'seiche'],
  '🐙': ['poulpe'],
  '🦪': ['huitre', 'moule', 'saint jacques', 'coquillage'],
  // Crèmerie
  '🥚': ['oeuf'],
  '🥛': ['lait', 'creme', 'yaourt'],
  '🧈': ['beurre', 'margarine'],
  '🧀': ['fromage', 'emmental', 'gruyere', 'comte', 'mozzarella', 'parmesan', 'chevre', 'feta', 'camembert', 'brie', 'roquefort', 'raclette', 'ricotta', 'mascarpone', 'reblochon'],
  // Épicerie
  '🍞': ['pain', 'brioche', 'pain de mie'],
  '🥖': ['baguette'],
  '🥐': ['croissant', 'pate feuilletee'],
  '🥧': ['tarte', 'pate brisee', 'pate sablee'],
  '🍕': ['pizza', 'pate a pizza'],
  '🍝': ['pate', 'spaghetti', 'tagliatelle', 'penne', 'coquillette', 'lasagne', 'nouille', 'macaroni', 'fusilli'],
  '🥟': ['ravioli', 'gnocchi'],
  '🌮': ['tortilla', 'wrap'],
  '🍚': ['riz'],
  '🌾': ['farine', 'ble', 'semoule', 'quinoa', 'avoine', 'flocon', 'boulgour', 'cereale'],
  '🧂': ['sel', 'poivre', 'epice', 'cumin', 'paprika', 'curry', 'muscade', 'cannelle'],
  '🍯': ['miel', 'confiture', 'sirop'],
  '🍬': ['sucre'],
  '🍫': ['chocolat', 'cacao', 'nutella'],
  '🍪': ['biscuit', 'cookie', 'gateau'],
  '🍨': ['glace'],
  '🫗': ['huile', 'vinaigre'],
  '🥫': ['conserve', 'sauce', 'ketchup', 'moutarde', 'mayonnaise', 'bouillon', 'concentre'],
  '☕': ['cafe'],
  '🍵': ['the'],
  '🧃': ['jus', 'compote'],
  '🥤': ['soda', 'coca', 'limonade'],
  '🍷': ['vin'],
  '🍺': ['biere'],
  '💧': ['eau'],
};

/** Image par défaut d'une catégorie, quand l'aliment n'est pas reconnu. */
export const CATEGORY_ICON: Record<FoodCategory, string> = {
  Légume: '🥗',
  Fruit: '🍏',
  Viande: '🥩',
  Poisson: '🐟',
  Autre: '🛒',
};

const ENTRIES: readonly { key: string; emoji: string }[] = Object.entries(ICONS).flatMap(([emoji, keys]) =>
  keys.map((k) => ({ key: foodKey(k), emoji })),
);

/** Mots du nom séparés par des espaces simples (apostrophes, tirets, ponctuation → espace), au singulier. */
function words(name: string): string {
  return foodKey(name.replace(/[^\p{L}\p{N}]+/gu, ' '));
}

/**
 * Emoji représentant un aliment : mot-clé reconnu dans le nom (mot entier, pluriel et accents ignorés),
 * sinon l'image de sa catégorie. En cas de plusieurs mots-clés : le plus long gagne (« Pomme de terre »
 * n'est pas une pomme), puis le premier dans le nom (« Filet de saumon » → saumon, « Lait de coco » → lait).
 */
export function foodIcon(name: string, category: FoodCategory): string {
  const text = ` ${words(name)} `;
  let best: { len: number; at: number; emoji: string } | null = null;
  for (const { key, emoji } of ENTRIES) {
    const at = text.indexOf(` ${key} `);
    if (at < 0) continue;
    if (!best || key.length > best.len || (key.length === best.len && at < best.at)) best = { len: key.length, at, emoji };
  }
  return best?.emoji ?? CATEGORY_ICON[category];
}
