/**
 * Money tab (sub-agent 3): this month at a glance, then through to the two
 * detail screens.
 *
 * - "Your earnings" is private: only the signed-in member's own rows are
 *   ever queried, and a visible "Only you" signal says so — a privacy feature
 *   with no visible signal reads as broken.
 * - "Household savings pool" is shared: the big total comes from the
 *   `savings_pool_total` RPC (a SUM, never individual contributions).
 */

import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  MoneyText,
  Screen,
  ScreenHeader,
  Stack as StackLayout,
  Text,
} from '@/components/ui';
import { currentMonth, formatMonth, round2, shiftMonth } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useQuery } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import { describeTrend } from '@/features/money/amount';
import { fetchEarnings, fetchPoolTotal } from '@/features/money/api';

export default function Money() {
  const router = useRouter();
  const { user } = useAuth();
  const { household, members } = useHousehold();

  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;
  const month = currentMonth();
  const previous = shiftMonth(month, -1);

  // Own rows only — both months in one query so the trend needs no second trip.
  const earnings = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    if (!userId) throw new Error('You need to sign in first.');
    return fetchEarnings({ householdId, userId, months: [month, previous] });
  }, [householdId, userId, month]);

  const pool = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchPoolTotal(householdId);
  }, [householdId]);

  const rows = earnings.data ?? [];
  const monthRows = rows.filter((row) => row.month === month);
  const total = round2(monthRows.reduce((sum, row) => sum + row.amount, 0));
  const previousTotal = round2(
    rows.filter((row) => row.month === previous).reduce((sum, row) => sum + row.amount, 0),
  );
  const trend = describeTrend(total - previousTotal);

  const loading = earnings.loading || pool.loading;
  const error = earnings.error ?? pool.error;
  const refreshing = earnings.refreshing || pool.refreshing;

  function refresh() {
    void Promise.all([earnings.refetch(), pool.refetch()]);
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenHeader title="Money" subtitle={formatMonth(month)} />

      {loading ? (
        <LoadingState label="Loading money…" />
      ) : error || !householdId ? (
        <ErrorState message={error ?? 'Join or create a home first.'} onRetry={refresh} />
      ) : (
        <StackLayout gap="lg">
          <Animated.View entering={FadeInUp.duration(350)}>
            <Card>
              <View style={styles.heading}>
                <Text variant="title">Your earnings</Text>
                <Badge label="Only you" tone="neutral" />
              </View>
              <MoneyText amount={total} variant="title" />
              <Text variant="caption" tone="muted">
                {`This month · ${monthRows.length} ${
                  monthRows.length === 1 ? 'entry' : 'entries'
                } · private to you`}
              </Text>
              {trend ? (
                <Text variant="caption" tone={trend.up ? 'positive' : 'muted'}>
                  {trend.text}
                </Text>
              ) : total > 0 ? (
                <Text variant="caption" tone="muted">
                  Same as last month
                </Text>
              ) : null}
              <Button
                label="View earnings"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/money/earnings')}
              />
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(350).delay(90)}>
            <Card tone="green">
              <View style={styles.heading}>
                <Text variant="title">Household savings pool</Text>
                <Badge label="Shared" tone="neutral" />
              </View>
              <MoneyText amount={pool.data ?? 0} variant="display" />
              <Text variant="caption" tone="muted">
                {`All months · ${members.length} ${
                  members.length === 1 ? 'member' : 'members'
                } in this home`}
              </Text>
              <Text variant="caption" tone="muted">
                Amounts stay private — only the total is shared.
              </Text>
              <Button
                label="View savings"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/money/savings')}
              />
            </Card>
          </Animated.View>
        </StackLayout>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
