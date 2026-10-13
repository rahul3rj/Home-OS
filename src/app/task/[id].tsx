/**
 * Task details (sub-agent 4): what it is, who it is for, and its real
 * per-date history. Editing happens in a bottom sheet; deleting is undone
 * with a toast, never a confirm dialog.
 */

import { Stack as RouterStack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Avatar,
  Button,
  Card,
  CheckBox,
  Chip,
  EmptyState,
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
  tapFeedback,
  Text,
  UndoToast,
} from '@/components/ui';
import { formatDate, today } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery, useUndo } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import {
  deleteTask,
  fetchTaskHistory,
  fetchTasks,
  restoreTask,
  setTaskDone,
  updateTask,
  type TaskWithPeople,
} from '@/features/tasks/api';
import { cadenceLabel, TaskForm, type TaskDraft } from '@/features/tasks/TaskForm';
import { cancelTaskReminder, syncTaskReminder } from '@/features/tasks/reminders';

export default function TaskDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { household, members } = useHousehold();
  const write = useMutation();
  const undo = useUndo();
  const pendingRestore = useRef<(() => Promise<void>) | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [deleted, setDeleted] = useState<TaskWithPeople | null>(null);

  const householdId = household?.id ?? null;
  const myId = user?.id ?? null;
  const day = today();

  const query = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    const tasks = await fetchTasks(householdId);
    const task = tasks.find((row) => row.id === id) ?? null;
    const history = task ? await fetchTaskHistory(task.id) : [];
    return { task, history };
  }, [householdId, id]);

  const task = deleted ?? query.data?.task ?? null;
  const isDeleted = deleted !== null;
  const history = useMemo(() => query.data?.history ?? [], [query.data]);
  const doneToday = useMemo(
    () => history.some((row) => row.completed_on === day && (!myId || row.user_id === myId)),
    [history, day, myId],
  );

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      if (member.profile) map.set(member.user_id, member.profile.display_name);
    }
    if (myId && !map.has(myId)) map.set(myId, 'You');
    return map;
  }, [members, myId]);

  function toggleToday() {
    if (!task || !myId || isDeleted) return;
    const next = !doneToday;
    tapFeedback();
    void write.run(async () => {
      await setTaskDone(task.id, myId, day, next);
      // Done needs no ping.
      if (next) void cancelTaskReminder(task.id);
      await query.refetch();
    });
  }

  function openEdit() {
    if (!task) return;
    tapFeedback();
    setDraft({
      title: task.title,
      cadence: task.cadence,
      is_permanent: task.is_permanent,
      assignee_id: task.assignee_id,
      due_at: task.due_at,
    });
    setSheetOpen(true);
  }

  async function saveEdit() {
    if (!task || !draft) return;
    const { title, due_at: dueAt } = draft;
    if (dueAt && Date.parse(dueAt) <= Date.now()) {
      await write.run(async () => {
        throw new Error('Pick a deadline in the future.');
      });
      return;
    }
    const taskId = task.id;
    const ok = await write.run(async () => {
      await updateTask(task.id, draft);
    });
    if (!ok) return;
    setSheetOpen(false);
    setDraft(null);
    await query.refetch();
    void syncTaskReminder({ taskId, title, dueAt });
  }

  function remove() {
    if (!task) return;
    const snapshot = task;
    pendingRestore.current = async () => {
      await restoreTask(snapshot);
      setDeleted(null);
      await query.refetch();
      void syncTaskReminder({
        taskId: snapshot.id,
        title: snapshot.title,
        dueAt: snapshot.due_at,
      });
    };
    undo.show(`Deleted ${snapshot.title}`);
    void write.run(async () => {
      await deleteTask(snapshot.id);
      void cancelTaskReminder(snapshot.id);
      setDeleted(snapshot);
    });
  }

  async function handleUndo() {
    const restore = pendingRestore.current;
    pendingRestore.current = null;
    undo.clear();
    if (!restore) return;
    await write.run(restore);
  }

  return (
    <Screen bottomInset={80}>
      <RouterStack.Screen options={{ title: 'Task' }} />
      <ScreenHeader
        title={task ? task.title : 'Task'}
        subtitle={task && !isDeleted ? cadenceLabel(task.cadence) : undefined}
        left={
          <IconButton
            icon={<Icon name="ChevronLeft" size={24} />}
            label="Go back"
            onPress={() => router.back()}
          />
        }
        right={
          task && !isDeleted ? (
            <Button label="Edit" size="sm" variant="tertiary" onPress={openEdit} />
          ) : undefined
        }
      />

      {query.loading ? (
        <LoadingState label="Loading task…" />
      ) : query.error || !task ? (
        <ErrorState
          message={query.error ?? 'That task is gone.'}
          onRetry={() => void query.refetch()}
        />
      ) : isDeleted ? (
        <Card>
          <EmptyState
            icon="ListTodo"
            title={`Deleted ${task.title}`}
            message="You have a few seconds to bring it back."
            actionLabel="Back to tasks"
            onAction={() => router.back()}
          />
        </Card>
      ) : (
        <StackLayout gap="lg">
          <Animated.View entering={FadeInUp.duration(350)}>
            <ListSection>
              <Row
                separator
                onPress={toggleToday}
                accessibilityLabel={`${task.title}, ${doneToday ? 'done today' : 'not done today'}`}
                accessibilityHint="Double tap to tick off for today"
                accessibilityState={{ checked: doneToday }}
              >
                {/* Visual-only: the row above already toggles on press. */}
                <CheckBox
                  checked={doneToday}
                  label={`${task.title}, ${doneToday ? 'done today' : 'not done today'}`}
                />
                <Text variant="bodyStrong" style={styles.flex} numberOfLines={2}>
                  {doneToday ? 'Done for today' : 'Mark done for today'}
                </Text>
              </Row>
              <Row separator={false}>
                <View style={styles.chips}>
                  <Chip label={cadenceLabel(task.cadence)} selected={false} />
                  {task.is_permanent ? <Chip label="Repeats forever" selected /> : null}
                </View>
              </Row>
            </ListSection>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(350).delay(90)}>
            <View>
              <SectionHeader label="People" />
              <ListSection>
                {task.cadence === 'daily' ? (
                  <Row separator={false}>
                    <Avatar
                      name={names.get(task.assigned_by) ?? 'Member'}
                      tintIndex={
                        members.find((m) => m.user_id === task.assigned_by)?.profile
                          ?.avatar_index ?? 0
                      }
                      size={32}
                      uri={
                        members.find((m) => m.user_id === task.assigned_by)?.profile?.avatar_url ??
                        null
                      }
                    />
                    <View style={styles.flexTitles}>
                      <Text variant="body" style={styles.flex} numberOfLines={1}>
                        {names.get(task.assigned_by) ?? 'Member'}
                      </Text>
                      <Text variant="caption" tone="faint" numberOfLines={1}>
                        Daily tasks are personal — just for them
                      </Text>
                    </View>
                  </Row>
                ) : (
                  <>
                    <Row separator>
                      <Avatar
                        name={task.assignee?.display_name ?? 'Anyone'}
                        tintIndex={task.assignee?.avatar_index ?? 0}
                        size={32}
                        uri={task.assignee?.avatar_url ?? null}
                      />
                      <View style={styles.flexTitles}>
                        <Text variant="body" style={styles.flex} numberOfLines={1}>
                          {task.assignee?.display_name ?? 'Anyone'}
                        </Text>
                        <Text variant="caption" tone="faint" numberOfLines={1}>
                          Assigned to
                        </Text>
                      </View>
                    </Row>
                    <Row separator={false}>
                      <Avatar
                        name={names.get(task.assigned_by) ?? 'Member'}
                        tintIndex={
                          members.find((m) => m.user_id === task.assigned_by)?.profile
                            ?.avatar_index ?? 0
                        }
                        size={32}
                        uri={
                          members.find((m) => m.user_id === task.assigned_by)?.profile
                            ?.avatar_url ?? null
                        }
                      />
                      <View style={styles.flexTitles}>
                        <Text variant="body" style={styles.flex} numberOfLines={1}>
                          {names.get(task.assigned_by) ?? 'Member'}
                        </Text>
                        <Text variant="caption" tone="faint" numberOfLines={1}>
                          Added it
                        </Text>
                      </View>
                    </Row>
                  </>
                )}
              </ListSection>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(350).delay(180)}>
            <View>
              <SectionHeader
                label="History"
                action={
                  history.length > 0 ? (
                    <Text variant="caption" tone="faint">
                      {`${history.length} ${history.length === 1 ? 'day' : 'days'} done`}
                    </Text>
                  ) : undefined
                }
              />
              {history.length === 0 ? (
                <Card tone="sage">
                  <Text variant="body" tone="muted">
                    Not done yet — history appears here once someone ticks it off.
                  </Text>
                </Card>
              ) : (
                <ListSection>
                  {history.map((row, index) => (
                    <Row
                      key={row.id}
                      separator={index < history.length - 1}
                      accessibilityLabel={`${formatDate(row.completed_on)}, done by ${names.get(row.user_id) ?? 'someone'}`}
                    >
                      <CheckBox checked label={`${formatDate(row.completed_on)}, done`} />
                      <Text variant="body" style={styles.flex} numberOfLines={1}>
                        {formatDate(row.completed_on)}
                      </Text>
                      <Text variant="caption" tone="faint" numberOfLines={1}>
                        {names.get(row.user_id) ?? 'Someone'}
                      </Text>
                    </Row>
                  ))}
                </ListSection>
              )}
            </View>
          </Animated.View>

          {write.error ? (
            <Text variant="caption" tone="negative">
              {write.error}
            </Text>
          ) : null}
          <Button label="Delete task" variant="danger" onPress={remove} />
        </StackLayout>
      )}

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Edit task"
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
          <TaskForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => void saveEdit()}
            members={members}
            meId={myId}
          />
        ) : null}
        {write.error ? (
          <Text variant="caption" tone="negative">
            {write.error}
          </Text>
        ) : null}
      </Sheet>

      <UndoToast message={undo.message} onAction={() => void handleUndo()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexTitles: { flex: 1, gap: 2, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
