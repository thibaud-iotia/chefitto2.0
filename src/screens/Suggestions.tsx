import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { RecipeImage } from '../components/RecipeImage';
import { useBack } from '../components/hooks';
import { ChevronLeft } from '../components/icons';
import { formatTime, haveCount, matchPct, rankBySuggestion, ringTone } from '../domain/logic';
import { useApp } from '../store/storeContext';
import { IconButton, ProgressRing } from '../ui';
import s from './screens.module.css';

/** Constante : un objet recréé à chaque rendu annulerait la mémoïsation de `RecipeImage`. */
const PLATE_SHADOW = { boxShadow: '0 6px 16px rgba(20,20,28,.14)' } as const;

export default function Suggestions() {
  const back = useBack('/fridge');
  const { recipes, fridge } = useApp(useShallow((st) => ({ recipes: st.recipes, fridge: st.fridge })));
  const ranked = useMemo(() => rankBySuggestion(recipes, fridge), [recipes, fridge]);

  return (
    <main className={s.page} style={{ gap: 14 }}>
      <IconButton label="Retour" onClick={back}>
        <ChevronLeft />
      </IconButton>
      <div>
        <h1 className={s.title}>Suggestions</h1>
        <p className={s.subtitle}>Classées selon votre frigo.</p>
      </div>
      <ul className={s.list}>
        {ranked.map((d) => {
          const pct = matchPct(d, fridge);
          return (
            <li key={d.id}>
              <Link to={`/recipe/${d.id}`} className={`${s.card} ${s.clickable} ${s.sugItem}`}>
                <RecipeImage recipe={d} size={72} style={PLATE_SHADOW} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className={s.sugName}>{d.name}</p>
                  <p className={s.sugMeta}>
                    {haveCount(d, fridge)}/{d.ingredients.length} ingrédients · <span className={s.mono}>{formatTime(d.timeMin)}</span>
                  </p>
                </div>
                <ProgressRing value={pct} tone={ringTone(pct)} />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
