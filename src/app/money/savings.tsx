/**
 * Savings (sub-agent 3): two clearly separated sections that are never
 * merged into one list.
 *
 * 1. "Your savings" — private. The signed-in member's own allocation for the
 *    selected month, set or edited in a bottom sheet.
 * 2. "Household savings pool" — shared. The big all-months total from the
 *    `savings_pool_total` RPC. No per-member breakdown is shown or queried;
 *    the note explains why the number has no names attached.
 */

import { Stack as RouterStack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingState,
  MoneyText,
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
import { parseAmount } from '@/features/money/amount';
import { deleteSaving, fetchPoolTotal, fetchSaving, upsertSaving } from '@/features/money/api';
import { MonthSelector } from '@/features/money/MonthSelector';
import { emptySavingsDraft, SavingsForm, type SavingsDraft } from '@/features/money/SavingsForm';

export default function Savings() {
  const router = useRouter();
  const { user } = useAuth();
  const { household, members } = useHousehold();
  const write = useMutation();

  const [month, setMonth] = useState(currentMonth());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<SavingsDraft>(emptySavingsDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;

  const allocation = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    if (!userId) throw new Error('You need to sign in first.');
    return fetchSaving(householdId, userId, month);
  }, [householdId, userId, month]);

  const pool = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    return fetchPoolTotal(householdId);
  }, [householdId]);

  const loading = allocation.loading || pool.loading;
  const error = allocation.error ?? pool.error;
  const refreshing = allocation.refreshing || pool.refreshing;

  function refresh() {
    void Promise.all([allocation.refetch(), pool.refetch()]);
  }

  function openSheet() {
    tapFeedback();
    const current = allocation.data;
    setDraft({
      amountRaw: current ? String(current.amount) : '',
      note: current?.note ?? '',
    });
    setShowErrors(false);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setConfirmDelete(false);
    setDraft(emptySavingsDraft);
    setShowErrors(false);
  }

  async function save() {
    if (!householdId || !userId) return;
    const amount = parseAmount(draft.amountRaw);
    if (amount === null) {
      setShowErrors(true);
      return;
    }
    const note = draft.note.trim() ? draft.note.trim() : null;
    const ok = await write.run(() => upsertSaving({ householdId, userId, month, amount, note }));
    if (!ok) return;
    successFeedback();
    closeSheet();
    refresh();
  }

  async function remove() {
    const current = allocation.data;
    if (!current || !userId) return;
    const ok = await write.run(() => deleteSaving(current.id, userId));
    setConfirmDelete(false);
    if (!ok) return;
    closeSheet();
    refresh();
  }

  const current = allocation.data;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <RouterStack.Screen options={{ title: 'Savings' }} />
      <ScreenHeader
        title="Savings"
        subtitle="Yours is private · the pool is shared"
        left={
          <IconButton
            icon={<Icon name="ChevronLeft" size={24} />}
            label="Go back"
            onPress={() => router.back()}
          />
        }
      />

      {loading ? (
        <LoadingState label="Loading savings…" />
      ) : error || !householdId ? (
        <ErrorState message={error ?? 'Join or create a home first.'} onRetry={refresh} />
      ) : (
        <StackLayout gap="xl">
          {/* 1 — Your savings. Private: month selector, current allocation,
              set/edit amount, optional note. */}
          <View>
            <SectionHeader label="Your savings" />
            <MonthSelector month={month} onChange={setMonth} label="Savings month" />
            <Animated.View entering={FadeInUp.duration(350)}>
              {current ? (
                <Card>
                  <MoneyText amount={current.amount} variant="title" />
                  <Text variant="caption" tone="muted">
                    {`${formatMonth(month)}${current.note?.trim() ? ` · ${current.note.trim()}` : ''} · only you can see this`}
                  </Text>
                  <Button label="Edit savings" variant="secondary" fullWidth onPress={openSheet} />
                </Card>
              ) : (
                <Card>
                  <EmptyState
                    icon="Wallet"
                    title="Nothing set aside"
                    message={`Set aside savings for ${formatMonth(month)} — only you can see it.`}
                    actionLabel="Set savings"
                    onAction={openSheet}
                  />
                </Card>
              )}
            </Animated.View>
          </View>

          {/* 2 — Household savings pool. Shared: the RPC total only, all
              months. Individual contributions are never listed or queried. */}
          <View>
            <SectionHeader label="Household pool" />
            <Animated.View entering={FadeInUp.duration(350).delay(90)}>
              <Card tone="green">
                <MoneyText amount={pool.data ?? 0} variant="display" />
                <Text variant="caption" tone="muted">
                  {`Shared total · all months · ${members.length} ${
                    members.length === 1 ? 'member' : 'members'
                  } in this home`}
                </Text>
                <Text variant="caption" tone="muted">
                  Amounts stay private — only the total is shared, so there are no names or
                  breakdowns here.
                </Text>
              </Card>
            </Animated.View>
          </View>
        </StackLayout>
      )}

      <Sheet
        visible={sheetOpen}
        onClose={closeSheet}
        title={current ? 'Edit savings' : 'Set savings'}
        footer={
          <View style={styles.footer}>
            <Button
              label={current ? 'Save changes' : 'Set aside'}
              fullWidth
              loading={write.pending}
              onPress={() => void save()}
            />
            {current ? (
              <Button
                label="Delete"
                variant="danger"
                fullWidth
                onPress={() => setConfirmDelete(true)}
              />
            ) : null}
            {write.error ? (
              <Text variant="caption" tone="negative" style={styles.center}>
                {write.error}
              </Text>
            ) : null}
          </View>
        }
      >
        <SavingsForm
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void save()}
          showErrors={showErrors}
        />
      </Sheet>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete these savings?"
        message="This removes the entry for good. Money records cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={write.pending}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: 8 },
  center: { textAlign: 'center' },
});
