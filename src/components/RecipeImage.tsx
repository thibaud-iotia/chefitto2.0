import { memo, useCallback, useEffect, type CSSProperties } from 'react';
import type { Recipe } from '../domain/types';
import { useApp } from '../store/storeContext';
import { DishImage } from './DishImage';

interface Props {
  recipe: Pick<Recipe, 'id' | 'imageUrl'>;
  size: number;
  /** Doit être stable (constante de module) : un objet recréé à chaque rendu annule la mémoïsation. */
  style?: CSSProperties;
  className?: string;
  eager?: boolean;
}

/**
 * Photo d'une recette. Sans photo, en lance la recherche automatique (une fois par session et par recette) ;
 * si la photo ne se charge plus, en cherche une autre. En attendant : l'image par défaut.
 * Mémoïsé : présent dans chaque carte, créneau et vignette, il ne se redessine que si la recette change.
 */
export const RecipeImage = memo(function RecipeImage({ recipe, ...rest }: Props) {
  const ensureRecipeImage = useApp((st) => st.ensureRecipeImage);
  const { id, imageUrl } = recipe;
  useEffect(() => {
    if (!imageUrl) void ensureRecipeImage(id);
  }, [id, imageUrl, ensureRecipeImage]);
  const onBroken = useCallback((src: string) => void ensureRecipeImage(id, src), [id, ensureRecipeImage]);
  return <DishImage {...rest} src={imageUrl} onBroken={onBroken} />;
});
