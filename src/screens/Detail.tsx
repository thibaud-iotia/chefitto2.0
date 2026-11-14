import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { RecipeImage } from '../components/RecipeImage';
import { useBack } from '../components/hooks';
import { ChevronLeft, Heart } from '../components/icons';
import { formatTime, hasIngredient, haveCount } from '../domain/logic';
import { useApp } from '../store/storeContext';
import { Badge, Button, IconButton, ProgressBar } from '../ui';
import s from './screens.module.css';

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const back = useBack();
  const { recipe, fridge, fav, toggleFavorite, openSheet } = useApp(
    useShallow((st) => ({
      recipe: st.recipes.find((r) => r.id === id),
      fridge: st.fridge,
      fav: !!id && st.favorites.includes(id),
      toggleFavorite: st.toggleFavorite,
      openSheet: st.openSheet,
    })),
  );
  if (!recipe) return <Navigate to="/home" replace />;

  const have = haveCount(recipe, fridge);
  const pct = Math.round((have / Math.max(1, recipe.ingredients.length)) * 100);

  return (
    <>
      <main className={`${s.page} ${s.pageFlush}`} style={{ paddingTop: 0 }}>
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
            <ProgressBar value={pct} tone="accent" label="Ingrédients disponibles" />
            <ul className={s.ingList}>
              {recipe.ingredients.map((name, i) => {
                const ok = hasIngredient(fridge, name);
                return (
                  <li key={`${name}-${i}`} className={s.ingRow}>
                    <span className={s.ingMark} style={{ background: ok ? 'var(--green-400)' : 'var(--gray-200)' }} aria-hidden="true">
                      {ok ? '✓' : ''}
                    </span>
                    <span className={s.ingName}>{name}</span>
                    <Badge tone={ok ? 'success' : 'neutral'}>{ok ? 'Au frigo' : 'À acheter'}</Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </main>
      <div className={s.actionBar}>
        <div style={{ flex: 1 }}>
          <Button variant="outline" size="lg" block onClick={() => openSheet({ type: 'plan', recipeId: recipe.id })}>
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
