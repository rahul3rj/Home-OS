/**
 * Earnings + savings data layer (sub-agent 3).
 *
 * The privacy model, enforced by Postgres RLS rather than by this file — but
 * these queries must still never ask for another member's rows:
 *
 * - earnings and savings reads always filter on the signed-in member's own id
 * - the shared pool total comes from the `savings_pool_total` RPC, which
 *   returns only the SUM. It is never computed by fetching rows client-side:
 *   RLS would block that anyway, and it would be the wrong mental model.
 *
 * Everything here throws readable errors. Callers wrap writes in
 * `useMutation.run()` (money is never optimistic — it waits for the server)
 * and reads in `useQuery`.
 */

import { formatMonth } from '@/lib/format';
import { readableError, supabase } from '@/lib/supabase';
import type { Earning, Saving } from '@/lib/types';

function fail(error: unknown, fallback: string): never {
  throw new Error(readableError(error) ?? fallback);
}

export type NewEarning = {
  amount: number;
  source: string;
  note: string | null;
};

/**
 * The signed-in member's own entries for the given months. Never takes
 * another member's id — there is no reason for this screen to name one.
 */
export async function fetchEarnings(args: {
  householdId: string;
  userId: string;
  months: string[];
}): Promise<Earning[]> {
  const { data, error } = await supabase
    .from('earnings')
    .select('*')
    .eq('household_id', args.householdId)
    .eq('user_id', args.userId)
    .in('month', args.months)
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load your earnings.');
  return (data ?? []) as Earning[];
}

/**
 * `source` is unique per member per month. A raw `23505` means nothing to a
 * family member, so translate it into which entry to edit instead.
 */
function duplicateMessage(error: unknown, source: string, month: string): string | null {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null;
  const message =
    error && typeof error === 'object'
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  if (code === '23505' || /duplicate|unique/i.test(message)) {
    return `You already added ${source} for ${formatMonth(month)}. Edit that entry instead.`;
  }
  return null;
}

export async function addEarning(args: {
  householdId: string;
  userId: string;
  month: string;
  input: NewEarning;
}): Promise<void> {
  const { error } = await supabase.from('earnings').insert({
    household_id: args.householdId,
    user_id: args.userId,
    month: args.month,
    amount: args.input.amount,
    source: args.input.source,
    note: args.input.note,
  });
  if (error) {
    throw new Error(
      duplicateMessage(error, args.input.source, args.month) ??
        readableError(error) ??
        'Could not save that earning.',
    );
  }
}

export async function updateEarning(args: {
  id: string;
  userId: string;
  month: string;
  input: NewEarning;
}): Promise<void> {
  const { error } = await supabase
    .from('earnings')
    .update({
      amount: args.input.amount,
      source: args.input.source,
      note: args.input.note,
    })
    .eq('id', args.id)
    .eq('user_id', args.userId);
  if (error) {
    throw new Error(
      duplicateMessage(error, args.input.source, args.month) ??
        readableError(error) ??
        'Could not save that earning.',
    );
  }
}

/** Money records are irreversible: the screen confirms before calling this. */
export async function deleteEarning(id: string, userId: string): Promise<void> {
  const { error } = await supabase.from('earnings').delete().eq('id', id).eq('user_id', userId);
  if (error) fail(error, 'Could not delete that earning.');
}

/**
 * The signed-in member's own allocation for one month. At most one row
 * exists (`unique(user_id, month)`), so a missing row simply means nothing
 * set aside yet — not an error.
 */
export async function fetchSaving(
  householdId: string,
  userId: string,
  month: string,
): Promise<Saving | null> {
  const { data, error } = await supabase
    .from('savings')
    .select('*')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .eq('month', month)
    .maybeSingle();
  if (error) fail(error, 'Could not load your savings.');
  return (data as Saving | null) ?? null;
}

export async function upsertSaving(args: {
  householdId: string;
  userId: string;
  month: string;
  amount: number;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.from('savings').upsert(
    {
      household_id: args.householdId,
      user_id: args.userId,
      month: args.month,
      amount: args.amount,
      note: args.note,
    },
    { onConflict: 'user_id,month' },
  );
  if (error) fail(error, 'Could not save your savings.');
}

/** Money records are irreversible: the screen confirms before calling this. */
export async function deleteSaving(id: string, userId: string): Promise<void> {
  const { error } = await supabase.from('savings').delete().eq('id', id).eq('user_id', userId);
  if (error) fail(error, 'Could not delete those savings.');
}

/**
 * The shared household total, all months. The RPC returns only the sum —
 * individual contributions stay private by construction. Never replace this
 * with a client-side sum over savings rows.
 */
export async function fetchPoolTotal(householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc('savings_pool_total', {
    p_household: householdId,
  });
  if (error) fail(error, 'Could not load the savings pool.');
  const total = typeof data === 'number' ? data : Number(data ?? 0);
  return Number.isFinite(total) ? total : 0;
}
