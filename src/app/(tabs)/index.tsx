import { router } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CheckBox,
  CircleButton,
  EmptyState,
  ErrorState,
  HomeSkeleton,
  Icon,
  ListSection,
  MoneyText,
  ProgressBar,
  Row,
  SectionHeader,
  successFeedback,
  tapFeedback,
  Text,
  UndoToast,
  usePageTop,
} from '@/components/ui';
import { currentMonth, formatMonth, today } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery, useUndo } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import { readableError, supabase } from '@/lib/supabase';
import { setTaskDone } from '@/features/tasks/api';
import type { Goal, Grocery, HouseExpense, Task } from '@/lib/types';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/**
 * Home: "what needs me today".
 *
 * Deliberately NOT a grid of statistic tiles — a wall of identical numbers is
 * the other half of the AI-slop look, and it also fails the job. Someone opening
 * this wants to know what to do next, not to admire a bar chart. So: today's
 * tasks first, then what is unbought, then where the month stands, then goals.
 */
export default function Home() {
  const theme = useTheme();
  const { user } = useAuth();
  const { household, members, profile } = useHousehold();

  const month = currentMonth();

  const load = useCallback(async () => {
    const householdId = household?.id;
    if (!householdId || !user) {
      return {
        tasks: [] as Task[],
        groceries: [] as Grocery[],
        expenses: [] as HouseExpense[],
        goals: [] as Goal[],
        pool: 0,
      };
    }

    const [tasksResult, groceriesResult, expensesResult, goalsResult, poolResult] =
      await Promise.all([
        // Mine: anything assigned to me plus anything I created. Daily tasks
        // are personal — their assignee is empty and the creator owns them —
        // so matching the creator too is what makes today's tasks show up here.
        supabase
          .from('tasks')
          .select('*')
          .or(`assignee_id.eq.${user.id},assigned_by.eq.${user.id}`)
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),

        supabase
          .from('groceries')
          .select('*')
          .eq('household_id', householdId)
          .eq('month', month)
          .eq('is_bought', false)
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),

        supabase
          .from('house_expenses')
          .select('*')
          .eq('household_id', householdId)
          .eq('month', month)
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),

        supabase
          .from('goals')
          .select('*')
          .eq('household_id', householdId)
          .eq('month', month)
          .order('created_at', { ascending: true })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),

        // The shared total only. Individual savings rows are private by RLS and
        // must never be queried here.
        supabase.rpc('savings_pool_total', { p_household: householdId }).then(({ data, error }) => {
          if (error) throw error;
          return Number(data ?? 0);
        }),
      ]);

    // Home is "what needs me": tasks already ticked off today stay out of
    // sight here (the full picture, including history, lives on Tasks).
    const doneIds = await fetchDoneTaskIds(
      tasksResult.map((row) => row.id as string),
      today(),
    );

    return {
      tasks: tasksResult.filter((row) => !doneIds.has(row.id as string)),
      groceries: groceriesResult,
      expenses: expensesResult,
      goals: goalsResult,
      pool: poolResult,
    };
  }, [household?.id, user, month]);

  const { data, error, loading, refreshing, refetch, setData } = useQuery(load, [
    household?.id,
    user?.id,
    month,
  ]);
  const write = useMutation();
  const undo = useUndo();
  const pendingRestore = useRef<(() => Promise<void>) | null>(null);

  const displayName = profile?.display_name ?? user?.email?.split('@')[0] ?? 'there';
  const firstName = displayName.split(' ')[0] || displayName;
  const householdName = household?.name?.trim() || 'Your home';
  const greeting = greetingParts();

  // Memoised so the `?? []` fallback is a stable reference; otherwise each render
  // makes a new array and the totals below recompute every time.
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const groceries = useMemo(() => data?.groceries ?? [], [data]);
  const expenses = useMemo(() => data?.expenses ?? [], [data]);
  const goals = useMemo(() => data?.goals ?? [], [data]);
  const pool = data?.pool ?? 0;

  const expenseTotal = useMemo(
    () => expenses.reduce((sum, row) => sum + Number(row.amount), 0),
    [expenses],
  );
  const unpaidCount = useMemo(() => expenses.filter((row) => !row.is_paid).length, [expenses]);

  // One focal point: "what needs me today" = my tasks + the shared grocery list.
  // Keep the list short so the screen scans in one glance.
  const visibleTasks = tasks.slice(0, 3);
  const hasMoreTasks = tasks.length > visibleTasks.length;
  const todayCount = tasks.length + groceries.length;
  const isFirstRun =
    members.length <= 1 && groceries.length === 0 && tasks.length === 0 && goals.length === 0;

  // Goals live here now, not in their own tab: the month's goals with a
  // tappable done state. Four rows max, then a quiet overflow line.
  const visibleGoals = goals.slice(0, 4);
  const hiddenGoals = goals.length - visibleGoals.length;
  const doneGoals = useMemo(() => goals.filter((row) => row.is_done).length, [goals]);

  async function toggleGoal(goal: Goal) {
    const next = !goal.is_done;
    if (next) successFeedback();
    else tapFeedback();
    // Optimistic: flip immediately, reconcile with the server after.
    setData((current) =>
      current
        ? {
            ...current,
            goals: current.goals.map((row) =>
              row.id === goal.id
                ? {
                    ...row,
                    is_done: next,
                    done_at: next ? new Date().toISOString() : null,
                  }
                : row,
            ),
          }
        : current,
    );
    const { error: updateError } = await supabase
      .from('goals')
      .update({ is_done: next, done_at: next ? new Date().toISOString() : null })
      .eq('id', goal.id);
    if (updateError) refetch();
  }

  function toggleTaskHome(task: Task) {
    if (!user) return;
    const userId = user.id;
    const day = today();
    successFeedback();
    // Optimistic: Home only shows undone tasks, so checking one off removes
    // it from this list immediately. The write goes through useMutation so a
    // failure surfaces in write.error instead of silently reappearing.
    setData((current) =>
      current ? { ...current, tasks: current.tasks.filter((row) => row.id !== task.id) } : current,
    );
    pendingRestore.current = async () => {
      await setTaskDone(task.id, userId, day, false);
      await refetch();
    };
    undo.show(`Marked ${task.title} done`);
    void write.run(async () => {
      await setTaskDone(task.id, userId, day, true);
      await refetch();
    });
  }

  async function handleUndoTask() {
    const restore = pendingRestore.current;
    pendingRestore.current = null;
    undo.clear();
    if (!restore) return;
    await write.run(restore);
  }

  const coverage = expenseTotal > 0 ? Math.min(1, pool / expenseTotal) : 1;
  const coverageText =
    expenseTotal === 0
      ? 'No bills added yet'
      : pool >= expenseTotal
        ? 'Pool covers all bills'
        : `Pool covers ${Math.round(coverage * 100)}% of bills`;

  // Panel in both modes: the artwork (assets/gradient.png) over the Ink Deep
  // base. The artwork is dark, so the greeting is always the near-white ink —
  // `onInverse` in light, `surfaceInverse` in dark (`onInverse` flips to dark
  // ink in dark mode and would vanish on the artwork).
  const panelBg = theme.colors.textAccent;
  const onPanel = theme.name === 'dark' ? theme.colors.surfaceInverse : theme.colors.onInverse;
  // Shortcut buttons match the Settings button: lime fill on the dark artwork.
  const panelAccentFill = 'lime';

  const familyPreview = members.slice(0, 4);
  const familyLabel =
    members.length === 1
      ? `${householdName} · 1 member`
      : `${householdName} · ${members.length} members`;

  const insets = useSafeAreaInsets();
  // Same hook every Screen uses — the hero gap and the page gap are one value.
  const pageTop = usePageTop();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refetch}
            tintColor={theme.colors.textMuted}
          />
        }
      >
        {/* Dual tone: artwork panel melting into the page canvas — the same canvas
          every other screen sits on — joined by a rounded seam. The artwork is
          clipped to the seam and covers the panel; the theme base behind it
          guarantees contrast even if the image ever fails to load. */}
        <View
          style={{
            backgroundColor: panelBg,
            paddingTop: pageTop,
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
            borderBottomLeftRadius: theme.radius.xl,
            borderBottomRightRadius: theme.radius.xl,
            overflow: 'hidden',
          }}
        >
          <Image
            source={require('../../../assets/gradient.png')}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <View style={{ gap: theme.spacing.xl }}>
            <View style={styles.heroTop}>
              <Avatar
                name={displayName}
                tintIndex={profile?.avatar_index ?? 0}
                size={56}
                uri={profile?.avatar_url ?? null}
              />
              <View style={styles.heroTitles}>
                <Text
                  variant="display"
                  accessibilityRole="header"
                  accessibilityLabel={`${greeting.head} ${greeting.daypart}, ${firstName}`}
                  numberOfLines={1}
                  style={{ color: onPanel }}
                >
                  {greeting.head}
                </Text>
                <Text
                  variant="title"
                  numberOfLines={2}
                  style={{ color: onPanel }}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                >
                  {`${greeting.daypart}, ${firstName}`}
                </Text>
                <Text variant="caption" numberOfLines={1} style={{ color: onPanel, opacity: 0.7 }}>
                  {householdName}
                </Text>
              </View>
              {/* Settings lives stuck top-right over every tab — same lime
                  button, same corner, so it is never duplicated here. */}
            </View>

            <Card tone="green">
              <View style={styles.between}>
                <View style={[styles.flex, styles.inlineStatus]}>
                  <Text variant="label" tone="muted" numberOfLines={1}>
                    House expenses
                  </Text>
                  <Badge
                    label={unpaidCount === 0 ? 'Settled' : `${unpaidCount} unpaid`}
                    tone={unpaidCount === 0 ? 'positive' : 'negative'}
                  />
                </View>
                <CircleButton
                  icon="ChevronRight"
                  label="View house bills"
                  fill={panelAccentFill}
                  onPress={() => router.push('/(tabs)/house-expenses')}
                />
              </View>

              <MoneyText amount={expenseTotal} variant="display" tone="default" />

              <View style={styles.between}>
                <Text variant="label" tone="muted" numberOfLines={1}>
                  Savings pool
                </Text>
                <MoneyText amount={pool} variant="bodyStrong" tone="default" />
              </View>

              <View style={{ gap: theme.spacing.xs }}>
                <ProgressBar value={coverage} style={{ backgroundColor: theme.colors.surface }} />
                <Text variant="caption" tone="faint" numberOfLines={1}>
                  {`${formatMonth(month)} · ${coverageText}`}
                </Text>
              </View>

              <View style={styles.quickRow}>
                <QuickAction
                  icon="ShoppingCart"
                  label="Groceries"
                  hint="Opens the grocery list"
                  fill={panelAccentFill}
                  // navigate, not push: pushing stacks a duplicate route and
                  // the tab bar keeps highlighting the old tab.
                  onPress={() => router.navigate('/(tabs)/groceries')}
                />
                <QuickAction
                  icon="Wallet"
                  label="Money"
                  hint="Opens your money"
                  fill={panelAccentFill}
                  onPress={() => router.navigate('/(tabs)/money')}
                />
                <QuickAction
                  icon="Receipt"
                  label="Bills"
                  hint="Opens the house bills"
                  fill={panelAccentFill}
                  onPress={() => router.push('/(tabs)/house-expenses')}
                />
                <QuickAction
                  icon="Users"
                  label="Family"
                  hint="Opens settings to see members"
                  fill={panelAccentFill}
                  onPress={() => router.push('/settings')}
                />
              </View>
            </Card>
          </View>
        </View>

        {/* Page body on the shared canvas — the same background every other
          screen sits on. */}
        <View
          style={{
            backgroundColor: theme.colors.canvas,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.xl,
            paddingBottom: insets.bottom + theme.spacing.xl,
          }}
        >
          {loading ? (
            <HomeSkeleton hero={false} />
          ) : error ? (
            <ErrorState
              message={readableError(error) ?? 'Could not load your home.'}
              onRetry={refetch}
            />
          ) : (
            <View style={{ gap: theme.spacing.xl }}>
              {write.error ? (
                <Text variant="caption" tone="negative">
                  {write.error}
                </Text>
              ) : null}
              {isFirstRun ? (
                <Card tone="green">
                  <Text variant="title">Your home is ready</Text>
                  <Text variant="body" tone="muted" numberOfLines={3}>
                    Add your first grocery, task or bill. Everyone you invite sees the same list.
                  </Text>
                  <Button
                    label="Start with groceries"
                    variant="primary"
                    onPress={() => router.navigate('/(tabs)/groceries')}
                  />
                </Card>
              ) : null}

              {/* The one focal point. Tasks + groceries live in a single list so
              "Today" reads once instead of as two competing sections. */}
              <View>
                <SectionHeader
                  label="Today"
                  action={
                    todayCount > 0 ? (
                      <Badge
                        label={todayCount === 1 ? '1 open' : `${todayCount} open`}
                        tone="neutral"
                      />
                    ) : undefined
                  }
                />
                <ListSection>
                  {todayCount === 0 ? (
                    <EmptyState
                      icon="CircleCheck"
                      title="Nothing due today"
                      message="Anything for today shows up here."
                      actionLabel="View tasks"
                      onAction={() => router.navigate('/(tabs)/tasks')}
                    />
                  ) : (
                    <>
                      {visibleTasks.map((task, index) => {
                        const isLast =
                          index === visibleTasks.length - 1 &&
                          groceries.length === 0 &&
                          !hasMoreTasks;
                        const cadence = task.cadence === 'once' ? null : cadenceLabel(task.cadence);
                        return (
                          <Row
                            key={task.id}
                            separator={!isLast}
                            onPress={() => void toggleTaskHome(task)}
                            accessibilityLabel={task.title}
                            accessibilityHint="Marks the task done"
                            accessibilityState={{ checked: false }}
                          >
                            {/* Visual-only: the row above already toggles on press. */}
                            <CheckBox checked={false} label={task.title} />
                            <Text variant="body" style={styles.flex} numberOfLines={1}>
                              {task.title}
                            </Text>
                            {cadence ? (
                              <Text variant="caption" tone="faint" numberOfLines={1}>
                                {cadence}
                              </Text>
                            ) : null}
                          </Row>
                        );
                      })}
                      {hasMoreTasks ? (
                        <Row
                          separator={groceries.length > 0}
                          onPress={() => router.navigate('/(tabs)/tasks')}
                          accessibilityLabel={`View all ${tasks.length} tasks`}
                          accessibilityHint="Opens your tasks"
                        >
                          <Text variant="label" tone="muted" style={styles.flex} numberOfLines={1}>
                            {`View all ${tasks.length} tasks`}
                          </Text>
                          <Icon name="ChevronRight" size={18} tone="faint" />
                        </Row>
                      ) : null}
                      {groceries.length > 0 || visibleTasks.length === 0 ? (
                        <Row
                          separator={false}
                          onPress={() => router.navigate('/(tabs)/groceries')}
                          accessibilityLabel={`${groceries.length} items still to buy`}
                          accessibilityHint="Opens the grocery list"
                        >
                          <Icon name="ShoppingCart" size={20} tone="muted" />
                          <Text variant="body" style={styles.flex} numberOfLines={1}>
                            {groceries.length === 1
                              ? '1 item to buy'
                              : `${groceries.length} items to buy`}
                          </Text>
                          <Icon name="ChevronRight" size={18} tone="faint" />
                        </Row>
                      ) : null}
                    </>
                  )}
                </ListSection>
              </View>

              {/* Family goals, kept on Home instead of a sixth tab. */}
              <View>
                <SectionHeader
                  label="Goals"
                  action={
                    goals.length > 0 ? (
                      <Badge
                        label={
                          doneGoals === goals.length
                            ? 'All done'
                            : `${doneGoals} of ${goals.length} done`
                        }
                        tone={doneGoals === goals.length ? 'positive' : 'neutral'}
                      />
                    ) : undefined
                  }
                />
                <ListSection>
                  {goals.length === 0 ? (
                    <EmptyState
                      icon="Flag"
                      title="No goals this month"
                      message="Goals you set show up here."
                    />
                  ) : (
                    <>
                      {visibleGoals.map((goal, index) => {
                        const isLast = index === visibleGoals.length - 1 && hiddenGoals <= 0;
                        return (
                          <Row
                            key={goal.id}
                            separator={!isLast}
                            onPress={() => void toggleGoal(goal)}
                            accessibilityLabel={goal.title}
                            accessibilityHint={
                              goal.is_done ? 'Marks the goal not done' : 'Marks the goal done'
                            }
                            accessibilityState={{ checked: goal.is_done }}
                          >
                            {/* Visual-only: the row above already toggles on press. */}
                            <CheckBox checked={goal.is_done} label={goal.title} />
                            <View style={styles.flexTitles}>
                              <Text
                                variant="body"
                                tone={goal.is_done ? 'muted' : 'default'}
                                style={styles.flex}
                                numberOfLines={1}
                              >
                                {goal.title}
                              </Text>
                              {goal.description ? (
                                <Text variant="caption" tone="faint" numberOfLines={1}>
                                  {goal.description}
                                </Text>
                              ) : null}
                            </View>
                          </Row>
                        );
                      })}
                      {hiddenGoals > 0 ? (
                        <Row separator={false}>
                          <Text variant="caption" tone="faint" numberOfLines={1}>
                            {`+${hiddenGoals} more this month`}
                          </Text>
                        </Row>
                      ) : null}
                    </>
                  )}
                </ListSection>
              </View>

              {/* Family compacts to a single row. The full roster with the Head
              badge already lives in Settings — repeating it here doubles the
              text without adding an action. */}
              <ListSection>
                <Row
                  separator={false}
                  onPress={() => router.push('/settings')}
                  accessibilityLabel={familyLabel}
                  accessibilityHint="Opens settings to see members"
                >
                  <View style={styles.avatarStack}>
                    {familyPreview.map((member, index) => (
                      <View
                        key={member.user_id}
                        style={index === 0 ? undefined : { marginLeft: -theme.spacing.sm }}
                      >
                        <Avatar
                          name={member.profile?.display_name}
                          tintIndex={member.profile?.avatar_index ?? 0}
                          size={32}
                          uri={member.profile?.avatar_url ?? null}
                          style={{
                            borderWidth: 2,
                            borderColor: theme.colors.surface,
                          }}
                        />
                      </View>
                    ))}
                  </View>
                  <Text variant="body" style={styles.flex} numberOfLines={1}>
                    {familyLabel}
                  </Text>
                  <Icon name="ChevronRight" size={18} tone="faint" />
                </Row>
              </ListSection>
            </View>
          )}
        </View>
      </ScrollView>
      <UndoToast message={undo.message} onAction={() => void handleUndoTask()} />
    </View>
  );
}

function cadenceLabel(cadence: Task['cadence']): string {
  if (cadence === 'daily') return 'Daily';
  if (cadence === 'weekly') return 'Weekly';
  return 'One-off';
}

/**
 * Task ids with a completion logged on the given date. A task ticked off by
 * anyone counts as done — a shared chore finished by someone else needs
 * nobody.
 */
async function fetchDoneTaskIds(taskIds: string[], date: string): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id')
    .in('task_id', taskIds)
    .eq('completed_on', date);
  if (error) throw error;
  return new Set(((data ?? []) as { task_id: string }[]).map((row) => row.task_id));
}

/** Time-aware greeting parts — big "Good" over smaller "Evening, Aarav". */
function greetingParts(now: Date = new Date()): { head: string; daypart: string } {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return { head: 'Good', daypart: 'Morning' };
  if (hour >= 12 && hour < 17) return { head: 'Good', daypart: 'Afternoon' };
  if (hour >= 17 && hour < 22) return { head: 'Good', daypart: 'Evening' };
  return { head: 'Good', daypart: 'Night' };
}

/** One of the four shortcuts in the month card: filled circle over a caption. */
function QuickAction({
  icon,
  label,
  hint,
  onPress,
  fill = 'ink',
}: {
  icon: 'ShoppingCart' | 'ListTodo' | 'Receipt' | 'Users' | 'Wallet';
  label: string;
  hint: string;
  onPress: () => void;
  fill?: 'ink' | 'lime';
}) {
  const theme = useTheme();
  const background = fill === 'lime' ? theme.colors.primary : theme.colors.surfaceInverse;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View
        style={[
          styles.quickCircle,
          {
            borderRadius: theme.radius.full,
            backgroundColor: background,
          },
        ]}
      >
        <Icon name={icon} size={20} tone={fill === 'lime' ? 'onPrimary' : 'inverse'} />
      </View>
      <Text variant="caption" tone="default" numberOfLines={1} style={styles.quickLabel}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexTitles: { flex: 1, gap: 2, minWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroTitles: { flex: 1, gap: 8, minWidth: 0 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickAction: { flex: 1, alignItems: 'center', gap: 8 },
  quickCircle: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { textAlign: 'center' },
});
