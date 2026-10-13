/**
 * Tasks tab (sub-agent 4).
 *
 * Defaults to my tasks, grouped Overdue / Today / This week. The person
 * switcher shows any member's tasks — flipping to the week grid gives the
 * required weekly per-person view. Family goals live at the bottom of this
 * tab (they have no tab of their own): open first, done collapsed.
 */

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, InteractionManager } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CheckBox,
  Collapsible,
  EmptyState,
  ErrorState,
  Fab,
  Icon,
  ListSection,
  LoadingState,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Stack as StackLayout,
  successFeedback,
  tapFeedback,
  Text,
  UndoToast,
} from '@/components/ui';
import { currentMonth, today } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery, useUndo } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { fetchGoals, openFirst, setGoalDone, type GoalWithAuthor } from '@/features/goals/api';
import {
  addTask,
  createdOn,
  deleteTask,
  fetchCompletions,
  fetchTasks,
  ownerOf,
  restoreTask,
  setTaskDone,
  type TaskWithPeople,
} from '@/features/tasks/api';
import { emptyTaskDraft, TaskForm, type TaskDraft } from '@/features/tasks/TaskForm';
import {
  cancelTaskReminder,
  setupTaskReminders,
  syncTaskReminder,
} from '@/features/tasks/reminders';
import { TaskRow } from '@/features/tasks/TaskRow';
import { weekDates } from '@/features/tasks/week';
import { WeekGrid } from '@/features/tasks/WeekGrid';

type TaskView = 'list' | 'week';

export default function Tasks() {
  const theme = useTheme();
  const { user } = useAuth();
  const { household, members } = useHousehold();
  const write = useMutation();
  const undo = useUndo();
  const pendingRestore = useRef<(() => Promise<void>) | null>(null);

  const householdId = household?.id ?? null;
  const myId = user?.id ?? null;
  const day = today();

  const [view, setView] = useState<TaskView>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(emptyTaskDraft);

  const tasksQuery = useQuery<TaskWithPeople[]>(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchTasks(householdId);
  }, [householdId]);

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const taskIdsKey = useMemo(() => tasks.map((task) => task.id).join(','), [tasks]);

  const dates = useMemo(() => {
    const week = weekDates(anchor);
    return week.includes(day) ? week : [...week, day];
  }, [anchor, day]);
  const datesKey = useMemo(() => dates.join(','), [dates]);

  const completionsQuery = useQuery(async () => {
    const ids = taskIdsKey ? taskIdsKey.split(',') : [];
    return fetchCompletions(ids, datesKey.split(','));
  }, [householdId, taskIdsKey, datesKey]);
  const completions = useMemo(() => completionsQuery.data ?? new Map(), [completionsQuery.data]);

  const month = currentMonth();
  const goalsQuery = useQuery<GoalWithAuthor[]>(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchGoals(householdId, month);
  }, [householdId, month]);

  // Deleting happens on the detail screen too — coming back must show the
  // truth from the server, not the list as it looked before leaving.
  const { refetch: refetchTasks } = tasksQuery;
  const { refetch: refetchCompletions } = completionsQuery;
  const { refetch: refetchGoals } = goalsQuery;
  // First focus is skipped: the mount fetch above already loads everything, so
  // refetching then fires every query twice. Later focuses refresh after
  // interactions settle, so three network round trips plus their re-renders
  // no longer race the 350ms tab-switch animation on the JS thread.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      const task = InteractionManager.runAfterInteractions(() => {
        void refetchTasks();
        void refetchCompletions();
        void refetchGoals();
      });
      return () => task.cancel();
    }, [refetchTasks, refetchCompletions, refetchGoals]),
  );

  // Person switcher: me first, then everyone else. Defaults to me.
  const orderedMembers = useMemo(() => {
    const mine = members.filter((member) => member.user_id === myId);
    const rest = members.filter((member) => member.user_id !== myId);
    return [...mine, ...rest];
  }, [members, myId]);
  const viewingId = selectedId ?? myId;
  const viewing = members.find((member) => member.user_id === viewingId) ?? null;
  const viewingName = viewing?.profile?.display_name ?? (viewingId === myId ? 'You' : 'Member');
  const isMe = viewingId === myId;

  const mine = useMemo(
    () => (viewingId ? tasks.filter((task) => ownerOf(task) === viewingId) : []),
    [tasks, viewingId],
  );

  function isDone(taskId: string, date: string): boolean {
    return (completions.get(taskId)?.get(date)?.length ?? 0) > 0;
  }

  function doneBy(taskId: string, date: string): string | null {
    const users = completions.get(taskId)?.get(date) ?? [];
    if (users.length === 0) return null;
    if (myId && users.includes(myId)) return 'you';
    const other = members.find((member) => users.includes(member.user_id));
    return other?.profile?.display_name ?? 'someone';
  }

  const overdue = useMemo(
    () =>
      mine.filter(
        (task) => task.cadence === 'once' && createdOn(task) < day && !isDone(task.id, day),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, completions, day],
  );
  const todayList = useMemo(
    () =>
      mine.filter((task) => {
        if (isDone(task.id, day)) return false;
        if (task.cadence === 'daily') return true;
        return task.cadence === 'once' && createdOn(task) >= day;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, completions, day],
  );
  const weekList = useMemo(
    () => mine.filter((task) => task.cadence === 'weekly' && !isDone(task.id, day)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, completions, day],
  );
  const doneToday = useMemo(
    () => mine.filter((task) => isDone(task.id, day)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, completions, day],
  );
  const openCount = overdue.length + todayList.length + weekList.length;

  const goals = useMemo(() => openFirst(goalsQuery.data ?? []), [goalsQuery.data]);
  const openGoals = useMemo(() => goals.filter((goal) => !goal.is_done), [goals]);
  const doneGoals = useMemo(() => goals.filter((goal) => goal.is_done), [goals]);

  function toggleTask(task: TaskWithPeople, date: string) {
    if (!myId) return;
    const mineCompletion = completions.get(task.id)?.get(date)?.includes(myId) ?? false;
    const next = !mineCompletion;
    // Optimistic: flip immediately, reconcile with the server after.
    completionsQuery.setData((current) => {
      const nextMap = new Map<string, Map<string, string[]>>(current ?? undefined);
      const byDate = new Map<string, string[]>(nextMap.get(task.id) ?? undefined);
      const users = new Set<string>(byDate.get(date) ?? []);
      if (next) users.add(myId);
      else users.delete(myId);
      byDate.set(date, [...users]);
      nextMap.set(task.id, byDate);
      return nextMap;
    });
    if (next) tapFeedback();
    void write.run(async () => {
      await setTaskDone(task.id, myId, date, next);
      // Done needs no ping. A failure here must not fail the toggle, so the
      // cancel rides along quietly after the server confirms.
      if (next) void cancelTaskReminder(task.id);
      await completionsQuery.refetch();
    });
  }

  function removeTask(task: TaskWithPeople) {
    tasksQuery.setData((rows) => rows?.filter((row) => row.id !== task.id) ?? null);
    pendingRestore.current = async () => {
      await restoreTask(task);
      await tasksQuery.refetch();
      void syncTaskReminder({ taskId: task.id, title: task.title, dueAt: task.due_at });
    };
    undo.show(`Deleted ${task.title}`);
    void write.run(async () => {
      await deleteTask(task.id);
      void cancelTaskReminder(task.id);
      await tasksQuery.refetch();
    });
  }

  async function toggleGoal(goal: GoalWithAuthor) {
    const next = !goal.is_done;
    if (next) successFeedback();
    else tapFeedback();
    goalsQuery.setData(
      (current) =>
        current?.map((row) =>
          row.id === goal.id
            ? { ...row, is_done: next, done_at: next ? new Date().toISOString() : null }
            : row,
        ) ?? null,
    );
    const ok = await write.run(async () => {
      await setGoalDone(goal.id, next);
    });
    if (!ok) goalsQuery.refetch();
  }

  // Foreground banners + the Android channel, once per mount.
  useEffect(() => {
    setupTaskReminders();
  }, []);

  function openSheet() {
    setDraft({ ...emptyTaskDraft, assignee_id: isMe ? null : (viewingId ?? null) });
    setSheetOpen(true);
  }

  async function saveDraft() {
    if (!householdId || !myId) return;
    const { title, due_at: dueAt } = draft;
    if (dueAt && Date.parse(dueAt) <= Date.now()) {
      await write.run(async () => {
        throw new Error('Pick a deadline in the future.');
      });
      return;
    }
    let taskId: string | null = null;
    const ok = await write.run(async () => {
      taskId = await addTask(householdId, myId, draft);
    });
    if (!ok || !taskId) return;
    tapFeedback();
    setSheetOpen(false);
    setDraft(emptyTaskDraft);
    await tasksQuery.refetch();
    if (dueAt) void syncTaskReminder({ taskId, title, dueAt });
  }

  async function handleUndo() {
    const restore = pendingRestore.current;
    pendingRestore.current = null;
    undo.clear();
    if (!restore) return;
    await write.run(restore);
  }

  const loading = tasksQuery.loading || completionsQuery.loading;

  return (
    <View style={styles.flex}>
      <Screen bottomInset={120}>
        <ScreenHeader
          title={isMe ? 'My tasks' : viewingName}
          subtitle={openCount === 0 ? 'All caught up' : `${openCount} open`}
        />

        <StackLayout gap="lg">
          {orderedMembers.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.switcher}
              accessibilityRole="tablist"
              accessibilityLabel="Whose tasks to show"
            >
              {orderedMembers.map((member) => {
                const id = member.user_id;
                const selected = (selectedId ?? myId) === id;
                const name = member.profile?.display_name ?? 'Member';
                const short = id === myId ? 'Me' : name.split(' ')[0] || name;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Show ${name}'s tasks`}
                    onPress={() => setSelectedId(id)}
                    style={({ pressed }) => [
                      styles.memberTab,
                      {
                        borderRadius: theme.radius.pill,
                        backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                        borderColor: selected ? theme.colors.primary : theme.colors.hairline,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Avatar
                      name={name}
                      tintIndex={member.profile?.avatar_index ?? 0}
                      size={28}
                      uri={member.profile?.avatar_url ?? null}
                    />
                    <Text
                      variant="label"
                      numberOfLines={1}
                      style={{
                        color: selected ? theme.colors.onPrimary : theme.colors.textMuted,
                      }}
                    >
                      {short}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <SegmentedControl
            options={[
              { value: 'list', label: 'List' },
              { value: 'week', label: 'Week' },
            ]}
            value={view}
            onChange={setView}
            accessibilityLabel="Tasks layout"
          />

          {loading ? (
            <LoadingState label="Loading tasks…" />
          ) : tasksQuery.error || !householdId ? (
            <ErrorState
              message={tasksQuery.error ?? 'Join or create a home first.'}
              onRetry={() => {
                void tasksQuery.refetch();
                void completionsQuery.refetch();
              }}
            />
          ) : (
            <>
              {write.error ? (
                <Text variant="caption" tone="negative">
                  {write.error}
                </Text>
              ) : null}

              {view === 'week' ? (
                <Animated.View entering={FadeInUp.duration(350)}>
                  <Card>
                    <View style={styles.weekHead}>
                      <Avatar
                        name={viewingName}
                        tintIndex={viewing?.profile?.avatar_index ?? 0}
                        size={32}
                        uri={viewing?.profile?.avatar_url ?? null}
                      />
                      <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                        {isMe ? 'Your week' : `${viewingName}'s week`}
                      </Text>
                    </View>
                    <WeekGrid
                      anchor={anchor}
                      onAnchorChange={setAnchor}
                      memberName={viewingName}
                      tasks={mine}
                      completions={completions}
                      onToggle={toggleTask}
                    />
                  </Card>
                </Animated.View>
              ) : mine.length === 0 ? (
                <Animated.View entering={FadeInUp.duration(350)}>
                  <Card>
                    <EmptyState
                      icon="ListTodo"
                      title={isMe ? 'No tasks yet' : `${viewingName} has no tasks`}
                      message={
                        isMe
                          ? 'Add the first one — daily for yourself, weekly for anyone.'
                          : 'Weekly and one-off tasks assigned here show up for them.'
                      }
                      actionLabel={isMe ? 'Add the first task' : 'Assign a task'}
                      onAction={openSheet}
                    />
                  </Card>
                </Animated.View>
              ) : (
                <>
                  {overdue.length > 0 ? (
                    <Animated.View entering={FadeInUp.duration(350)}>
                      <View>
                        <SectionHeader
                          label="Overdue"
                          action={<Badge label={`${overdue.length}`} tone="negative" />}
                        />
                        <View style={{ gap: theme.spacing.sm }}>
                          {overdue.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              done={false}
                              doneBy={null}
                              onToggle={() => toggleTask(task, day)}
                              onDelete={() => removeTask(task)}
                              onOpen={() =>
                                router.push({ pathname: '/task/[id]', params: { id: task.id } })
                              }
                            />
                          ))}
                        </View>
                      </View>
                    </Animated.View>
                  ) : null}

                  <Animated.View entering={FadeInUp.duration(350).delay(90)}>
                    <View>
                      <SectionHeader
                        label="Today"
                        action={
                          todayList.length > 0 ? (
                            <Badge label={`${todayList.length} open`} tone="neutral" />
                          ) : undefined
                        }
                      />
                      {todayList.length === 0 ? (
                        <Card tone="sage">
                          <Text variant="body" tone="muted">
                            Nothing due today — enjoy it.
                          </Text>
                        </Card>
                      ) : (
                        <View style={{ gap: theme.spacing.sm }}>
                          {todayList.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              done={false}
                              doneBy={null}
                              onToggle={() => toggleTask(task, day)}
                              onDelete={() => removeTask(task)}
                              onOpen={() =>
                                router.push({ pathname: '/task/[id]', params: { id: task.id } })
                              }
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  </Animated.View>

                  {weekList.length > 0 ? (
                    <Animated.View entering={FadeInUp.duration(350).delay(180)}>
                      <View>
                        <SectionHeader
                          label="This week"
                          action={<Badge label={`${weekList.length} open`} tone="neutral" />}
                        />
                        <View style={{ gap: theme.spacing.sm }}>
                          {weekList.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              done={false}
                              doneBy={null}
                              onToggle={() => toggleTask(task, day)}
                              onDelete={() => removeTask(task)}
                              onOpen={() =>
                                router.push({ pathname: '/task/[id]', params: { id: task.id } })
                              }
                            />
                          ))}
                        </View>
                      </View>
                    </Animated.View>
                  ) : null}

                  {doneToday.length > 0 ? (
                    <Collapsible label={`Done today (${doneToday.length})`}>
                      <View style={{ gap: theme.spacing.sm }}>
                        {doneToday.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            done
                            doneBy={doneBy(task.id, day)}
                            onToggle={() => toggleTask(task, day)}
                            onDelete={() => removeTask(task)}
                            onOpen={() =>
                              router.push({ pathname: '/task/[id]', params: { id: task.id } })
                            }
                          />
                        ))}
                      </View>
                    </Collapsible>
                  ) : null}
                </>
              )}

              <View>
                <SectionHeader
                  label="Family goals"
                  action={
                    goals.length > 0 ? (
                      <Badge
                        label={
                          doneGoals.length === goals.length
                            ? 'All done'
                            : `${doneGoals.length} of ${goals.length} done`
                        }
                        tone={
                          doneGoals.length === goals.length && goals.length > 0
                            ? 'positive'
                            : 'neutral'
                        }
                      />
                    ) : undefined
                  }
                />
                {goalsQuery.loading ? (
                  <LoadingState label="Loading goals…" />
                ) : goals.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon="Flag"
                      title="No goals this month"
                      message="Anything the house wants — repaint the kitchen, a trip, six months saved."
                      actionLabel="Set the first goal"
                      onAction={() =>
                        router.push({ pathname: '/goal/[id]', params: { id: 'new' } })
                      }
                    />
                  </Card>
                ) : (
                  <StackLayout gap="md">
                    <ListSection>
                      {openGoals.map((goal, index) => (
                        <Row
                          key={goal.id}
                          separator={index < openGoals.length - 1 || doneGoals.length > 0}
                          onPress={() =>
                            router.push({ pathname: '/goal/[id]', params: { id: goal.id } })
                          }
                          accessibilityLabel={goal.title}
                          accessibilityHint="Opens goal details"
                        >
                          <CheckBox
                            checked={false}
                            label={`Mark ${goal.title} done`}
                            onToggle={() => void toggleGoal(goal)}
                          />
                          <View style={styles.flexTitles}>
                            <Text variant="body" style={styles.flex} numberOfLines={1}>
                              {goal.title}
                            </Text>
                            {goal.created_by_profile ? (
                              <Text variant="caption" tone="faint" numberOfLines={1}>
                                {`Added by ${goal.created_by_profile.display_name}`}
                              </Text>
                            ) : null}
                          </View>
                          <Icon name="ChevronRight" size={18} tone="faint" />
                        </Row>
                      ))}
                      {doneGoals.length > 0 ? (
                        <Collapsible label={`Done (${doneGoals.length})`}>
                          {doneGoals.map((goal) => (
                            <Row
                              key={goal.id}
                              separator={false}
                              onPress={() =>
                                router.push({ pathname: '/goal/[id]', params: { id: goal.id } })
                              }
                              accessibilityLabel={`${goal.title}, done`}
                              accessibilityHint="Opens goal details"
                            >
                              <CheckBox checked label={`${goal.title}, done`} />
                              <Text
                                variant="body"
                                tone="muted"
                                style={styles.flex}
                                numberOfLines={1}
                              >
                                {goal.title}
                              </Text>
                            </Row>
                          ))}
                        </Collapsible>
                      ) : null}
                    </ListSection>
                    <Button
                      label="Add a goal"
                      variant="tertiary"
                      onPress={() => router.push({ pathname: '/goal/[id]', params: { id: 'new' } })}
                    />
                  </StackLayout>
                )}
              </View>
            </>
          )}
        </StackLayout>

        <Sheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Add a task"
          footer={
            <Button
              label="Add task"
              fullWidth
              loading={write.pending}
              onPress={() => void saveDraft()}
            />
          }
        >
          <TaskForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => void saveDraft()}
            members={members}
            meId={myId}
          />
          {write.error ? (
            <Text variant="caption" tone="negative">
              {write.error}
            </Text>
          ) : null}
        </Sheet>

        <UndoToast message={undo.message} onAction={() => void handleUndo()} bottomOffset={64} />
      </Screen>
      {/* Bottom-right add, one step above the tab bar — like other apps.
          The tab container already ends at the bar, so no inset is added. */}
      <Fab icon="Plus" label="Add task" onPress={openSheet} style={{ bottom: theme.spacing.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexTitles: { flex: 1, gap: 2, minWidth: 0 },
  switcher: { flexDirection: 'row', gap: 8, paddingVertical: 4, alignItems: 'center' },
  memberTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: HIT_SIZE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
