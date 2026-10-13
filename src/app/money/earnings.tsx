/**
 * Your earnings (sub-agent 3): private monthly entries for the signed-in
 * member only.
 *
 * Privacy is visible, not implied: the header names it and every empty state
 * repeats it. Money waits for the server — no optimistic writes here. Delete
 * confirms with a dialog because money records cannot be undone.
 */

import { Stack as RouterStack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Fab,
  Icon,
  IconButton,
  ListSection,
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
import { currentMonth, round2, shiftMonth } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import type { Earning } from '@/lib/types';
import { useTheme } from '@/theme/useTheme';
import { describeTrend, parseAmount } from '@/features/money/amount';
import { addEarning, deleteEarning, fetchEarnings, updateEarning } from '@/features/money/api';
import { EarningForm, emptyEarningDraft, type EarningDraft } from '@/features/money/EarningForm';
import { EarningRow } from '@/features/money/EarningRow';
import { MonthSelector } from '@/features/money/MonthSelector';

export default function Earnings() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { household } = useHousehold();
  const write = useMutation();

  const [month, setMonth] = useState(currentMonth());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Earning | null>(null);
  const [draft, setDraft] = useState<EarningDraft>(emptyEarningDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;
  const previous = shiftMonth(month, -1);

  const query = useQuery(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    if (!userId) throw new Error('You need to sign in first.');
    return fetchEarnings({ householdId, userId, months: [month, previous] });
  }, [householdId, userId, month]);

  const rows = (query.data ?? []).filter((row) => row.month === month);
  const total = round2(rows.reduce((sum, row) => sum + row.amount, 0));
  const previousTotal = round2(
    (query.data ?? [])
      .filter((row) => row.month === previous)
      .reduce((sum, row) => sum + row.amount, 0),
  );
  const trend = describeTrend(total - previousTotal);

  function openAdd() {
    tapFeedback();
    setEditing(null);
    setDraft(emptyEarningDraft);
    setShowErrors(false);
    setSheetOpen(true);
  }

  function openEdit(row: Earning) {
    tapFeedback();
    setEditing(row);
    setDraft({
      amountRaw: String(row.amount),
      source: row.source,
      note: row.note ?? '',
    });
    setShowErrors(false);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setConfirmDelete(false);
    setEditing(null);
    setDraft(emptyEarningDraft);
    setShowErrors(false);
  }

  async function save() {
    if (!householdId || !userId) return;
    const amount = parseAmount(draft.amountRaw);
    if (amount === null) {
      setShowErrors(true);
      return;
    }
    const source = draft.source.trim() || 'Other';
    const note = draft.note.trim() ? draft.note.trim() : null;
    const ok = await write.run(async () => {
      if (editing) {
        await updateEarning({
          id: editing.id,
          userId,
          month: editing.month,
          input: { amount, source, note },
        });
      } else {
        await addEarning({ householdId, userId, month, input: { amount, source, note } });
      }
    });
    if (!ok) return;
    successFeedback();
    closeSheet();
    await query.refetch();
  }

  async function remove() {
    if (!editing || !userId) return;
    const ok = await write.run(() => deleteEarning(editing.id, userId));
    setConfirmDelete(false);
    if (!ok) return;
    closeSheet();
    await query.refetch();
  }

  return (
    <View style={styles.flex}>
      <Screen
        refreshing={query.refreshing}
        onRefresh={() => void query.refetch()}
        bottomInset={120}
      >
        <RouterStack.Screen options={{ title: 'Earnings' }} />
        <ScreenHeader
          title="Your earnings"
          subtitle="Private — only you can see this"
          left={
            <IconButton
              icon={<Icon name="ChevronLeft" size={24} />}
              label="Go back"
              onPress={() => router.back()}
            />
          }
        />

        <MonthSelector month={month} onChange={setMonth} label="Earnings month" />

        {query.loading ? (
          <LoadingState label="Loading your earnings…" />
        ) : query.error || !householdId ? (
          <ErrorState
            message={query.error ?? 'Join or create a home first.'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <StackLayout gap="lg">
            <Animated.View entering={FadeInUp.duration(350)}>
              <Card>
                <View style={styles.heading}>
                  <Text variant="label" tone="muted">
                    Month total
                  </Text>
                  <Badge label="Only you" tone="neutral" />
                </View>
                <MoneyText amount={total} variant="display" />
                {trend ? (
                  <Text variant="caption" tone={trend.up ? 'positive' : 'muted'}>
                    {trend.text}
                  </Text>
                ) : total > 0 ? (
                  <Text variant="caption" tone="muted">
                    Same as last month
                  </Text>
                ) : null}
              </Card>
            </Animated.View>

            {rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon="Wallet"
                  title="No earnings this month"
                  message="Add your salary or freelance income — only you can see it."
                  actionLabel="Add an earning"
                  onAction={openAdd}
                />
              </Card>
            ) : (
              <View>
                <SectionHeader
                  label={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`}
                />
                <ListSection>
                  {rows.map((row) => (
                    <EarningRow key={row.id} earning={row} onPress={() => openEdit(row)} />
                  ))}
                </ListSection>
              </View>
            )}
          </StackLayout>
        )}

        <Sheet
          visible={sheetOpen}
          onClose={closeSheet}
          title={editing ? 'Edit earning' : 'Add an earning'}
          footer={
            <View style={styles.footer}>
              <Button
                label={editing ? 'Save changes' : 'Add earning'}
                fullWidth
                loading={write.pending}
                onPress={() => void save()}
              />
              {editing ? (
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
          <EarningForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => void save()}
            showErrors={showErrors}
          />
        </Sheet>

        <ConfirmDialog
          visible={confirmDelete}
          title={`Delete ${editing?.source ?? 'earning'}?`}
          message="This removes the entry for good. Money records cannot be undone."
          confirmLabel="Delete"
          destructive
          pending={write.pending}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      </Screen>
      {/* Bottom-right add, one step above the screen edge — like other apps. */}
      <Fab
        icon="Plus"
        label="Add earning"
        onPress={openAdd}
        style={{ bottom: insets.bottom + theme.spacing.lg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  footer: { gap: 8 },
  center: { textAlign: 'center' },
});
