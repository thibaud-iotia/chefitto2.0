import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { RecipeImage } from '../components/RecipeImage';
import { dayHasMeal, planKey, plannedCount, weekdayIndex } from '../domain/logic';
import { DAYS, MEALS, SLOTS_PER_WEEK } from '../domain/types';
import { useApp } from '../store/storeContext';
import { Button } from '../ui';
import s from './screens.module.css';

export default function Planning() {
  const { recipes, plan, openSheet } = useApp(useShallow((st) => ({ recipes: st.recipes, plan: st.plan, openSheet: st.openSheet })));
  const [day, setDay] = useState(() => weekdayIndex());
  const ids = new Set(recipes.map((r) => r.id));

  return (
    <main className={s.page}>
      <div>
        <h1 className={s.title}>Planning</h1>
        <p className={s.subtitle}>
          {plannedCount(plan, ids)} repas sur {SLOTS_PER_WEEK} cette semaine
        </p>
      </div>
      <div className={s.days} role="tablist" aria-label="Jours de la semaine">
        {DAYS.map((name, i) => {
          const on = day === i;
          const filled = dayHasMeal(plan, i);
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={name}
              className={`${s.dayChip} ${on ? s.dayChipOn : ''}`}
              onClick={() => setDay(i)}
            >
              {name.slice(0, 3)}
              <span className={s.dayDot} style={{ background: filled ? (on ? '#fff' : 'var(--green-400)') : 'transparent' }} />
            </button>
          );
        })}
      </div>
      <h2 className={s.h3} style={{ fontSize: 20 }}>
        {DAYS[day]}
      </h2>
      {MEALS.map((meal, i) => {
        const dish = recipes.find((r) => r.id === plan[planKey(day, i)]);
        return (
          <div key={meal} className={`${s.card} ${s.slot}`} data-testid={`slot-${i}`}>
            {dish ? (
              <RecipeImage recipe={dish} size={72} />
            ) : (
              <div className={s.slotEmpty} aria-hidden="true">
                +
              </div>
            )}
            <div className={s.slotBody}>
              <p className={s.overline}>{meal}</p>
              <p className={`${s.slotDish} ${dish ? '' : s.slotDishNone}`}>{dish ? dish.name : 'Rien de prévu'}</p>
            </div>
            <Button
              size="sm"
              variant={dish ? 'outline' : 'primary'}
              onClick={() => openSheet({ type: 'pick', day, meal: i })}
              aria-label={`${dish ? 'Changer' : 'Choisir'} le repas du ${DAYS[day]} ${meal.toLowerCase()}`}
            >
              {dish ? 'Changer' : 'Choisir'}
            </Button>
          </div>
        );
      })}
    </main>
  );
}
