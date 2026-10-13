/**
 * Goal details (sub-agent 4): who set it, what done looks like, and the rest
 * of the month's goals below — open first, done collapsed.
 *
 * The same route adds a goal when opened as `/goal/new`. Completing a goal is
 * a two-step confirm with a celebratory haptic: a rare positive moment.
 */

import { Stack as RouterStack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CheckBox,
  Collapsible,
  ConfirmDialog,
  ErrorState,
  Icon,
  IconButton,
  ListSection,
  LoadingState,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  Stack as StackLayout,
  successFeedback,
  tapFeedback,
  Text,
} from '@/components/ui';
import { currentMonth, formatMonth } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import {
  addGoal,
  deleteGoal,
  fetchAllGoals,
  fetchGoal,
  openFirst,
  setGoalDone,
  updateGoal,
  type GoalWithAuthor,
} from '@/features/goals/api';
import { emptyGoalDraft, GoalForm, type GoalDraft } from '@/features/goals/GoalForm';

export default function GoalDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const { household } = useHousehold();
  const write = useMutation();

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [confirmDone, setConfirmDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newDraft, setNewDraft] = useState<GoalDraft>(() => emptyGoalDraft(currentMonth()));

  const householdId = household?.id ?? null;
  const myId = user?.id ?? null;

  const query = useQuery<GoalWithAuthor | null>(async () => {
    if (isNew) return null;
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchGoal(id);
  }, [householdId, id, isNew]);

  const goal = query.data ?? null;

  const othersQuery = useQuery<GoalWithAuthor[]>(async () => {
    if (!householdId || !goal) return [];
    const all = await fetchAllGoals(householdId);
    return openFirst(all.filter((row) => row.month === goal.month && row.id !== goal.id));
  }, [householdId, goal?.id, goal?.month]);
  const others = useMemo(() => othersQuery.data ?? [], [othersQuery.data]);

  function openEdit() {
    if (!goal) return;
    tapFeedback();
    setDraft({ title: goal.title, description: goal.description, month: goal.month });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!goal || !draft) return;
    const ok = await write.run(async () => {
      await updateGoal(goal.id, draft);
    });
    if (!ok) return;
    setEditOpen(false);
    setDraft(null);
    await query.refetch();
    await othersQuery.refetch();
  }

  async function saveNew() {
    if (!householdId || !myId) return;
    let created: string | null = null;
    const ok = await write.run(async () => {
      created = await addGoal(householdId, myId, newDraft);
    });
    if (!ok || !created) return;
    successFeedback();
    router.replace({ pathname: '/goal/[id]', params: { id: created } });
  }

  async function confirmToggle() {
    if (!goal) return;
    const next = !goal.is_done;
    setConfirmDone(false);
    if (next) successFeedback();
    else tapFeedback();
    const ok = await write.run(async () => {
      await setGoalDone(goal.id, next);
    });
    if (!ok) return;
    await query.refetch();
    await othersQuery.refetch();
  }

  async function remove() {
    if (!goal) return;
    const ok = await write.run(async () => {
      await deleteGoal(goal.id);
    });
    setConfirmDelete(false);
    if (!ok) return;
    router.back();
  }

  if (isNew) {
    return (
      <Screen>
        <RouterStack.Screen options={{ title: 'New goal' }} />
        <ScreenHeader
          title="New goal"
          subtitle="Anything the house wants"
          left={
            <IconButton
              icon={<Icon name="ChevronLeft" size={24} />}
              label="Go back"
              onPress={() => router.back()}
            />
          }
        />
        <Card>
          <GoalForm draft={newDraft} onChange={setNewDraft} onSubmit={() => void saveNew()} />
          {write.error ? (
            <Text variant="caption" tone="negative">
              {write.error}
            </Text>
          ) : null}
          <Button label="Set goal" loading={write.pending} onPress={() => void saveNew()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <RouterStack.Screen options={{ title: 'Goal' }} />
      <ScreenHeader
        title={goal ? goal.title : 'Goal'}
        subtitle={goal ? formatMonth(goal.month) : undefined}
        left={
          <IconButton
            icon={<Icon name="ChevronLeft" size={24} />}
            label="Go back"
            onPress={() => router.back()}
          />
        }
        right={
          goal ? <Button label="Edit" size="sm" variant="tertiary" onPress={openEdit} /> : undefined
        }
      />

      {query.loading ? (
        <LoadingState label="Loading goal…" />
      ) : query.error || !goal ? (
        <ErrorState
          message={query.error ?? 'That goal is gone.'}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <StackLayout gap="lg">
          <Animated.View entering={FadeInUp.duration(350)}>
            <Card tone={goal.is_done ? 'green' : 'surface'}>
              <View style={styles.head}>
                <Badge
                  label={goal.is_done ? 'Done' : 'Open'}
                  tone={goal.is_done ? 'positive' : 'neutral'}
                />
                <Text variant="caption" tone="faint" numberOfLines={1}>
                  {formatMonth(goal.month)}
                </Text>
              </View>
              <Text variant="title" accessibilityRole="header">
                {goal.title}
              </Text>
              {goal.description ? (
                <Text variant="body" tone="muted">
                  {goal.description}
                </Text>
              ) : null}
              <View style={styles.author}>
                <Avatar
                  name={goal.created_by_profile?.display_name}
                  tintIndex={goal.created_by_profile?.avatar_index ?? 0}
                  size={32}
                  uri={goal.created_by_profile?.avatar_url ?? null}
                />
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {`Set by ${goal.created_by_profile?.display_name ?? 'someone'}`}
                </Text>
              </View>
              {write.error ? (
                <Text variant="caption" tone="negative">
                  {write.error}
                </Text>
              ) : null}
              {goal.is_done ? (
                <Button
                  label="Reopen goal"
                  variant="tertiary"
                  onPress={() => setConfirmDone(true)}
                />
              ) : (
                <Button label="Mark done" onPress={() => setConfirmDone(true)} />
              )}
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(350).delay(90)}>
            <View>
              <SectionHeader label={`More in ${formatMonth(goal.month)}`} />
              {othersQuery.loading ? (
                <LoadingState label="Loading goals…" />
              ) : others.length === 0 ? (
                <Card tone="sage">
                  <Text variant="body" tone="muted">
                    Nothing else this month — this is the one.
                  </Text>
                </Card>
              ) : (
                <ListSection>
                  {others
                    .filter((row) => !row.is_done)
                    .map((row, index, open) => (
                      <GoalLink
                        key={row.id}
                        goal={row}
                        separator={index < open.length - 1 || others.some((r) => r.is_done)}
                      />
                    ))}
                  {others.some((row) => row.is_done) ? (
                    <Collapsible label={`Done (${others.filter((row) => row.is_done).length})`}>
                      {others
                        .filter((row) => row.is_done)
                        .map((row) => (
                          <GoalLink key={row.id} goal={row} separator={false} />
                        ))}
                    </Collapsible>
                  ) : null}
                </ListSection>
              )}
            </View>
          </Animated.View>

          <Button label="Delete goal" variant="danger" onPress={() => setConfirmDelete(true)} />
        </StackLayout>
      )}

      <Sheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit goal"
        footer={
          <Button
            label="Save changes"
            fullWidth
            loading={write.pending}
            onPress={() => void saveEdit()}
          />
        }
      >
        {draft ? (
          <GoalForm draft={draft} onChange={setDraft} onSubmit={() => void saveEdit()} />
        ) : null}
        {write.error ? (
          <Text variant="caption" tone="negative">
            {write.error}
          </Text>
        ) : null}
      </Sheet>

      <ConfirmDialog
        visible={confirmDone}
        title={
          goal?.is_done ? `Reopen ${goal?.title ?? 'goal'}?` : `Finish ${goal?.title ?? 'goal'}?`
        }
        message={
          goal?.is_done
            ? 'It goes back on the open list for everyone.'
            : 'Everyone sees it done. Worth a small celebration.'
        }
        confirmLabel={goal?.is_done ? 'Reopen' : 'Mark done'}
        pending={write.pending}
        onConfirm={() => void confirmToggle()}
        onCancel={() => setConfirmDone(false)}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${goal?.title ?? 'goal'}?`}
        message="This removes it for everyone. This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={write.pending}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

function GoalLink({ goal, separator }: { goal: GoalWithAuthor; separator: boolean }) {
  const router = useRouter();
  return (
    <Row
      separator={separator}
      onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}
      accessibilityLabel={`${goal.title}${goal.is_done ? ', done' : ''}`}
      accessibilityHint="Opens goal details"
    >
      {/* Visual-only: the row above opens details on press. */}
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
        {goal.created_by_profile ? (
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {`Added by ${goal.created_by_profile.display_name}`}
          </Text>
        ) : null}
      </View>
      <Icon name="ChevronRight" size={18} tone="faint" />
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexTitles: { flex: 1, gap: 2, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
