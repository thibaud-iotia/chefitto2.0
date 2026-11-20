/**
 * Dates du planning : chaînes locales « AAAA-MM-JJ ».
 *
 * Jamais de `toISOString()` (UTC : décale d'un jour le soir en France) ni d'arithmétique en millisecondes
 * sur l'heure locale (journées de 23 h / 25 h aux changements d'heure) : les calculs passent par `Date.UTC`.
 */
export type IsoDate = string;

/** Semaines planifiables après la semaine en cours (semaine en cours + 3 = 4 semaines). */
export const PLAN_WEEKS_AHEAD = 3;

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const;
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

interface Parts {
  y: number;
  m: number; // 1-12
  d: number;
}

function parts(iso: IsoDate): Parts {
  const match = ISO_RE.exec(iso);
  if (!match) throw new RangeError(`Date invalide : ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const utc = ({ y, m, d }: Parts) => Date.UTC(y, m - 1, d);

function fromUtc(ms: number): IsoDate {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Date locale du jour (ou de `date`) au format « AAAA-MM-JJ ». */
export function toIsoDate(date: Date = new Date()): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Vraie date du calendrier au bon format (refuse « 2026-02-30 »). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  return fromUtc(utc(parts(value))) === value;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const p = parts(iso);
  return fromUtc(Date.UTC(p.y, p.m - 1, p.d + days));
}

/** Nombre de jours de `from` à `to` (négatif si `to` est avant). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utc(parts(to)) - utc(parts(from))) / 86_400_000);
}

/** Lundi = 0 … Dimanche = 6. */
export function weekdayOf(iso: IsoDate): number {
  return (new Date(utc(parts(iso))).getUTCDay() + 6) % 7;
}

/** Lundi de la semaine de `iso`. */
export function weekStart(iso: IsoDate): IsoDate {
  return addDays(iso, -weekdayOf(iso));
}

/** Les 7 dates de la semaine commençant le lundi `start`. */
export function weekDates(start: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Écart en semaines entre la semaine de `today` et celle de `iso` (0 = cette semaine, 1 = la suivante, -1 = la précédente). */
export function weekOffset(iso: IsoDate, today: IsoDate): number {
  return Math.round(daysBetween(weekStart(today), weekStart(iso)) / 7);
}

/** Lundi de la dernière semaine planifiable. */
export function lastPlannableWeek(today: IsoDate): IsoDate {
  return addDays(weekStart(today), 7 * PLAN_WEEKS_AHEAD);
}

/** « Lundi 23 novembre » */
export function formatDayLong(iso: IsoDate): string {
  const { m, d } = parts(iso);
  return `${DAY_NAMES[weekdayOf(iso)]} ${d} ${MONTHS[m - 1]}`;
}

/** « Lundi 23 nov. » */
export function formatDayMedium(iso: IsoDate): string {
  const { m, d } = parts(iso);
  return `${DAY_NAMES[weekdayOf(iso)]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** « Lundi 23 » */
export function formatDayShort(iso: IsoDate): string {
  return `${DAY_NAMES[weekdayOf(iso)]} ${parts(iso).d}`;
}

/**
 * « Semaine du 23 au 29 nov. », « Semaine du 30 nov. au 6 déc. »,
 * « Semaine du 28 déc. 2026 au 3 janv. 2027 ».
 */
export function weekLabel(start: IsoDate): string {
  const a = parts(start);
  const b = parts(addDays(start, 6));
  if (a.y !== b.y) return `Semaine du ${a.d} ${MONTHS_SHORT[a.m - 1]} ${a.y} au ${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `Semaine du ${a.d} ${MONTHS_SHORT[a.m - 1]} au ${b.d} ${MONTHS_SHORT[b.m - 1]}`;
  return `Semaine du ${a.d} au ${b.d} ${MONTHS_SHORT[b.m - 1]}`;
}

/** « cette semaine », « la semaine prochaine », « dans 2 semaines », « la semaine dernière », « il y a 3 semaines ». */
export function relativeWeek(offset: number): string {
  if (offset === 0) return 'cette semaine';
  if (offset === 1) return 'la semaine prochaine';
  if (offset === -1) return 'la semaine dernière';
  return offset > 1 ? `dans ${offset} semaines` : `il y a ${-offset} semaines`;
}
