/**
 * Groceries data layer (sub-agent 2).
 *
 * Everything here throws readable errors — callers wrap in useMutation or
 * reconcile manually. Reads follow the household roster pattern: two small
 * queries instead of a hand-rolled PostgREST join.
 */

import { shiftMonth } from '@/lib/format';
import { readableError, supabase } from '@/lib/supabase';
import type { Grocery } from '@/lib/types';

export type GroceryWithBuyer = Grocery & {
  /** Display name of whoever ticked it off. Null while unbought. */
  buyer_name: string | null;
};

function fail(error: unknown, fallback: string): never {
  throw new Error(readableError(error) ?? fallback);
}

/** This month's list: unbought first, newest first — never alphabetical. */
export async function fetchGroceries(
  householdId: string,
  month: string,
): Promise<GroceryWithBuyer[]> {
  const { data, error } = await supabase
    .from('groceries')
    .select('*')
    .eq('household_id', householdId)
    .eq('month', month)
    .order('is_bought', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) fail(error, 'Could not load groceries.');
  const rows = (data ?? []) as Grocery[];

  const buyerIds = [...new Set(rows.map((row) => row.bought_by).filter(Boolean))] as string[];
  let names = new Map<string, string>();
  if (buyerIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', buyerIds);
    if (profilesError) fail(profilesError, 'Could not load groceries.');
    names = new Map((profiles ?? []).map((row) => [row.id as string, row.display_name as string]));
  }

  return rows.map((row) => ({
    ...row,
    buyer_name: row.bought_by ? (names.get(row.bought_by) ?? null) : null,
  }));
}

/**
 * Carry permanent items forward into an empty month.
 *
 * Runs lazily on first view (never rewrites history: only months at or after
 * the current one). Looks back up to a year so a skipped month still inherits
 * the staples. Returns how many rows were seeded.
 */
export async function seedPermanentForward(
  householdId: string,
  month: string,
  userId: string,
): Promise<number> {
  const { data: existing, error: existingError } = await supabase
    .from('groceries')
    .select('id')
    .eq('household_id', householdId)
    .eq('month', month)
    .limit(1);
  if (existingError) fail(existingError, 'Could not load groceries.');
  if ((existing ?? []).length > 0) return 0;

  for (let back = 1; back <= 12; back += 1) {
    const previous = shiftMonth(month, -back);
    const { data, error } = await supabase
      .from('groceries')
      .select('name, category, quantity, unit')
      .eq('household_id', householdId)
      .eq('month', previous)
      .eq('is_permanent', true);
    if (error) fail(error, 'Could not load groceries.');
    if (!data || data.length === 0) continue;

    const copies = data.map((row) => ({
      household_id: householdId,
      name: row.name as string,
      category: row.category as string,
      quantity: row.quantity as number | null,
      unit: row.unit as string | null,
      is_permanent: true,
      is_bought: false,
      month,
      added_by: userId,
    }));
    const { error: insertError } = await supabase.from('groceries').insert(copies);
    if (insertError) fail(insertError, 'Could not carry items forward.');
    return copies.length;
  }
  return 0;
}

export type NewGrocery = {
  name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  is_permanent: boolean;
};

export async function addGrocery(
  householdId: string,
  month: string,
  userId: string,
  input: NewGrocery,
): Promise<void> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error('Give the item a name first.');
  const { error } = await supabase.from('groceries').insert({
    household_id: householdId,
    name: trimmed,
    category: input.category,
    quantity: input.quantity,
    unit: input.unit?.trim() ? input.unit.trim() : null,
    is_permanent: input.is_permanent,
    is_bought: false,
    month,
    added_by: userId,
  });
  if (error) fail(error, 'Could not add that item.');
}

export async function setBought(id: string, bought: boolean, userId: string): Promise<void> {
  const { error } = await supabase
    .from('groceries')
    .update({
      is_bought: bought,
      bought_by: bought ? userId : null,
      bought_at: bought ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) fail(error, 'That did not stick. Try again.');
}

export async function renameGrocery(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Give the item a name first.');
  const { error } = await supabase.from('groceries').update({ name: trimmed }).eq('id', id);
  if (error) fail(error, 'Could not rename that item.');
}

/** Full edit from the edit sheet: name, category, quantity, unit, staple. */
export async function updateGrocery(id: string, input: NewGrocery): Promise<void> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error('Give the item a name first.');
  const { error } = await supabase
    .from('groceries')
    .update({
      name: trimmed,
      category: input.category,
      quantity: input.quantity,
      unit: input.unit?.trim() ? input.unit.trim() : null,
      is_permanent: input.is_permanent,
    })
    .eq('id', id);
  if (error) fail(error, 'Could not save those changes.');
}

export async function deleteGrocery(id: string): Promise<void> {
  const { error } = await supabase.from('groceries').delete().eq('id', id);
  if (error) fail(error, 'Could not delete that item.');
}

/** Delete every bought row of the month. Returns them for undo restore. */
export async function clearBought(householdId: string, month: string): Promise<GroceryWithBuyer[]> {
  const bought = (await fetchGroceries(householdId, month)).filter((row) => row.is_bought);
  if (bought.length === 0) return [];
  const { error } = await supabase
    .from('groceries')
    .delete()
    .eq('household_id', householdId)
    .eq('month', month)
    .eq('is_bought', true);
  if (error) fail(error, 'Could not clear bought items.');
  return bought;
}

/** Re-insert rows removed by delete/undo, preserving their ids. */
export async function restoreGroceries(rows: Grocery[]): Promise<void> {
  if (rows.length === 0) return;
  const copies = rows.map((row) => ({
    id: row.id,
    household_id: row.household_id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    is_permanent: row.is_permanent,
    is_bought: row.is_bought,
    month: row.month,
    added_by: row.added_by,
    bought_by: row.bought_by,
    bought_at: row.bought_at,
  }));
  const { error } = await supabase.from('groceries').insert(copies);
  if (error) fail(error, 'Could not bring that back.');
}
