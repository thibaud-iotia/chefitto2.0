import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { RecipeImage } from '../components/RecipeImage';
import { WeekNav } from '../components/WeekNav';
import {
  addDays,
  formatDayLong,
  lastPlannableWeek,
  relativeWeek,
  toIsoDate,
  weekDates,
  weekOffset,
  weekStart,
  weekdayOf,
  type IsoDate,
} from '../domain/calendar';
import { dayHasMeal, planKey, plannedCount } from '../domain/logic';
import { DAYS, MEALS, SLOTS_PER_WEEK } from '../domain/types';
import { useApp } from '../store/storeContext';
import { Button } from '../ui';
import s from './screens.module.css';

export default function Planning() {
  const { recipes, plan, openSheet } = useApp(useShallow((st) => ({ recipes: st.recipes, plan: st.plan, openSheet: st.openSheet })));
  const today = toIsoDate();
  // Jour sélectionné ; la semaine affichée est celle qui le contient.
  const [selected, setSelected] = useState<IsoDate>(today);
  const week = weekStart(selected);
  const dates = weekDates(week);
  const offset = weekOffset(week, today);
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const ids = useMemo(() => new Set(byId.keys()), [byId]);

  // Changer de semaine garde le même jour de la semaine (mardi → mardi suivant).
  const goToWeek = (monday: IsoDate) => setSelected(addDays(monday, weekdayOf(selected)));

  return (
    <main className={s.page}>
      <div className={s.planHead}>
        <div>
          <h1 className={s.title}>Planning</h1>
          <p className={s.subtitle}>
            {plannedCount(plan, dates, ids)} repas sur {SLOTS_PER_WEEK} {relativeWeek(offset)}
          </p>
        </div>
        {offset !== 0 && (
          <Button size="sm" variant="outline" onClick={() => setSelected(today)}>
            Aujourd'hui
          </Button>
        )}
      </div>
      <WeekNav week={week} max={lastPlannableWeek(today)} onChange={goToWeek} />
      <div className={s.days} role="tablist" aria-label="Jours de la semaine">
        {dates.map((date, i) => {
          const on = date === selected;
          const filled = dayHasMeal(plan, date);
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={formatDayLong(date)}
              aria-current={date === today ? 'date' : undefined}
              data-past={date < today || undefined}
              className={`${s.dayChip} ${on ? s.dayChipOn : ''}`}
              onClick={() => setSelected(date)}
            >
              {DAYS[i]!.slice(0, 3)}
              <span className={s.dayNum}>{Number(date.slice(8))}</span>
              <span className={s.dayDot} style={{ background: filled ? (on ? '#fff' : 'var(--green-400)') : 'transparent' }} />
            </button>
          );
        })}
      </div>
      <h2 className={s.h3} style={{ fontSize: 20 }}>
        {formatDayLong(selected)}
      </h2>
      {MEALS.map((meal, i) => {
        const id = plan[planKey(selected, i)];
        const dish = id ? byId.get(id) : undefined;
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
              onClick={() => openSheet({ type: 'pick', date: selected, meal: i })}
              aria-label={`${dish ? 'Changer' : 'Choisir'} le repas du ${formatDayLong(selected)} ${meal.toLowerCase()}`}
            >
              {dish ? 'Changer' : 'Choisir'}
            </Button>
          </div>
        );
      })}
    </main>
  );
}
