/**
 * Goals data layer (sub-agent 4).
 *
 * Goals are household-visible and binary: done or not done. No percentages,
 * no milestones — that is speculative scope. Everything here throws readable
 * errors; callers wrap in `useMutation` or reconcile after an optimistic
 * toggle.
 */

import { readableError, supabase } from '@/lib/supabase';
import type { Goal, Profile } from '@/lib/types';

export type GoalWithAuthor = Goal & {
  created_by_profile: Profile | null;
};

function fail(error: unknown, fallback: string): never {
  throw new Error(readableError(error) ?? fallback);
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Give the goal a name first.');
  if (trimmed.length > 120) throw new Error('Keep the name under 120 characters.');
  return trimmed;
}

/** One month's goals, oldest first, with the author's name attached. */
export async function fetchGoals(householdId: string, month: string): Promise<GoalWithAuthor[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('household_id', householdId)
    .eq('month', month)
    .order('created_at', { ascending: true });
  if (error) fail(error, 'Could not load goals.');
  const rows = (data ?? []) as Goal[];

  const ids = [...new Set(rows.map((row) => row.created_by))];
  let byId = new Map<string, Profile>();
  if (ids.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);
    if (profilesError) fail(profilesError, 'Could not load goals.');
    byId = new Map(((profiles ?? []) as Profile[]).map((row) => [row.id, row]));
  }

  return rows.map((row) => ({ ...row, created_by_profile: byId.get(row.created_by) ?? null }));
}

/** Every goal in the home, newest month first — for the detail screen's history. */
export async function fetchAllGoals(householdId: string): Promise<GoalWithAuthor[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('household_id', householdId)
    .order('month', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) fail(error, 'Could not load goals.');
  const rows = (data ?? []) as Goal[];

  const ids = [...new Set(rows.map((row) => row.created_by))];
  let byId = new Map<string, Profile>();
  if (ids.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);
    if (profilesError) fail(profilesError, 'Could not load goals.');
    byId = new Map(((profiles ?? []) as Profile[]).map((row) => [row.id, row]));
  }

  return rows.map((row) => ({ ...row, created_by_profile: byId.get(row.created_by) ?? null }));
}

export async function fetchGoal(id: string): Promise<GoalWithAuthor | null> {
  const { data, error } = await supabase.from('goals').select('*').eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not load that goal.');
  if (!data) return null;
  const row = data as Goal;
  const { data: author } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', row.created_by)
    .maybeSingle();
  return { ...row, created_by_profile: (author as Profile | null) ?? null };
}

export type NewGoal = {
  title: string;
  description: string | null;
  month: string;
};

export async function addGoal(
  householdId: string,
  userId: string,
  input: NewGoal,
): Promise<string> {
  const title = cleanTitle(input.title);
  const description = input.description?.trim() ? input.description.trim() : null;
  const { data, error } = await supabase
    .from('goals')
    .insert({
      household_id: householdId,
      created_by: userId,
      title,
      description,
      month: input.month,
      is_done: false,
    })
    .select('id')
    .single();
  if (error) fail(error, 'Could not add that goal.');
  return (data as { id: string }).id;
}

export async function updateGoal(id: string, input: NewGoal): Promise<void> {
  const title = cleanTitle(input.title);
  const description = input.description?.trim() ? input.description.trim() : null;
  const { error } = await supabase
    .from('goals')
    .update({ title, description, month: input.month })
    .eq('id', id);
  if (error) fail(error, 'Could not save that goal.');
}

export async function setGoalDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({ is_done: done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) fail(error, 'That did not stick. Try again.');
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) fail(error, 'Could not delete that goal.');
}

/** Open goals first, completed ones at the bottom. */
export function openFirst(goals: GoalWithAuthor[]): GoalWithAuthor[] {
  return [...goals].sort((a, b) => Number(a.is_done) - Number(b.is_done));
}
