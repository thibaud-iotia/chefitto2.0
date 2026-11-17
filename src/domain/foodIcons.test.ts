import { describe, expect, it } from 'vitest';
import { CATEGORY_ICON, foodIcon } from './foodIcons';
import { SEED_FRIDGE } from './seed';
import { FOOD_CATEGORIES } from './types';

describe('foodIcon', () => {
  it('reconnaît les aliments courants de chaque catégorie', () => {
    expect(foodIcon('Tomate', 'Légume')).toBe('🍅');
    expect(foodIcon('Citron', 'Fruit')).toBe('🍋');
    expect(foodIcon('Poulet', 'Viande')).toBe('🍗');
    expect(foodIcon('Saumon', 'Poisson')).toBe('🍣');
    expect(foodIcon('Œufs', 'Autre')).toBe('🥚');
    expect(foodIcon('Riz', 'Autre')).toBe('🍚');
  });

  it('ignore casse, accents, ligatures et pluriel', () => {
    expect(foodIcon('TOMATES', 'Légume')).toBe('🍅');
    expect(foodIcon('Poireaux', 'Légume')).toBe('🥬');
    expect(foodIcon('Pêches', 'Fruit')).toBe('🍑');
    expect(foodIcon('crème fraîche', 'Autre')).toBe('🥛');
    expect(foodIcon('  Bœuf   haché ', 'Viande')).toBe('🥩');
    expect(foodIcon('Noix', 'Fruit')).toBe('🌰');
    expect(foodIcon('Choux', 'Légume')).toBe('🥬');
  });

  it('le mot-clé le plus long gagne (expression composée)', () => {
    expect(foodIcon('Pomme', 'Fruit')).toBe('🍎');
    expect(foodIcon('Pommes de terre', 'Légume')).toBe('🥔');
    expect(foodIcon('Patate douce', 'Légume')).toBe('🍠');
    expect(foodIcon('Chou-fleur', 'Légume')).toBe('🥦');
    expect(foodIcon('Noix de coco', 'Fruit')).toBe('🥥');
    expect(foodIcon("Huile d'olive", 'Autre')).toBe('🫒');
    expect(foodIcon('Huile de tournesol', 'Autre')).toBe('🫗');
    expect(foodIcon('Steak haché', 'Viande')).toBe('🍔');
  });

  it('à longueur égale, le premier mot du nom gagne', () => {
    expect(foodIcon('Lait de coco', 'Autre')).toBe('🥛');
    expect(foodIcon('Coco au lait', 'Autre')).toBe('🥥');
  });

  it('trouve le mot-clé au milieu d’un nom descriptif', () => {
    expect(foodIcon('Filet de saumon fumé', 'Poisson')).toBe('🍣');
    expect(foodIcon('Sauce tomate', 'Autre')).toBe('🍅');
    expect(foodIcon('Jus d’orange', 'Autre')).toBe('🍊');
    expect(foodIcon('Tomates cerises', 'Légume')).toBe('🍅');
  });

  it('compare des mots entiers, jamais un morceau de mot', () => {
    expect(foodIcon('Laitue', 'Légume')).toBe('🥬'); // pas « lait »
    expect(foodIcon('Caille', 'Viande')).toBe(CATEGORY_ICON.Viande); // pas « ail »
    expect(foodIcon('Gâteau', 'Autre')).toBe('🍪'); // pas « eau »
    expect(foodIcon('Thon', 'Poisson')).toBe('🐟'); // pas « thé »
  });

  it('retombe sur l’image de la catégorie si l’aliment est inconnu ou vide', () => {
    for (const c of FOOD_CATEGORIES) {
      expect(CATEGORY_ICON[c]).toBeTruthy();
      expect(foodIcon('Xyzzy', c)).toBe(CATEGORY_ICON[c]);
      expect(foodIcon('', c)).toBe(CATEGORY_ICON[c]);
      expect(foodIcon('  -- ', c)).toBe(CATEGORY_ICON[c]);
    }
  });

  it('chaque aliment du frigo de départ a sa propre image', () => {
    for (const f of SEED_FRIDGE) expect(foodIcon(f.name, f.category), f.name).not.toBe(CATEGORY_ICON[f.category]);
  });
});
