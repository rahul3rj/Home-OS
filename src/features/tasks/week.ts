/**
 * Week helpers for the tasks feature (sub-agent 4).
 *
 * Monday-start is a deliberate product choice for a household calendar, kept
 * here as one constant so changing it is a one-line decision — never a sweep
 * through the feature. The date math itself lives in `src/lib/format.ts`
 * (`formatWeekRange`, `weekDates`, `weekdayLabels`), which already starts on
 * Monday; this file only names that choice.
 */

export { formatWeekRange, toDateString, today, weekDates, weekdayLabels } from '@/lib/format';

/** 1 = Monday. Matches `getDay()` numbering where 0 is Sunday. */
export const WEEK_START_DAY = 1 as const;

/** `'YYYY-MM-DD'` for the given date in local time. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** True when two dates fall on the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
