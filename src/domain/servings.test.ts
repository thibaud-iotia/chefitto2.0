import { describe, expect, it } from 'vitest';
import { formatQuantity, scaleIngredient, servingsFactor, servingsLabel } from './servings';

describe('servingsLabel', () => {
  it('accorde au pluriel', () => {
    expect(servingsLabel(1)).toBe('1 personne');
    expect(servingsLabel(2)).toBe('2 personnes');
  });
});

describe('servingsFactor', () => {
  it('rapport cible / recette, 1 si une valeur est invalide', () => {
    expect(servingsFactor(4, 2)).toBe(0.5);
    expect(servingsFactor(4, 6)).toBe(1.5);
    expect(servingsFactor(0, 6)).toBe(1);
    expect(servingsFactor(4, 0)).toBe(1);
  });
});

describe('formatQuantity', () => {
  it('grandes quantités : entier, arrondi à 5 près dès 100', () => {
    expect(formatQuantity(333.33)).toBe('335');
    expect(formatQuantity(150)).toBe('150');
    expect(formatQuantity(62.5)).toBe('63');
    expect(formatQuantity(10)).toBe('10');
  });

  it('petites quantités : fractions usuelles', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(1.5)).toBe('1 ½');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(2.75)).toBe('2 ¾');
    expect(formatQuantity(1 / 3)).toBe('⅓');
    expect(formatQuantity(4 / 3)).toBe('1 ⅓');
    expect(formatQuantity(0.97)).toBe('1');
    expect(formatQuantity(2.98)).toBe('3');
  });

  it('sans fraction proche : une décimale', () => {
    expect(formatQuantity(0.1)).toBe('0,1');
    expect(formatQuantity(0.05)).toBe('0,05');
    expect(formatQuantity(1.4)).toBe('1,4');
  });

  it('écriture décimale conservée quand l’original l’était', () => {
    expect(formatQuantity(0.75, true)).toBe('0,75');
    expect(formatQuantity(2.25, true)).toBe('2,3');
    expect(formatQuantity(3, true)).toBe('3');
  });
});

describe('scaleIngredient', () => {
  it.each([
    ['200 g de farine', 1.5, '300 g de farine'],
    ['200g de farine', 0.5, '100g de farine'],
    ['3 oeufs', 2, '6 oeufs'],
    ['3 oeufs', 0.5, '1 ½ oeufs'],
    ['1,5 l de lait', 0.5, '0,75 l de lait'],
    ['1.5 l de lait', 2, '3 l de lait'],
    ['1/2 citron', 2, '1 citron'],
    ['1/2 citron', 3, '1 ½ citron'],
    ['½ citron', 0.5, '¼ citron'],
    ['1 ½ cuillère à soupe de sucre', 2, '3 cuillère à soupe de sucre'],
    ['1 1/2 tasse de riz', 2, '3 tasse de riz'],
    ['2-3 gousses d’ail', 2, '4-6 gousses d’ail'],
    ['2 à 3 tomates', 2, '4 à 6 tomates'],
    ['2 ou 3 carottes', 0.5, '1 ou 1 ½ carottes'],
    ['Farine : 250 g', 2, 'Farine : 500 g'],
    ['1 boîte de tomates de 400 g', 2, '2 boîte de tomates de 400 g'],
    ['  4 verres de riz', 0.5, '  2 verres de riz'],
  ])('%s × %d → %s', (text, factor, expected) => {
    expect(scaleIngredient(text, factor)).toBe(expected);
  });

  it('laisse intacts les ingrédients sans quantité lisible', () => {
    for (const text of ['Sel, poivre', 'chorizo', 'une pincée de sel', 'Tomate', '—', 'Sauce : à volonté']) {
      expect(scaleIngredient(text, 2)).toBe(text);
    }
  });

  it('facteur 1 ou invalide : texte d’origine, à l’identique', () => {
    expect(scaleIngredient('1,50 l de lait', 1)).toBe('1,50 l de lait');
    expect(scaleIngredient('200 g', 0)).toBe('200 g');
    expect(scaleIngredient('200 g', NaN)).toBe('200 g');
    expect(scaleIngredient('200 g', -1)).toBe('200 g');
  });

  it('ne coupe pas un nombre : « 1/0 » ou « 12,5,3 » restent tels quels', () => {
    expect(scaleIngredient('1/0 truc', 2)).toBe('1/0 truc');
    expect(scaleIngredient('3, 4 tomates', 2)).toBe('3, 4 tomates');
  });

  it('aller-retour : 4 → 2 → 4 personnes redonne les quantités d’origine', () => {
    const half = scaleIngredient('300 g de pâtes', 0.5);
    expect(half).toBe('150 g de pâtes');
    expect(scaleIngredient(half, 2)).toBe('300 g de pâtes');
  });
});
