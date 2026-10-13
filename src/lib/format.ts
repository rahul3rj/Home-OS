/**
 * Formatting helpers. Money is INR and dates are grouped the way India writes
 * them — hand-rolling either of those is how you end up showing ₹1,23,456.00 as
 * ₹123,456.
 */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Round to paise. Guards against float drift accumulating across a sum. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * `formatINR(123456)` → `₹1,23,456`
 * `formatINR(123456.5, { paise: true })` → `₹1,23,456.50`
 */
export function formatINR(amount: number, opts?: { paise?: boolean }): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return opts?.paise ? inrPaise.format(round2(safe)) : inrWhole.format(round2(safe));
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Current month as `'YYYY-MM'`. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Shift a `'YYYY-MM'` month by a number of months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** `'2026-10'` → `'October 2026'` */
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const name = MONTH_NAMES[monthNumber - 1];
  return name ? `${name} ${year}` : month;
}

/** Short form for dense rows: `'Oct 2026'` */
export function formatMonthShort(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const name = MONTH_NAMES[monthNumber - 1];
  return name ? `${name.slice(0, 3)} ${year}` : month;
}

/** Today's date as `'YYYY-MM-DD'` in local time. */
export function today(): string {
  const now = new Date();
  return toDateString(now);
}

export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** `'2026-10-04'` → `'4 Oct'`. Falls back to the raw string if unparseable. */
export function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getDate()} ${MONTH_NAMES[parsed.getMonth()].slice(0, 3)}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Deadline in words: "Tue 14 Oct · 9:00 AM". Falls back to the raw value. */
export function formatDueAt(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const day = `${WEEKDAYS[at.getDay()]} ${at.getDate()} ${MONTH_NAMES[at.getMonth()].slice(0, 3)}`;
  const meridiem = at.getHours() >= 12 ? 'PM' : 'AM';
  const hours = at.getHours() % 12 || 12;
  const minutes = String(at.getMinutes()).padStart(2, '0');
  return `${day} · ${hours}:${minutes} ${meridiem}`;
}

/** Today in words, for the Home greeting line. */
export function formatTodayLong(date = new Date()): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Monday-start week containing `anchor`.
 *
 * Monday-start is a deliberate choice: the app is built for a household rather
 * than a US retail calendar. It lives here as one constant so changing it is a
 * one-line decision, not a sweep through the tasks feature.
 */
export function formatWeekRange(anchor: Date): { start: Date; end: Date } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  // getDay() is 0 for Sunday; shift so Monday is 0.
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

/** The seven date strings of the week containing `anchor`. */
export function weekDates(anchor: Date): string[] {
  const { start } = formatWeekRange(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return toDateString(day);
  });
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Weekday initials for a Monday-start week grid. */
export const weekdayLabels = WEEKDAY_LABELS;
