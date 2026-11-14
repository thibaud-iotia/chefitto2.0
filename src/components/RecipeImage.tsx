import { useEffect, type CSSProperties } from 'react';
import type { Recipe } from '../domain/types';
import { useApp } from '../store/storeContext';
import { DishImage } from './DishImage';

interface Props {
  recipe: Pick<Recipe, 'id' | 'imageUrl'>;
  size: number;
  style?: CSSProperties;
  className?: string;
  eager?: boolean;
}

/**
 * Photo d'une recette. Sans photo, en lance la recherche automatique (une fois par session et par recette) ;
 * si la photo ne se charge plus, en cherche une autre. En attendant : l'image par défaut.
 */
export function RecipeImage({ recipe, ...rest }: Props) {
  const ensureRecipeImage = useApp((st) => st.ensureRecipeImage);
  const { id, imageUrl } = recipe;
  useEffect(() => {
    if (!imageUrl) void ensureRecipeImage(id);
  }, [id, imageUrl, ensureRecipeImage]);
  return <DishImage {...rest} src={imageUrl} onBroken={(src) => void ensureRecipeImage(id, src)} />;
}
