/**
 * Small amount helpers owned by the money feature (sub-agent 3).
 *
 * Parsing lives here — next to the forms that use it — rather than in
 * `src/lib/format.ts`, which only formats. Amounts always display through
 * `formatINR` / `MoneyText`; never hand-roll grouping.
 */

import { formatINR, round2 } from '@/lib/format';

/**
 * Parse a typed amount. Strips Indian grouping commas and spaces first, so
 * `1,23,456` reads as 123456 rather than 1.23. Returns null for anything
 * that is not a positive amount — callers show an inline error and keep the
 * sheet open.
 */
export function parseAmount(raw: string): number | null {
  const compact = raw.replace(/[,\s]/g, '');
  if (!compact) return null;
  const value = Number(compact);
  if (!Number.isFinite(value) || value <= 0) return null;
  return round2(value);
}

/**
 * This month vs last month, in words. Returns null when the two months match
 * — the caller then says "Same as last month" only when there is something
 * to compare (a zero-to-zero month stays quiet).
 *
 * `up` drives the tone: the positive semantic colour for a genuine increase,
 * muted otherwise. Lime is the CTA, never a status colour.
 */
export function describeTrend(diff: number): { text: string; up: boolean } | null {
  const rounded = round2(diff);
  if (rounded === 0) return null;
  const magnitude = formatINR(Math.abs(rounded));
  if (rounded > 0) return { text: `${magnitude} more than last month`, up: true };
  return { text: `${magnitude} less than last month`, up: false };
}
