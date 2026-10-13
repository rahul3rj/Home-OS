import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  CheckBox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Fab,
  LoadingState,
  MoneyText,
  Screen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  Text,
} from '@/components/ui';
import { currentMonth, formatINR, formatMonth, shiftMonth } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import { HOUSE_EXPENSE_CATEGORIES } from '@/lib/types';
import type { HouseExpense } from '@/lib/types';
import { useTheme } from '@/theme/useTheme';
import { MonthSelector } from '@/features/groceries/MonthSelector';
import {
  addExpense,
  breakdown,
  CATEGORY_LABELS,
  deleteExpense,
  fetchExpenses,
  monthTotal,
  setPaid,
  updateExpense,
} from '@/features/expenses/api';
import {
  draftToInput,
  emptyExpenseDraft,
  ExpenseForm,
  PaidFilterControl,
  type ExpenseDraft,
  type PaidFilter,
} from '@/features/expenses/ExpenseForm';

/**
 * House expenses — pushed stack route, not a tab. Five tabs is the iOS maximum.
 *
 * Money rules: paid/unpaid waits for the server with a spinner on that row
 * only — never optimistic. Deleting a bill asks first.
 */
export default function HouseExpenses() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { household } = useHousehold();

  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<PaidFilter>('all');
  const [sheet, setSheet] = useState<{ kind: 'add' } | { kind: 'edit'; item: HouseExpense } | null>(
    null,
  );
  const [draft, setDraft] = useState<ExpenseDraft>(emptyExpenseDraft);
  const [paidPending, setPaidPending] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const write = useMutation();
  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;

  const query = useQuery<{ rows: HouseExpense[]; previous: HouseExpense[] }>(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    const [rows, previous] = await Promise.all([
      fetchExpenses(householdId, month),
      fetchExpenses(householdId, shiftMonth(month, -1)),
    ]);
    return { rows, previous };
  }, [householdId, month]);

  const rows = query.data?.rows ?? [];
  const previous = query.data?.previous ?? [];
  const total = monthTotal(rows);
  const lastTotal = monthTotal(previous);
  const delta = Math.round((total - lastTotal) * 100) / 100;
  const parts = breakdown(rows);

  const visible = rows.filter((row) =>
    filter === 'all' ? true : filter === 'paid' ? row.is_paid : !row.is_paid,
  );
  const groups = HOUSE_EXPENSE_CATEGORIES.map(
    (category) => [category, visible.filter((row) => row.category === category)] as const,
  ).filter(([, items]) => items.length > 0);

  const todayDay = new Date().getDate();
  const isCurrentMonth = month === currentMonth();

  function openAdd() {
    setDraft(emptyExpenseDraft);
    setSheet({ kind: 'add' });
  }

  function openEdit(item: HouseExpense) {
    setDraft({
      label: item.label,
      amount: String(item.amount),
      category: item.category,
      dueDay: item.due_day === null ? '' : String(item.due_day),
      repeatYear: false,
    });
    setSheet({ kind: 'edit', item });
  }

  function closeSheet() {
    setSheet(null);
    setConfirmDelete(false);
  }

  async function saveSheet() {
    if (!householdId || !sheet) return;
    const input = draftToInput(draft);
    const ok = await write.run(async () => {
      if (sheet.kind === 'add') {
        const months = [month];
        if (draft.repeatYear) {
          for (let forward = 1; forward < 12; forward += 1) {
            months.push(shiftMonth(month, forward));
          }
        }
        await addExpense(householdId, months, input);
      } else {
        await updateExpense(sheet.item.id, input);
      }
    });
    if (!ok) return;
    closeSheet();
    await query.refetch();
  }

  async function togglePaid(item: HouseExpense) {
    if (!userId || paidPending) return;
    setPaidPending(item.id);
    try {
      // Money waits for the server: spinner on this row, no optimistic flip.
      await setPaid(item.id, !item.is_paid, userId);
      await query.refetch();
    } catch (cause) {
      write.run(async () => {
        throw cause instanceof Error ? cause : new Error('That did not stick. Try again.');
      });
    } finally {
      setPaidPending(null);
    }
  }

  async function confirmRemove() {
    if (sheet?.kind !== 'edit') return;
    const id = sheet.item.id;
    const ok = await write.run(async () => {
      await deleteExpense(id);
    });
    if (!ok) return;
    closeSheet();
    await query.refetch();
  }

  return (
    <View style={styles.flex}>
      <Screen bottomInset={120}>
        <Stack.Screen options={{ title: 'House expenses' }} />
        <ScreenHeader title="House expenses" subtitle={formatMonth(month)} />

        <MonthSelector month={month} onChange={setMonth} label="Expense month" />

        {query.loading ? (
          <LoadingState label="Loading bills…" />
        ) : query.error || !householdId ? (
          <ErrorState
            message={query.error ?? 'Join or create a home first.'}
            onRetry={() => void query.refetch()}
          />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              icon="Receipt"
              title="No bills this month"
              message="Add the first one — rent is usually the biggest."
              actionLabel="Add the first bill"
              onAction={openAdd}
            />
          </Card>
        ) : (
          <ScrollView
            contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
            refreshControl={
              <RefreshControl
                refreshing={query.refreshing}
                onRefresh={() => void query.refetch()}
              />
            }
          >
            <Card>
              <Text variant="label" tone="muted">
                This month
              </Text>
              <MoneyText amount={total} variant="display" />
              <Text variant="caption" tone="muted">
                {lastTotal === 0
                  ? 'Nothing last month to compare'
                  : delta === 0
                    ? `Same as ${formatMonth(shiftMonth(month, -1))}`
                    : `${delta > 0 ? 'Up' : 'Down'} ${formatINR(Math.abs(delta))} vs ${formatMonth(shiftMonth(month, -1))}`}
              </Text>
              {parts.length > 0 ? (
                <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                  {parts.map((part) => (
                    <View key={part.category} style={styles.breakRow}>
                      <Text variant="body" style={styles.flex} numberOfLines={1}>
                        {CATEGORY_LABELS[part.category]}
                      </Text>
                      <MoneyText amount={part.total} variant="label" tone="muted" />
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>

            <PaidFilterControl value={filter} onChange={setFilter} />

            {write.error ? (
              <Text variant="caption" tone="negative">
                {write.error}
              </Text>
            ) : null}

            {groups.length === 0 ? (
              <Card>
                <EmptyState
                  icon="Receipt"
                  title={filter === 'paid' ? 'Nothing paid yet' : 'Nothing unpaid'}
                  message="Everything else is in the other filter."
                />
              </Card>
            ) : (
              groups.map(([category, items]) => (
                <View key={category}>
                  <SectionHeader label={CATEGORY_LABELS[category]} />
                  <View style={{ gap: theme.spacing.sm }}>
                    {items.map((item) => {
                      const daysLeft = item.due_day === null ? null : item.due_day - todayDay;
                      const urgent =
                        isCurrentMonth &&
                        !item.is_paid &&
                        daysLeft !== null &&
                        daysLeft >= 0 &&
                        daysLeft <= 3;
                      const pending = paidPending === item.id;
                      return (
                        <View
                          key={item.id}
                          style={[
                            styles.row,
                            {
                              backgroundColor: theme.colors.surface,
                              borderRadius: theme.radius.xl,
                              // The one warning treatment: a single warning left
                              // edge, only for genuinely due-soon bills.
                              borderLeftWidth: urgent ? 3 : 0,
                              borderLeftColor: theme.colors.warning,
                            },
                          ]}
                        >
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: item.is_paid }}
                            accessibilityLabel={`${item.label}, ${item.is_paid ? 'paid' : 'unpaid'}`}
                            accessibilityHint="Double tap to toggle paid"
                            disabled={pending}
                            onPress={() => void togglePaid(item)}
                            style={styles.checkHit}
                          >
                            {pending ? (
                              <ActivityIndicator size="small" color={theme.colors.textMuted} />
                            ) : (
                              <CheckBox checked={item.is_paid} label={`${item.label}, paid`} />
                            )}
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${item.label}`}
                            onPress={() => openEdit(item)}
                            style={styles.flex}
                          >
                            <Text variant="bodyStrong" numberOfLines={2}>
                              {item.label}
                            </Text>
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                              {item.due_day !== null ? `Due ${item.due_day} · ` : ''}
                              {item.is_paid
                                ? 'Paid'
                                : urgent && daysLeft !== null
                                  ? `Due in ${daysLeft}d`
                                  : 'Unpaid'}
                            </Text>
                          </Pressable>

                          <MoneyText amount={Number(item.amount)} variant="bodyStrong" />
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        <Sheet
          visible={sheet !== null}
          onClose={closeSheet}
          title={sheet?.kind === 'edit' ? 'Edit bill' : 'Add a bill'}
          footer={
            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label={sheet?.kind === 'edit' ? 'Save bill' : 'Add bill'}
                fullWidth
                variant="primary"
                onPress={() => void saveSheet()}
              />
              {sheet?.kind === 'edit' ? (
                <Button
                  label="Delete bill"
                  fullWidth
                  variant="danger"
                  onPress={() => setConfirmDelete(true)}
                />
              ) : null}
            </View>
          }
        >
          <ExpenseForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => void saveSheet()}
            showRepeat={sheet?.kind !== 'edit'}
          />
          {write.error ? (
            <Text variant="caption" tone="negative">
              {write.error}
            </Text>
          ) : null}
        </Sheet>

        <ConfirmDialog
          visible={confirmDelete}
          title="Delete this bill?"
          message="Money records do not come back. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => void confirmRemove()}
          onCancel={() => setConfirmDelete(false)}
        />
      </Screen>
      {/* Bottom-right add, one step above the screen edge — like other apps. */}
      <Fab
        icon="Plus"
        label="Add bill"
        onPress={openAdd}
        style={{ bottom: insets.bottom + theme.spacing.lg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  checkHit: { padding: 6, margin: -6 },
});
