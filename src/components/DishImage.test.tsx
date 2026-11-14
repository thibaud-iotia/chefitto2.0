import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DishImage } from './DishImage';

const AF = 'https://assets.afcdn.com/recipe/20200512/111023_w225h225c1cx960cy540cxt0cyt0cxb1920cyb1080.webp';

describe('DishImage', () => {
  it('essaie WebP, puis PNG, puis l’illustration de secours', () => {
    const { container } = render(<DishImage size={100} eager />);
    const img = () => container.querySelector('img');
    expect(img()!.getAttribute('src')).toMatch(/dish\.webp$/);
    expect(img()!.getAttribute('loading')).toBe('eager');
    fireEvent.error(img()!);
    expect(img()!.getAttribute('src')).toMatch(/dish1\.png$/);
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(container.textContent).toContain('🍽️');
  });

  it('affiche la photo de la recette, redimensionnée par le CDN, sans Referer', () => {
    const { container } = render(<DishImage size={132} src={AF} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toContain('_w180h180c1cx960');
    expect(img.getAttribute('srcset')).toMatch(/w180h180.* 1x, .*w300h300.* 2x, .*w420h420.* 3x$/);
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img).toHaveStyle({ objectFit: 'cover' });
    expect(container.firstElementChild).toHaveAttribute('data-photo', 'true');
  });

  it('photo d’un autre site : URL telle quelle, sans srcset', () => {
    const { container } = render(<DishImage size={72} src="https://img.test/a.jpg" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://img.test/a.jpg');
    expect(img.hasAttribute('srcset')).toBe(false);
  });

  it('photo cassée : prévient et bascule sur l’image par défaut, puis accepte une nouvelle photo', () => {
    const onBroken = vi.fn();
    const { container, rerender } = render(<DishImage size={72} src="https://img.test/a.jpg" onBroken={onBroken} />);
    fireEvent.error(container.querySelector('img')!);
    expect(onBroken).toHaveBeenCalledWith('https://img.test/a.jpg');
    expect(container.querySelector('img')!.getAttribute('src')).toMatch(/dish\.webp$/);
    expect(container.firstElementChild).not.toHaveAttribute('data-photo');

    rerender(<DishImage size={72} src="https://img.test/b.jpg" onBroken={onBroken} />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://img.test/b.jpg');
  });
});
