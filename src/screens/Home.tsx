import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { DishImage } from '../components/DishImage';
import { Heart, Search } from '../components/icons';
import {
  badgeTone,
  filterRecipes,
  formatTime,
  matchPct,
  plannedCount,
  rankBySuggestion,
  type CategoryFilter,
} from '../domain/logic';
import { SLOTS_PER_WEEK, type Recipe } from '../domain/types';
import { useApp } from '../store/storeContext';
import { Avatar, Badge, Tabs } from '../ui';
import s from './screens.module.css';

export default function Home() {
  const navigate = useNavigate();
  const { recipes, fridge, favorites, plan, profile, toggleFavorite } = useApp(
    useShallow((st) => ({
      recipes: st.recipes,
      fridge: st.fridge,
      favorites: st.favorites,
      plan: st.plan,
      profile: st.profile,
      toggleFavorite: st.toggleFavorite,
    })),
  );
  const [cat, setCat] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  const best = useMemo(() => rankBySuggestion(recipes, fridge)[0], [recipes, fridge]);
  const shown = useMemo(() => filterRecipes(recipes, { category: cat, query, favorites }), [recipes, cat, query, favorites]);
  const planned = plannedCount(plan, new Set(recipes.map((r) => r.id)));
  const firstName = profile.name.split(' ')[0] || 'chef';

  return (
    <main className={`${s.page} ${s.pageFlush}`}>
      <header className={s.homeHead}>
        <div>
          <p className={s.hello}>Bonjour {firstName}</p>
          <h1 className={s.homeTitle}>
            Que cuisine-t-on
            <br />
            ce soir&nbsp;?
          </h1>
        </div>
        <button type="button" className={s.avatarBtn} onClick={() => navigate('/profile', { replace: true })} aria-label="Mon profil">
          <Avatar name={profile.name} size="lg" ring />
        </button>
      </header>

      {best && (
        <button type="button" className={s.hero} onClick={() => navigate(`/recipe/${best.id}`)}>
          <div className={s.heroBody}>
            <span className={s.heroOver}>PRÊT AVEC VOTRE FRIGO</span>
            <span className={s.heroName}>{best.name}</span>
            <span style={{ fontSize: 14 }}>
              {matchPct(best, fridge)}% au frigo · <span className={s.mono}>{formatTime(best.timeMin)}</span>
            </span>
            <span className={s.heroCta}>Voir la recette</span>
          </div>
          <DishImage size={104} className={s.heroPlate} eager />
        </button>
      )}

      <div className={s.stats}>
        <Link to="/fridge" replace className={`${s.card} ${s.stat}`}>
          <span className={s.statValue}>{fridge.length}</span>
          <span className={s.statLabel}>aliments au frigo</span>
        </Link>
        <Link to="/planning" replace className={`${s.card} ${s.stat}`}>
          <span className={s.statValue}>
            {planned}
            <small>/{SLOTS_PER_WEEK}</small>
          </span>
          <span className={s.statLabel}>repas planifiés</span>
        </Link>
      </div>

      <div className={s.filters}>
        <label className={s.searchBox}>
          <Search />
          <span className="sr-only">Rechercher une recette</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une recette" />
        </label>
        <div className={s.tabsScroll}>
          <Tabs<CategoryFilter>
            label="Catégories"
            value={cat}
            onChange={setCat}
            tabs={[
              { value: 'all', label: 'Tout' },
              { value: 'Entrées', label: 'Entrées' },
              { value: 'Plats', label: 'Plats' },
              { value: 'Desserts', label: 'Desserts' },
              { value: 'Boissons', label: 'Boissons' },
              { value: 'fav', label: 'Favoris', count: favorites.length },
            ]}
          />
        </div>
      </div>

      {shown.length > 0 ? (
        <ul className={s.grid} style={{ listStyle: 'none', margin: 0 }} aria-label="Recettes">
          {shown.map((d) => (
            <DishCard
              key={d.id}
              recipe={d}
              pct={matchPct(d, fridge)}
              fav={favorites.includes(d.id)}
              onFav={() => toggleFavorite(d.id)}
            />
          ))}
        </ul>
      ) : (
        <p className={s.empty}>Aucune recette ici pour l'instant.</p>
      )}
    </main>
  );
}

function DishCard({ recipe, pct, fav, onFav }: { recipe: Recipe; pct: number; fav: boolean; onFav: () => void }) {
  return (
    <li className={`${s.card} ${s.clickable} ${s.dishCard}`}>
      <DishImage size={132} className={s.dishCardPlate} />
      <Link to={`/recipe/${recipe.id}`} className={s.dishCardLink} aria-label={recipe.name} />
      <button
        type="button"
        className={s.favBtn}
        onClick={onFav}
        aria-pressed={fav}
        aria-label={fav ? `Retirer ${recipe.name} des favoris` : `Ajouter ${recipe.name} aux favoris`}
      >
        <Heart filled={fav} />
      </button>
      <h2 className={s.dishName}>{recipe.name}</h2>
      <div className={s.dishMeta}>
        <Badge tone={badgeTone(pct)}>{pct}%</Badge>
        <span className={s.dishTime}>{formatTime(recipe.timeMin)}</span>
      </div>
    </li>
  );
}
