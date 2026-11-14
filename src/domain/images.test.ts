import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_URL_LENGTH, imageQueries, imageSrcSet, safeImageUrl, sizedImageUrl } from './images';

const AF = 'https://assets.afcdn.com/recipe/20200512/111023_w225h225c1cx960cy540cxt0cyt0cxb1920cyb1080.webp';
const AF_WIDE = 'https://assets.afcdn.com/recipe/20230621/143663_w1920h1080cx960cy540cxt0cyt0cxb1920cyb1080.webp';

describe('safeImageUrl', () => {
  it('accepte https et promeut http en https', () => {
    expect(safeImageUrl(AF)).toBe(AF);
    expect(safeImageUrl('  http://img.example.com/a.jpg ')).toBe('https://img.example.com/a.jpg');
  });

  it('refuse le reste', () => {
    for (const bad of [
      null,
      undefined,
      42,
      '',
      'pas une url',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'ftp://img.example.com/a.jpg',
      'https://user:pw@img.example.com/a.jpg',
      'https://localhost/a.jpg',
      `https://img.example.com/${'a'.repeat(MAX_IMAGE_URL_LENGTH)}`,
    ]) {
      expect(safeImageUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe('sizedImageUrl / imageSrcSet', () => {
  it('redimensionne les images du CDN Marmiton (carré, multiple de 60 px, borné)', () => {
    expect(sizedImageUrl(AF, 132)).toBe(AF.replace('w225h225c1', 'w180h180c1'));
    expect(sizedImageUrl(AF, 10)).toContain('_w60h60c1cx960');
    expect(sizedImageUrl(AF, 5000)).toContain('_w1200h1200c1cx960');
    // Image large sans recadrage : on ajoute le recadrage carré centré.
    expect(sizedImageUrl(AF_WIDE, 250)).toBe(AF_WIDE.replace('w1920h1080cx960', 'w300h300c1cx960'));
  });

  it('laisse les autres URL intactes', () => {
    const other = 'https://static.750g.com/images/1200-675/abc/crepes.png';
    expect(sizedImageUrl(other, 100)).toBe(other);
    expect(imageSrcSet(other, 100)).toBeUndefined();
    const origin = 'https://assets.afcdn.com/recipe/20200512/111023_origincxt0cyt0cxb1920cyb1080.jpg';
    expect(sizedImageUrl(origin, 100)).toBe(origin);
  });

  it('srcset 1x / 2x / 3x', () => {
    expect(imageSrcSet(AF, 72)).toBe(
      [AF.replace('w225h225', 'w120h120') + ' 1x', AF.replace('w225h225', 'w180h180') + ' 2x', AF.replace('w225h225', 'w240h240') + ' 3x'].join(
        ', ',
      ),
    );
  });
});

describe('imageQueries', () => {
  it('nom du plat puis deux premiers ingrédients', () => {
    expect(imageQueries({ name: ' Veggie   tomato mix ', ingredients: ['Tomate', 'Basilic', 'Oignon'] })).toEqual([
      'Veggie tomato mix',
      'Tomate Basilic',
    ]);
  });

  it('ignore les ingrédients vides ou trop longs et les doublons', () => {
    expect(imageQueries({ name: 'Tomate', ingredients: ['tomate'] })).toEqual(['Tomate']);
    expect(imageQueries({ name: 'Pizza', ingredients: ['—'] })).toEqual(['Pizza']);
    expect(imageQueries({ name: 'X', ingredients: ['a'.repeat(41), 'Riz'] })).toEqual(['Riz']);
    expect(imageQueries({ name: 'a'.repeat(120), ingredients: [] })[0]).toHaveLength(80);
  });
});
