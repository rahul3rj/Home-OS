/**
 * Tasks data layer (sub-agent 4).
 *
 * Everything here throws readable errors — callers wrap in `useMutation` or
 * reconcile manually after an optimistic write. Reads follow the household
 * roster pattern: two small queries instead of a hand-rolled PostgREST join.
 *
 * Completion is recorded per person per day in `task_completions`, so a daily
 * task done yesterday stays done yesterday and history is real.
 */

import { toDateString, today } from '@/lib/format';
import { readableError, supabase } from '@/lib/supabase';
import type { Profile, Task, TaskCadence, TaskCompletion } from '@/lib/types';

export type TaskWithPeople = Task & {
  assignee: Profile | null;
  assigned_by_profile: Profile | null;
};

function fail(error: unknown, fallback: string): never {
  // A double-tap can race two identical completion inserts past the optimistic
  // check. The unique constraint stops the second one — that is success, not
  // an error worth surfacing.
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    throw new TaskRaceIgnored();
  }
  throw new Error(readableError(error) ?? fallback);
}

/** Thrown (and swallowed) when a raced duplicate completion insert is ignored. */
export class TaskRaceIgnored extends Error {
  constructor() {
    super('already-done');
  }
}

function toTask(row: Task): Task {
  return {
    id: row.id,
    household_id: row.household_id,
    title: row.title,
    cadence: row.cadence,
    is_permanent: row.is_permanent,
    assignee_id: row.assignee_id,
    assigned_by: row.assigned_by,
    sort_order: row.sort_order,
    due_at: row.due_at ?? null,
    created_at: row.created_at,
  };
}

/** Every task in the home, oldest first, with assignee names attached. */
export async function fetchTasks(householdId: string): Promise<TaskWithPeople[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) fail(error, 'Could not load tasks.');
  const rows = ((data ?? []) as Task[]).map(toTask);

  const ids = [
    ...new Set(rows.flatMap((row) => [row.assignee_id, row.assigned_by]).filter(Boolean)),
  ] as string[];
  let byId = new Map<string, Profile>();
  if (ids.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);
    if (profilesError) fail(profilesError, 'Could not load tasks.');
    byId = new Map(((profiles ?? []) as Profile[]).map((row) => [row.id, row]));
  }

  return rows.map((row) => ({
    ...row,
    assignee: row.assignee_id ? (byId.get(row.assignee_id) ?? null) : null,
    assigned_by_profile: byId.get(row.assigned_by) ?? null,
  }));
}

/**
 * Completions for the given tasks on the given dates (`'YYYY-MM-DD'`).
 * Returned as `taskId -> date -> userIds[]` so both the list and the week grid
 * can answer "is this done, and by whom" without another round trip.
 */
export async function fetchCompletions(
  taskIds: string[],
  dates: string[],
): Promise<Map<string, Map<string, string[]>>> {
  const empty = new Map<string, Map<string, string[]>>();
  if (taskIds.length === 0 || dates.length === 0) return empty;
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id, user_id, completed_on')
    .in('task_id', taskIds)
    .in('completed_on', dates);
  if (error) fail(error, 'Could not load completions.');
  const result = new Map<string, Map<string, string[]>>();
  for (const row of (data ?? []) as TaskCompletion[]) {
    let byDate = result.get(row.task_id);
    if (!byDate) {
      byDate = new Map();
      result.set(row.task_id, byDate);
    }
    const users = byDate.get(row.completed_on) ?? [];
    users.push(row.user_id);
    byDate.set(row.completed_on, users);
  }
  return result;
}

/**
 * Open deadlines for the notification centre and the bell dot: tasks with a
 * due date nobody has ticked off on or after the day they were due. Overdue
 * is past the moment; upcoming is the next seven days. Both sorted nearest
 * first — the bell only counts the overdue half. Done the Postgres way would
 * need a new column; the completions table already says enough.
 */
export async function fetchOpenDeadlines(
  householdId: string,
): Promise<{ overdue: TaskWithPeople[]; upcoming: TaskWithPeople[] }> {
  const dated = (await fetchTasks(householdId)).filter(
    (task): task is TaskWithPeople & { due_at: string } => task.due_at !== null,
  );
  const empty = { overdue: [] as TaskWithPeople[], upcoming: [] as TaskWithPeople[] };
  if (dated.length === 0) return empty;
  const now = Date.now();
  const todayStr = today();
  const floor = toDateString(new Date(now - 30 * 24 * 60 * 60 * 1000));
  const startDay = dated.reduce((min, task) => {
    const day = toDateString(new Date(task.due_at));
    return day < min ? day : min;
  }, todayStr);
  const start = new Date(`${startDay < floor ? floor : startDay}T00:00:00`);
  const days: string[] = [];
  for (
    const cursor = new Date(start);
    toDateString(cursor) <= todayStr && days.length < 32;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    days.push(toDateString(cursor));
  }
  const completions = await fetchCompletions(
    dated.map((task) => task.id),
    days,
  );
  const handled = (task: TaskWithPeople & { due_at: string }): boolean => {
    const byDate = completions.get(task.id);
    if (!byDate) return false;
    const dueDay = toDateString(new Date(task.due_at));
    for (const [day, users] of byDate) {
      if (day >= dueDay && users.length > 0) return true;
    }
    return false;
  };
  const open = dated.filter((task) => !handled(task));
  const byDue = (a: TaskWithPeople, b: TaskWithPeople) =>
    Date.parse(a.due_at as string) - Date.parse(b.due_at as string);
  return {
    overdue: open.filter((task) => Date.parse(task.due_at) < now).sort(byDue),
    upcoming: open
      .filter((task) => {
        const at = Date.parse(task.due_at);
        return at >= now && at <= now + 7 * 24 * 60 * 60 * 1000;
      })
      .sort(byDue),
  };
}

/** Completion history for one task — newest day first. */
export async function fetchTaskHistory(taskId: string, limit = 30): Promise<TaskCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('*')
    .eq('task_id', taskId)
    .order('completed_on', { ascending: false })
    .limit(limit);
  if (error) fail(error, 'Could not load history.');
  return (data ?? []) as TaskCompletion[];
}

export type NewTask = {
  title: string;
  cadence: TaskCadence;
  is_permanent: boolean;
  /** Ignored for daily tasks — those are personal by the database rule. */
  assignee_id: string | null;
  /** ISO timestamp, or null for no deadline (and no ping). */
  due_at: string | null;
};

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Give the task a name first.');
  if (trimmed.length > 120) throw new Error('Keep the name under 120 characters.');
  return trimmed;
}

export async function addTask(
  householdId: string,
  userId: string,
  input: NewTask,
): Promise<string> {
  const title = cleanTitle(input.title);
  // Daily tasks are personal: the database rejects any other assignee, so the
  // UI never offers the picker and the write never sends one.
  const assignee_id = input.cadence === 'daily' ? null : input.assignee_id;
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      household_id: householdId,
      title,
      cadence: input.cadence,
      is_permanent: input.is_permanent,
      assignee_id,
      assigned_by: userId,
      sort_order: 0,
      due_at: input.due_at,
    })
    .select('id')
    .single();
  if (error) fail(error, 'Could not add that task.');
  return (data as { id: string }).id;
}

export async function updateTask(id: string, input: NewTask): Promise<void> {
  const title = cleanTitle(input.title);
  const assignee_id = input.cadence === 'daily' ? null : input.assignee_id;
  const { error } = await supabase
    .from('tasks')
    .update({
      title,
      cadence: input.cadence,
      is_permanent: input.is_permanent,
      assignee_id,
      due_at: input.due_at,
    })
    .eq('id', id);
  if (error) fail(error, 'Could not save that task.');
}

/** Mark done (insert) or not done (delete) for one person on one date. */
export async function setTaskDone(
  taskId: string,
  userId: string,
  date: string,
  done: boolean,
): Promise<void> {
  if (done) {
    try {
      const { error } = await supabase
        .from('task_completions')
        .insert({ task_id: taskId, user_id: userId, completed_on: date });
      if (error) fail(error, 'That did not stick. Try again.');
    } catch (cause) {
      if (cause instanceof TaskRaceIgnored) return;
      throw cause;
    }
    return;
  }
  // RLS only lets a member delete their own completions.
  const { error } = await supabase
    .from('task_completions')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .eq('completed_on', date);
  if (error) fail(error, 'That did not stick. Try again.');
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) fail(error, 'Could not delete that task.');
}

/** Re-insert a task removed by delete/undo, preserving its id. */
export async function restoreTask(row: Task): Promise<void> {
  const { error } = await supabase.from('tasks').insert({
    id: row.id,
    household_id: row.household_id,
    title: row.title,
    cadence: row.cadence,
    is_permanent: row.is_permanent,
    assignee_id: row.assignee_id,
    assigned_by: row.assigned_by,
    sort_order: row.sort_order,
    due_at: row.due_at ?? null,
  });
  if (error) fail(error, 'Could not bring that back.');
}

/**
 * Which member "owns" a task for the per-person views. Daily tasks are
 * personal to whoever created them; anything with an assignee belongs to that
 * person; an unassigned weekly or one-off still belongs to its creator.
 */
export function ownerOf(task: Task): string {
  if (task.cadence === 'daily') return task.assigned_by;
  return task.assignee_id ?? task.assigned_by;
}

/** `'YYYY-MM-DD'` of the task's creation day, in local time. */
export function createdOn(task: Task): string {
  return task.created_at.slice(0, 10);
}
