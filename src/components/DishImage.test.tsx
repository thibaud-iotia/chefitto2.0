import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DishImage } from './DishImage';

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
});
