import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDayLong,
  formatDayMedium,
  formatDayShort,
  isIsoDate,
  lastPlannableWeek,
  PLAN_WEEKS_AHEAD,
  relativeWeek,
  toIsoDate,
  weekDates,
  weekLabel,
  weekOffset,
  weekStart,
  weekdayOf,
} from './calendar';

describe('dates du planning', () => {
  it('date locale, jamais UTC (soirée en France = même jour)', () => {
    expect(toIsoDate(new Date(2026, 10, 20, 23, 59))).toBe('2026-11-20');
    expect(toIsoDate(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('valide une vraie date du calendrier', () => {
    expect(isIsoDate('2026-11-20')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
    expect(isIsoDate('0-0')).toBe(false);
    expect(isIsoDate(20261120)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it('ajoute des jours à travers mois, années et changements d’heure', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    // Passage à l'heure d'été (29 mars 2026) et d'hiver (25 oct. 2026) : journées de 23 h / 25 h.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysBetween('2026-03-23', '2026-03-30')).toBe(7);
    expect(daysBetween('2026-10-26', '2026-10-19')).toBe(-7);
  });

  it('refuse une date mal formée', () => {
    expect(() => addDays('demain', 1)).toThrow(RangeError);
  });

  it('semaines du lundi au dimanche', () => {
    expect(weekdayOf('2026-11-16')).toBe(0); // lundi
    expect(weekdayOf('2026-11-22')).toBe(6); // dimanche
    expect(weekStart('2026-11-20')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
    expect(weekDates('2026-11-30')).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ]);
  });

  it('écart en semaines et horizon de planification', () => {
    const today = '2026-11-20'; // vendredi
    expect(weekOffset('2026-11-16', today)).toBe(0);
    expect(weekOffset('2026-11-22', today)).toBe(0);
    expect(weekOffset('2026-11-23', today)).toBe(1);
    expect(weekOffset('2026-11-15', today)).toBe(-1);
    expect(weekOffset('2026-10-26', today)).toBe(-3); // à travers le changement d'heure
    expect(PLAN_WEEKS_AHEAD).toBe(3);
    expect(lastPlannableWeek(today)).toBe('2026-12-07');
    expect(weekOffset(lastPlannableWeek(today), today)).toBe(PLAN_WEEKS_AHEAD);
  });

  it('libellés français', () => {
    expect(formatDayLong('2026-11-23')).toBe('Lundi 23 novembre');
    expect(formatDayLong('2026-08-01')).toBe('Samedi 1 août');
    expect(formatDayMedium('2027-02-07')).toBe('Dimanche 7 févr.');
    expect(formatDayShort('2026-11-25')).toBe('Mercredi 25');
  });

  it('libellé de semaine : même mois, deux mois, deux années', () => {
    expect(weekLabel('2026-11-23')).toBe('Semaine du 23 au 29 nov.');
    expect(weekLabel('2026-11-30')).toBe('Semaine du 30 nov. au 6 déc.');
    expect(weekLabel('2026-12-28')).toBe('Semaine du 28 déc. 2026 au 3 janv. 2027');
  });

  it('semaine relative', () => {
    expect(relativeWeek(0)).toBe('cette semaine');
    expect(relativeWeek(1)).toBe('la semaine prochaine');
    expect(relativeWeek(3)).toBe('dans 3 semaines');
    expect(relativeWeek(-1)).toBe('la semaine dernière');
    expect(relativeWeek(-4)).toBe('il y a 4 semaines');
  });
});
