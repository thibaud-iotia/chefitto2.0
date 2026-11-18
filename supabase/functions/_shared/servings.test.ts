import { describe, expect, it } from 'vitest';
import { clampServings, MAX_SERVINGS, parseServings } from './servings.ts';

describe('clampServings', () => {
  it('garde les entiers dans les bornes, arrondit, refuse le reste', () => {
    expect(clampServings(4)).toBe(4);
    expect(clampServings(2.5)).toBe(3);
    expect(clampServings('6')).toBe(6);
    expect(clampServings('2,4')).toBe(2);
    expect(clampServings(MAX_SERVINGS)).toBe(MAX_SERVINGS);
    for (const bad of [0, -2, MAX_SERVINGS + 1, NaN, Infinity, '4 personnes', '', null, undefined, {}, true]) {
      expect(clampServings(bad)).toBeNull();
    }
  });
});

describe('parseServings (recipeYield schema.org)', () => {
  it.each([
    [4, 4],
    ['4', 4],
    ['4 personnes', 4],
    ['4 Personnes', 4],
    ['1 personne', 1],
    ['6 pers.', 6],
    ['Pour 6 parts', 6],
    ['pour 2 personnes (adultes)', 2],
    ['8 portions', 8],
    ['10 couverts', 10],
    ['4-6 personnes', 4],
    ['4 – 6 parts', 4],
    ['4 à 6 personnes', 4],
    ['2 ou 3 personnes', 2],
    ['Serves 4', 4],
    ['4 servings', 4],
    ['  12  ', 12],
    [['4', '4 personnes'], 4],
    [['1 gâteau', '8 parts'], 8],
    [{ '@type': 'QuantitativeValue', value: 5 }, 5],
  ])('%j → %d', (input, expected) => {
    expect(parseServings(input)).toBe(expected);
  });

  it.each([['1 gâteau'], ['12 crêpes'], ['20 cookies'], ['1 litre'], ['1 moule de 24 cm'], ['quelques personnes'], [''], [0], [120], ['120 personnes'], [null], [undefined], [[]], [true]])(
    '%j → null (pas un nombre de convives exploitable)',
    (input) => {
      expect(parseServings(input)).toBeNull();
    },
  );

  it('ne boucle pas sur une structure imbriquée trop profonde', () => {
    expect(parseServings([[[[['4']]]]])).toBeNull();
    expect(parseServings([[['4']]])).toBe(4);
  });
});
