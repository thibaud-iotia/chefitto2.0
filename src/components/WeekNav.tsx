import { addDays, weekLabel, type IsoDate } from '../domain/calendar';
import { IconButton } from '../ui';
import { ChevronLeft, ChevronRight } from './icons';
import s from './weekNav.module.css';

interface WeekNavProps {
  /** Lundi de la semaine affichée. */
  week: IsoDate;
  onChange: (week: IsoDate) => void;
  /** Lundi de la première / dernière semaine accessible (sans limite si absent). */
  min?: IsoDate;
  max?: IsoDate;
}

/**
 * ‹ Semaine du 23 au 29 nov. ›
 * Aux bornes, les flèches sont `aria-disabled` plutôt que `disabled` : le focus clavier reste sur le bouton
 * qu'on vient d'utiliser au lieu de retomber au début de la page.
 */
export function WeekNav({ week, onChange, min, max }: WeekNavProps) {
  const canPrev = !min || week > min;
  const canNext = !max || week < max;
  return (
    <div className={s.nav} role="group" aria-label="Choix de la semaine">
      <IconButton
        label="Semaine précédente"
        className={s.arrow}
        aria-disabled={!canPrev}
        onClick={() => canPrev && onChange(addDays(week, -7))}
      >
        <ChevronLeft />
      </IconButton>
      <p className={s.label} aria-live="polite">
        {weekLabel(week)}
      </p>
      <IconButton
        label="Semaine suivante"
        className={s.arrow}
        aria-disabled={!canNext}
        onClick={() => canNext && onChange(addDays(week, 7))}
      >
        <ChevronRight />
      </IconButton>
    </div>
  );
}
