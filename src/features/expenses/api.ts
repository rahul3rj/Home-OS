/**
 * House-expenses data layer (sub-agent 2).
 *
 * Money rules apply: writes are never optimistic. Every mutation awaits the
 * server and the screen refetches; pending state lives on the row being saved.
 * Everything here throws readable errors for useMutation.
 */

import { readableError, supabase } from '@/lib/supabase';
import type { HouseExpense, HouseExpenseCategory } from '@/lib/types';
import { round2 } from '@/lib/format';

function fail(error: unknown, fallback: string): never {
  throw new Error(readableError(error) ?? fallback);
}

export async function fetchExpenses(householdId: string, month: string): Promise<HouseExpense[]> {
  const { data, error } = await supabase
    .from('house_expenses')
    .select('*')
    .eq('household_id', householdId)
    .eq('month', month)
    .order('category', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load house expenses.');
  return (data ?? []) as HouseExpense[];
}

export function monthTotal(rows: HouseExpense[]): number {
  return round2(rows.reduce((sum, row) => sum + Number(row.amount), 0));
}

export function breakdown(
  rows: HouseExpense[],
): { category: HouseExpenseCategory; total: number }[] {
  const sums = new Map<HouseExpenseCategory, number>();
  for (const row of rows) {
    sums.set(row.category, round2((sums.get(row.category) ?? 0) + Number(row.amount)));
  }
  return [...sums.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export type ExpenseInput = {
  label: string;
  amount: number;
  category: HouseExpenseCategory;
  due_day: number | null;
};

function validated(input: ExpenseInput): ExpenseInput {
  const label = input.label.trim();
  if (!label) throw new Error('Give the bill a name first.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Enter an amount above zero.');
  }
  if (input.due_day !== null && (input.due_day < 1 || input.due_day > 31)) {
    throw new Error('The due day is between 1 and 31.');
  }
  return { ...input, label, amount: round2(input.amount) };
}

/** Insert into the given months (repeat spreads the same bill forward). */
export async function addExpense(
  householdId: string,
  months: string[],
  input: ExpenseInput,
): Promise<void> {
  const bill = validated(input);
  const rows = months.map((month) => ({
    household_id: householdId,
    category: bill.category,
    label: bill.label,
    amount: bill.amount,
    month,
    due_day: bill.due_day,
    is_paid: false,
  }));
  const { error } = await supabase.from('house_expenses').insert(rows);
  if (error) fail(error, 'Could not add that bill.');
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  const bill = validated(input);
  const { error } = await supabase
    .from('house_expenses')
    .update({
      label: bill.label,
      amount: bill.amount,
      category: bill.category,
      due_day: bill.due_day,
    })
    .eq('id', id);
  if (error) fail(error, 'Could not save that bill.');
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('house_expenses').delete().eq('id', id);
  if (error) fail(error, 'Could not delete that bill.');
}

export async function setPaid(id: string, paid: boolean, userId: string): Promise<void> {
  const { error } = await supabase
    .from('house_expenses')
    .update({
      is_paid: paid,
      paid_by: paid ? userId : null,
      paid_at: paid ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) fail(error, 'That did not stick. Try again.');
}

/** Friendly category names for chips and headers. */
export const CATEGORY_LABELS: Record<HouseExpenseCategory, string> = {
  rent: 'Rent',
  electricity: 'Electricity',
  water: 'Water',
  gas: 'Gas',
  internet: 'Internet',
  maid: 'Maid',
  maintenance: 'Maintenance',
  other: 'Other',
};
