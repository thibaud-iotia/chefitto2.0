import { foodIcon } from '../domain/foodIcons';
import type { FoodCategory } from '../domain/types';
import s from './foodIcon.module.css';

/**
 * Image d'un aliment (emoji). Décorative : le nom est toujours écrit à côté, donc masquée aux lecteurs
 * d'écran pour ne pas lire « tomate Tomate ».
 */
export function FoodIcon({ name, category, size = 'sm' }: { name: string; category: FoodCategory; size?: 'sm' | 'md' }) {
  return (
    <span className={`${s.icon} ${s[size]}`} aria-hidden="true" data-testid="food-icon">
      {foodIcon(name, category)}
    </span>
  );
}
