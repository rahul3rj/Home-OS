/**
 * The household's notification centre: SOS alerts plus task deadlines.
 *
 * SOS events live in Postgres like everything shared; each phone just
 * remembers which ones it has opened (`src/lib/notifications.ts`). Opening
 * this screen marks every SOS shown as seen, which clears the bell.
 * Deadlines are derived live from open tasks — no new table, no new flags.
 */

import { Stack as RouterStack, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
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
  Stack as StackLayout,
  Text,
} from '@/components/ui';
import { fetchActiveSos, fetchRecentSos, resolveSos, timeAgo } from '@/features/maps/api';
import { fetchOpenDeadlines } from '@/features/tasks/api';
import { formatDueAt } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery } from '@/lib/hooks';
import { markSosSeen } from '@/lib/notifications';

export default function Notifications() {
  const router = useRouter();
  const { household, members } = useHousehold();
  const resolve = useMutation();

  const householdId = household?.id ?? null;

  const activeQuery = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchActiveSos(householdId);
  }, [householdId]);

  const recentQuery = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchRecentSos(householdId);
  }, [householdId]);

  const active = useMemo(() => activeQuery.data ?? [], [activeQuery.data]);
  const recent = useMemo(() => recentQuery.data ?? [], [recentQuery.data]);

  // Deadlines share the bell's query: a task with a due date still counts
  // until somebody ticks it off on or after the day it was due.
  const deadlinesQuery = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchOpenDeadlines(householdId);
  }, [householdId]);

  const overdue = useMemo(() => deadlinesQuery.data?.overdue ?? [], [deadlinesQuery.data]);
  const upcoming = useMemo(() => deadlinesQuery.data?.upcoming ?? [], [deadlinesQuery.data]);

  // Opening the list is reading it: everything shown counts as seen on this
  // phone, which clears the bell dot. Device store only, no server write.
  useEffect(() => {
    if (active.length > 0) markSosSeen(active.map((alert) => alert.id));
    if (recent.length > 0) markSosSeen(recent.map((alert) => alert.id));
  }, [active, recent]);

  function senderName(userId: string): string {
    return members.find((member) => member.user_id === userId)?.profile?.display_name ?? 'Someone';
  }

  function refresh() {
    void Promise.all([activeQuery.refetch(), recentQuery.refetch(), deadlinesQuery.refetch()]);
  }

  async function standDown(id: string) {
    const ok = await resolve.run(() => resolveSos(id));
    if (!ok) return;
    refresh();
  }

  const loading = activeQuery.loading || recentQuery.loading || deadlinesQuery.loading;
  const error = activeQuery.error ?? recentQuery.error ?? deadlinesQuery.error;
  const refreshing = activeQuery.refreshing || recentQuery.refreshing || deadlinesQuery.refreshing;
  const nothingAtAll =
    active.length === 0 && recent.length === 0 && overdue.length === 0 && upcoming.length === 0;

  function openTask(id: string) {
    router.push({ pathname: '/task/[id]', params: { id } });
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <RouterStack.Screen options={{ title: 'Notifications' }} />
      <ScreenHeader
        title="Notifications"
        left={
          <IconButton
            icon={<Icon name="ChevronLeft" size={24} />}
            label="Go back"
            onPress={() => router.back()}
          />
        }
      />

      {loading ? (
        <LoadingState label="Loading notifications…" />
      ) : error || !householdId ? (
        <ErrorState message={error ?? 'Join or create a home first.'} onRetry={refresh} />
      ) : (
        <StackLayout gap="lg">
          {resolve.error ? (
            <Text variant="caption" tone="negative">
              {resolve.error}
            </Text>
          ) : null}

          {active.length > 0 ? (
            <View>
              <SectionHeader label="Needs you now" />
              <Card tone="negative">
                <StackLayout gap="sm">
                  {active.map((alert) => (
                    <View key={alert.id} style={styles.sosRow}>
                      <View style={styles.flex}>
                        <Text variant="bodyStrong" tone="negative" numberOfLines={2}>
                          {`SOS from ${senderName(alert.triggered_by)}`}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {timeAgo(alert.created_at)}
                        </Text>
                      </View>
                      <Button
                        label="All safe"
                        size="sm"
                        variant="tertiary"
                        loading={resolve.pending}
                        onPress={() => void standDown(alert.id)}
                      />
                    </View>
                  ))}
                </StackLayout>
              </Card>
            </View>
          ) : null}

          {overdue.length > 0 ? (
            <View>
              <SectionHeader label="Overdue" />
              <ListSection>
                {overdue.map((task, index) => (
                  <Row
                    key={task.id}
                    separator={index < overdue.length - 1}
                    onPress={() => openTask(task.id)}
                  >
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {task.title}
                      </Text>
                      <Text variant="caption" tone="negative" numberOfLines={1}>
                        {`Overdue · ${timeAgo(task.due_at as string)}`}
                      </Text>
                    </View>
                    <Badge label="Overdue" tone="negative" />
                  </Row>
                ))}
              </ListSection>
            </View>
          ) : null}

          {upcoming.length > 0 ? (
            <View>
              <SectionHeader label="Coming up" />
              <ListSection>
                {upcoming.map((task, index) => (
                  <Row
                    key={task.id}
                    separator={index < upcoming.length - 1}
                    onPress={() => openTask(task.id)}
                  >
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {task.title}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {`Due ${formatDueAt(task.due_at as string)}`}
                      </Text>
                    </View>
                  </Row>
                ))}
              </ListSection>
            </View>
          ) : null}

          {recent.length > 0 || nothingAtAll ? (
            <View>
              <SectionHeader label="Earlier" />
              {nothingAtAll ? (
                <Card>
                  <EmptyState
                    icon="Bell"
                    title="Nothing yet"
                    message="SOS alerts and task deadlines from your home will land here."
                  />
                </Card>
              ) : (
                <ListSection>
                  {recent.map((alert, index) => (
                    <Row key={alert.id} separator={index < recent.length - 1}>
                      <View style={styles.flex}>
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {`SOS from ${senderName(alert.triggered_by)}`}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {timeAgo(alert.created_at)}
                        </Text>
                      </View>
                      {alert.is_active ? (
                        <Badge label="Active" tone="negative" />
                      ) : (
                        <Text variant="caption" tone="faint">
                          Resolved
                        </Text>
                      )}
                    </Row>
                  ))}
                </ListSection>
              )}
            </View>
          ) : null}
        </StackLayout>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  sosRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
