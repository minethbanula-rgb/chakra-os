import type { ISODate } from '@/data/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date for a Date object (never UTC-shifted). */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as local noon, so DST and time zones never move the day. */
export function parseISODate(v: ISODate): Date {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

let clock: () => Date = () => new Date();
/** Tests can pin "now". */
export function setClock(fn: () => Date) {
  clock = fn;
}
export const now = () => clock();
export const today = (): ISODate => toISODate(now());

export function addDays(v: ISODate, n: number): ISODate {
  const d = parseISODate(v);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 864e5);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Add calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(v: ISODate, n: number, anchorDay?: number): ISODate {
  const d = parseISODate(v);
  const day = anchorDay ?? d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return toISODate(target);
}

export interface Range {
  start: ISODate;
  /** Inclusive. */
  end: ISODate;
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(v: ISODate | null | undefined, opts: { year?: boolean } = {}): string {
  if (!v) return 'No date';
  const d = parseISODate(v);
  const showYear = opts.year ?? d.getFullYear() !== now().getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${showYear ? `, ${d.getFullYear()}` : ''}`;
}

/** "Today", "Tomorrow", "Yesterday", weekday within a week, otherwise a date. */
export function relativeDay(v: ISODate | null | undefined): string {
  if (!v) return 'No date';
  const diff = daysBetween(today(), v);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return parseISODate(v).toLocaleDateString('en-US', { weekday: 'long' });
  if (diff < 0 && diff > -7) return `${-diff} days ago`;
  return formatDate(v);
}

/**
 * The reporting cycle containing `ref`. A cycle starting on the 25th runs 25th → 24th.
 * In months shorter than the start day, the start clamps to the month's last day.
 */
export function cycleRange(startDay: number, ref: ISODate = today()): Range {
  const r = parseISODate(ref);
  const startIn = (y: number, m: number) => {
    const norm = new Date(y, m, 1, 12);
    const day = Math.min(startDay, daysInMonth(norm.getFullYear(), norm.getMonth()));
    return toISODate(new Date(norm.getFullYear(), norm.getMonth(), day, 12));
  };
  let start = startIn(r.getFullYear(), r.getMonth());
  if (start > ref) start = startIn(r.getFullYear(), r.getMonth() - 1);
  const s = parseISODate(start);
  const next = startIn(s.getFullYear(), s.getMonth() + 1);
  const end = addDays(next, -1);
  const label = startDay === 1 ? `${MONTHS[s.getMonth()]} ${s.getFullYear()}` : `${formatDate(start, { year: false })} – ${formatDate(end, { year: false })}`;
  return { start, end, label };
}

export function previousCycle(startDay: number, ref: ISODate = today()): Range {
  return cycleRange(startDay, addDays(cycleRange(startDay, ref).start, -1));
}

export function quarterRange(ref: ISODate = today()): Range {
  const d = parseISODate(ref);
  const q = Math.floor(d.getMonth() / 3);
  const start = toISODate(new Date(d.getFullYear(), q * 3, 1, 12));
  const end = toISODate(new Date(d.getFullYear(), q * 3 + 3, 0, 12));
  return { start, end, label: `Q${q + 1} ${d.getFullYear()}` };
}

export function yearRange(ref: ISODate = today()): Range {
  const y = parseISODate(ref).getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) };
}

export function weekRange(ref: ISODate = today(), weekStartsOn: 0 | 1 = 1): Range {
  const d = parseISODate(ref);
  const offset = (d.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(ref, -offset);
  return { start, end: addDays(start, 6), label: 'This week' };
}

export const inRange = (v: ISODate | null | undefined, r: Pick<Range, 'start' | 'end'>) => !!v && v >= r.start && v <= r.end;

export function monthLabel(v: ISODate): string {
  const d = parseISODate(v);
  return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

export function greeting(): string {
  const h = now().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
