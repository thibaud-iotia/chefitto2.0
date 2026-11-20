import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { RecipeImage } from '../components/RecipeImage';
import { BottomSheet } from '../components/Shell';
import { useLongPress } from '../components/hooks';
import { Check, Close, Heart, Pencil, Search, Trash } from '../components/icons';
import { toIsoDate, weekDates, weekStart } from '../domain/calendar';
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
import { Avatar, Badge, IconButton, Tabs } from '../ui';
import s from './screens.module.css';

export default function Home() {
  const navigate = useNavigate();
  const { recipes, fridge, favorites, plan, profile, toggleFavorite, deleteRecipes, flash } = useApp(
    useShallow((st) => ({
      recipes: st.recipes,
      fridge: st.fridge,
      favorites: st.favorites,
      plan: st.plan,
      profile: st.profile,
      toggleFavorite: st.toggleFavorite,
      deleteRecipes: st.deleteRecipes,
      flash: st.flash,
    })),
  );
  const [cat, setCat] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  // Sélection par appui long : on est en mode sélection tant qu'au moins une recette est cochée.
  const [picked, setPicked] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ids = useMemo(() => new Set(recipes.map((r) => r.id)), [recipes]);
  const selected = useMemo(() => picked.filter((id) => ids.has(id)), [picked, ids]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const selecting = selected.length > 0;

  // Score frigo calculé une fois par recette et par version du frigo : les cartes reçoivent un nombre stable.
  const pcts = useMemo(() => new Map(recipes.map((r) => [r.id, matchPct(r, fridge)])), [recipes, fridge]);
  const best = useMemo(() => rankBySuggestion(recipes, fridge)[0], [recipes, fridge]);
  // Saisie et onglets répondent tout de suite même avec beaucoup de recettes : la liste suit en priorité basse
  // (rendu interruptible, la frappe suivante passe devant).
  const deferredQuery = useDeferredValue(query);
  const deferredCat = useDeferredValue(cat);
  const shown = useMemo(
    () => filterRecipes(recipes, { category: deferredCat, query: deferredQuery, favorites }),
    [recipes, deferredCat, deferredQuery, favorites],
  );
  // Semaine en cours : la carte ouvre le planning sur aujourd'hui.
  const planned = plannedCount(plan, weekDates(weekStart(toIsoDate())), ids);
  const firstName = profile.name.split(' ')[0] || 'chef';
  const single = selected.length === 1 ? recipes.find((r) => r.id === selected[0]) : undefined;
  const inPlan = confirming && Object.values(plan).some((id) => selectedSet.has(id));

  // Callbacks stables (id en paramètre) : une carte mémoïsée ne se redessine que si ses données changent.
  const openRecipe = useCallback((id: string) => navigate(`/recipe/${id}`), [navigate]);
  const startSelection = useCallback((id: string) => {
    setPicked((p) => (p.includes(id) ? p : [...p, id]));
    setFocusId(id);
  }, []);
  const toggleSelection = useCallback((id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])), []);
  const clearSelection = () => {
    setPicked([]);
    setConfirming(false);
  };
  // Changer de filtre vide la sélection : on ne supprime jamais une recette qu'on ne voit plus.
  const unpick = () => setPicked((p) => (p.length ? [] : p));
  const changeCategory = (c: CategoryFilter) => {
    setCat(c);
    unpick();
  };
  const changeQuery = (q: string) => {
    setQuery(q);
    unpick();
  };

  // Échap quitte le mode sélection (si la confirmation est ouverte, Échap la ferme d'abord).
  useEffect(() => {
    if (!selecting || confirming) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicked([]);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, confirming]);

  async function removeSelected() {
    const ids = selected;
    setConfirming(false);
    if (!(await deleteRecipes(ids))) return; // échec : message du store, sélection conservée
    setPicked([]);
    flash(ids.length === 1 ? 'Recette supprimée' : `${ids.length} recettes supprimées`);
  }

  return (
    <>
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
            <RecipeImage recipe={best} size={104} className={s.heroPlate} eager />
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
            <input type="search" value={query} onChange={(e) => changeQuery(e.target.value)} placeholder="Rechercher une recette" />
          </label>
          <div className={s.tabsScroll}>
            <Tabs<CategoryFilter>
              label="Catégories"
              value={cat}
              onChange={changeCategory}
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
          <>
            <p id="dish-hint" className="sr-only">
              Appui long, ou menu contextuel, sur une recette pour la sélectionner, puis la modifier ou la supprimer.
            </p>
            <ul className={s.grid} style={{ listStyle: 'none', margin: 0 }} aria-label="Recettes" aria-describedby="dish-hint">
              {shown.map((d) => (
                <DishCard
                  key={d.id}
                  recipe={d}
                  pct={pcts.get(d.id) ?? 0}
                  fav={favSet.has(d.id)}
                  onFav={toggleFavorite}
                  onOpen={openRecipe}
                  selecting={selecting}
                  selected={selectedSet.has(d.id)}
                  autoFocus={focusId === d.id}
                  onLongPress={startSelection}
                  onToggle={toggleSelection}
                />
              ))}
            </ul>
          </>
        ) : (
          <p className={s.empty}>Aucune recette ici pour l'instant.</p>
        )}
      </main>

      {selecting && (
        <div className={s.selectBar} role="group" aria-label="Recettes sélectionnées">
          <IconButton label="Annuler la sélection" onClick={clearSelection}>
            <Close />
          </IconButton>
          <span className={s.selectCount} aria-live="polite">
            {selected.length} sélectionnée{selected.length > 1 ? 's' : ''}
          </span>
          <IconButton
            label="Modifier"
            className={s.selectBtn}
            disabled={!single}
            onClick={() => single && navigate(`/recipe/${single.id}/edit`)}
          >
            <Pencil size={20} />
          </IconButton>
          <IconButton label="Supprimer" className={`${s.selectBtn} ${s.selectBtnDanger}`} onClick={() => setConfirming(true)}>
            <Trash size={20} />
          </IconButton>
        </div>
      )}

      <BottomSheet
        open={confirming && selecting}
        title={single ? `Supprimer « ${single.name} » ?` : `Supprimer ${selected.length} recettes ?`}
        onClose={() => setConfirming(false)}
        items={[
          {
            key: 'confirm',
            label: 'Supprimer définitivement',
            // Prévenir quand la suppression vide aussi des repas du planning.
            sub: inPlan ? `retirée${single ? '' : 's'} du planning` : 'irréversible',
            subColor: 'var(--red-600)',
            onPick: () => void removeSelected(),
          },
          { key: 'cancel', label: 'Annuler', onPick: () => setConfirming(false) },
        ]}
      />
    </>
  );
}

/** Les callbacks reçoivent l'id de la recette et doivent être stables (mémoïsation de la carte). */
interface DishCardProps {
  recipe: Recipe;
  pct: number;
  fav: boolean;
  onFav: (id: string) => void;
  /** Ouvre la fiche de la recette. */
  onOpen: (id: string) => void;
  /** Mode sélection : un appui coche / décoche la carte au lieu d'ouvrir la recette. */
  selecting: boolean;
  selected: boolean;
  /** Carte à l'origine de la sélection : garde le focus clavier quand le lien devient une case à cocher. */
  autoFocus: boolean;
  onLongPress: (id: string) => void;
  onToggle: (id: string) => void;
}

const DishCard = memo(function DishCard({ recipe, pct, fav, onFav, onOpen, selecting, selected, autoFocus, onLongPress, onToggle }: DishCardProps) {
  const { id } = recipe;
  const press = useLongPress(() => onLongPress(id));
  return (
    <li className={`${s.card} ${s.clickable} ${s.dishCard} ${selected ? s.dishCardSelected : ''}`} {...press}>
      <RecipeImage recipe={recipe} size={132} className={s.dishCardPlate} />
      {selecting ? (
        <button type="button" className={s.dishCardLink} aria-pressed={selected} aria-label={recipe.name} autoFocus={autoFocus} onClick={() => onToggle(id)} />
      ) : (
        // Pas de vrai <a href> : sur iPhone, l'appui long sur un lien ouvre l'aperçu de Safari
        // (-webkit-touch-callout n'y fait rien) au lieu de sélectionner la carte.
        <div
          role="link"
          tabIndex={0}
          className={s.dishCardLink}
          aria-label={recipe.name}
          onClick={() => onOpen(id)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            onOpen(id);
          }}
        />
      )}
      {selecting ? (
        <span className={s.selectMark} aria-hidden="true">
          {selected && <Check />}
        </span>
      ) : (
        <button
          type="button"
          className={s.favBtn}
          onClick={() => onFav(id)}
          aria-pressed={fav}
          aria-label={fav ? `Retirer ${recipe.name} des favoris` : `Ajouter ${recipe.name} aux favoris`}
        >
          <Heart filled={fav} />
        </button>
      )}
      <h2 className={s.dishName}>{recipe.name}</h2>
      <div className={s.dishMeta}>
        <Badge tone={badgeTone(pct)}>{pct}%</Badge>
        <span className={s.dishTime}>{formatTime(recipe.timeMin)}</span>
      </div>
    </li>
  );
});
