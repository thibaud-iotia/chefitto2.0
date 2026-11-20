import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { RecipeImage } from '../components/RecipeImage';
import { useBack } from '../components/hooks';
import { ChevronLeft, Heart } from '../components/icons';
import { formatTime, hasIngredient } from '../domain/logic';
import { MAX_SERVINGS, MIN_SERVINGS, scaleIngredient, servingsFactor, servingsLabel } from '../domain/servings';
import { useApp } from '../store/storeContext';
import { Badge, Button, IconButton, ProgressBar, Stepper } from '../ui';
import s from './screens.module.css';

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const back = useBack();
  const { recipe, fridge, household, fav, toggleFavorite, openSheet } = useApp(
    useShallow((st) => ({
      recipe: st.recipes.find((r) => r.id === id),
      fridge: st.fridge,
      household: st.profile.household,
      fav: !!id && st.favorites.includes(id),
      toggleFavorite: st.toggleFavorite,
      openSheet: st.openSheet,
    })),
  );
  // Nombre de personnes choisi sur cette fiche ; à défaut, la taille du foyer (Profil).
  const [chosen, setChosen] = useState<number | null>(null);
  const servings = chosen ?? household;
  const factor = recipe ? servingsFactor(recipe.servings, servings) : 1;
  // Le recalcul n'affecte que l'affichage ; la correspondance avec le frigo utilise le texte d'origine.
  const ingredients = useMemo(
    () => (recipe?.ingredients ?? []).map((name) => ({ name, shown: scaleIngredient(name, factor), ok: hasIngredient(fridge, name) })),
    [recipe, factor, fridge],
  );
  if (!recipe) return <Navigate to="/home" replace />;

  const have = ingredients.filter((i) => i.ok).length;
  const pct = Math.round((have / Math.max(1, recipe.ingredients.length)) * 100);
  const adjusted = ingredients.some((i) => i.shown !== i.name);

  return (
    <>
      <main className={`${s.page} ${s.pageFlush} ${s.pageWithBar}`} style={{ paddingTop: 0 }}>
        <div className={s.detailHero}>
          <IconButton label="Retour" className={s.detailBack} onClick={back}>
            <ChevronLeft />
          </IconButton>
          <IconButton
            label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={fav}
            className={s.detailFav}
            onClick={() => toggleFavorite(recipe.id)}
          >
            <Heart filled={fav} size={18} />
          </IconButton>
          <RecipeImage recipe={recipe} size={250} className={s.detailPlate} eager />
        </div>
        <div className={s.detailBody}>
          <div>
            <p className={s.detailCat}>{recipe.category}</p>
            <h1 className={s.detailName}>{recipe.name}</h1>
          </div>
          <dl className={s.facts}>
            <div className={s.fact}>
              <dt>Temps</dt>
              <dd className={s.mono}>{formatTime(recipe.timeMin)}</dd>
            </div>
            <div className={s.fact}>
              <dt>Niveau</dt>
              <dd>{recipe.level}</dd>
            </div>
            <div className={s.fact}>
              <dt>Coût</dt>
              <dd className={s.mono}>{recipe.price}</dd>
            </div>
          </dl>
          <p className={s.desc}>{recipe.description}</p>
          <section className={`${s.card} ${s.ingCard}`} aria-labelledby="ing-title">
            <div className={s.ingHead}>
              <h2 id="ing-title" className={s.h3}>
                Ingrédients
              </h2>
              <span className={s.ingCount}>
                {have}/{recipe.ingredients.length} au frigo
              </span>
            </div>
            <div className={s.servingsRow}>
              <span className={s.servingsLabel}>Pour</span>
              <Stepper
                label="Nombre de personnes"
                value={servings}
                min={MIN_SERVINGS}
                max={MAX_SERVINGS}
                onChange={setChosen}
                format={servingsLabel}
                decLabel="Une personne de moins"
                incLabel="Une personne de plus"
              />
            </div>
            {adjusted && (
              <p className={s.servingsNote}>
                Quantités recalculées · recette prévue pour {servingsLabel(recipe.servings)}{' '}
                <button type="button" className={s.linkBtn} onClick={() => setChosen(recipe.servings)}>
                  Revenir à {recipe.servings}
                </button>
              </p>
            )}
            <ProgressBar value={pct} tone="accent" label="Ingrédients disponibles" />
            <ul className={s.ingList}>
              {ingredients.map(({ name, shown, ok }, i) => {
                return (
                  <li key={`${name}-${i}`} className={s.ingRow}>
                    <span className={s.ingMark} style={{ background: ok ? 'var(--green-400)' : 'var(--gray-200)' }} aria-hidden="true">
                      {ok ? '✓' : ''}
                    </span>
                    <span className={s.ingName}>{shown}</span>
                    <Badge tone={ok ? 'success' : 'neutral'}>{ok ? 'Au frigo' : 'À acheter'}</Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </main>
      <div className={s.actionBar} role="group" aria-label="Actions de la recette">
        <div style={{ flex: 1 }}>
          <Button variant="outline" size="lg" block className={s.btnSolid} onClick={() => openSheet({ type: 'plan', recipeId: recipe.id })}>
            Planifier
          </Button>
        </div>
        <div style={{ flex: 2 }}>
          <Button size="lg" block onClick={() => navigate(`/recipe/${recipe.id}/cook`)}>
            Commencer à cuisiner
          </Button>
        </div>
      </div>
    </>
  );
}
