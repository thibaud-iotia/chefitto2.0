import { FOOD_CATEGORIES, RECIPE_CATEGORIES, type FridgeItem, type Recipe } from '../domain/types';

/**
 * Jeu de données volumineux et déterministe pour les tests de performance, les benchmarks et l'e2e de perf.
 * Ingrédients réalistes (accents, quantités, ligatures) pour exercer la normalisation comme en vrai.
 */
const FOODS = [
  'Tomate', 'Oignon rouge', 'Ail', 'Basilic', 'Persil', 'Carotte', 'Courgette', 'Aubergine', 'Poivron', 'Pomme de terre',
  'Échalote', 'Poireau', 'Épinard', 'Champignon', 'Citron', 'Orange', 'Pomme', 'Poire', 'Banane', 'Fraise',
  'Poulet', 'Bœuf haché', 'Lardons', 'Jambon', 'Saumon', 'Cabillaud', 'Crevettes', 'Thon', 'Œuf', 'Lait',
  'Crème fraîche', 'Beurre', 'Gruyère râpé', 'Mozzarella', 'Parmesan', 'Farine', 'Sucre', 'Riz', 'Pâtes', 'Lentilles',
  "Huile d'olive", 'Vinaigre balsamique', 'Moutarde', 'Miel', 'Chocolat noir', 'Levure', 'Cannelle', 'Curry', 'Paprika', 'Coriandre',
];
const QTY = ['', '200 g de ', '1 ', '2 ', '½ ', '1,5 l de ', '3 c. à soupe de ', '1 pincée de '];

/** `n` recettes de 8 ingrédients, ids `r0`…`r{n-1}`, avec photo (aucune recherche automatique). */
export function bigRecipes(n: number): Recipe[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    name: `Recette n°${i} ${FOODS[i % FOODS.length]} & ${FOODS[(i * 7) % FOODS.length]}`,
    category: RECIPE_CATEGORIES[i % RECIPE_CATEGORIES.length]!,
    price: '—',
    timeMin: 10 + (i % 6) * 10,
    level: 'Facile',
    description: 'Recette de test.',
    ingredients: Array.from({ length: 8 }, (_, k) => `${QTY[(i + k) % QTY.length]}${FOODS[(i * 3 + k * 11) % FOODS.length]}`),
    steps: ['Préparer.', 'Cuire.', 'Servir.'],
    servings: 4,
    imageUrl: `https://img.chefitto.test/r${i}.jpg`,
  }));
}

/** `n` aliments du frigo (noms distincts au-delà de la liste de base). */
export function bigFridge(n: number): FridgeItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    name: i < FOODS.length ? FOODS[(i * 3) % FOODS.length]! : `Aliment ${i}`,
    category: FOOD_CATEGORIES[i % FOOD_CATEGORIES.length]!,
  }));
}
