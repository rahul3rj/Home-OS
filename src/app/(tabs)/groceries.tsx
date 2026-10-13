import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Collapsible,
  EmptyState,
  ErrorState,
  Fab,
  ListSection,
  LoadingState,
  Screen,
  ScreenHeader,
  Sheet,
  successFeedback,
  Text,
  UndoToast,
} from '@/components/ui';
import { currentMonth } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation, useQuery, useUndo } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import { useTheme } from '@/theme/useTheme';
import { AddGroceryForm, emptyDraft, type GroceryDraft } from '@/features/groceries/AddGroceryForm';
import {
  addGrocery,
  clearBought,
  deleteGrocery,
  fetchGroceries,
  restoreGroceries,
  seedPermanentForward,
  setBought,
  updateGrocery,
  type GroceryWithBuyer,
} from '@/features/groceries/api';
import { GroceryRow } from '@/features/groceries/GroceryRow';
import { MonthSelector } from '@/features/groceries/MonthSelector';
import { orderUrl, readStoreId } from '@/features/groceries/stores';

export default function Groceries() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { household, profile } = useHousehold();

  const [month, setMonth] = useState(currentMonth());
  const [sheet, setSheet] = useState<
    { kind: 'add' } | { kind: 'edit'; item: GroceryWithBuyer } | null
  >(null);
  const [draft, setDraft] = useState<GroceryDraft>(emptyDraft);

  // The default store lives in device prefs and can change in Settings while
  // this tab stays mounted — re-read on every focus.
  const [storeId, setStoreId] = useState(readStoreId);
  useFocusEffect(
    useCallback(() => {
      setStoreId(readStoreId());
    }, []),
  );

  const write = useMutation();
  const undo = useUndo();
  // The toast restores whatever the last destructive action removed.
  const pendingRestore = useRef<(() => Promise<void>) | null>(null);

  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;

  const query = useQuery<GroceryWithBuyer[]>(async () => {
    if (!householdId) throw new Error('Join or create a home first.');
    if (!userId) throw new Error('You need to sign in first.');
    // Permanent staples carry forward into empty current/future months.
    // Past months are history and are never rewritten.
    if (month >= currentMonth()) {
      await seedPermanentForward(householdId, month, userId);
    }
    return fetchGroceries(householdId, month);
  }, [householdId, month, userId]);

  const rows = query.data ?? [];
  const open = rows.filter((row) => !row.is_bought);
  const bought = rows.filter((row) => row.is_bought);

  function toggleBought(item: GroceryWithBuyer) {
    if (!userId) return;
    const next = !item.is_bought;
    // Optimistic: feels instant, reconciles with the server afterwards.
    query.setData(
      (rows) =>
        rows?.map((row) =>
          row.id === item.id
            ? {
                ...row,
                is_bought: next,
                bought_by: next ? userId : null,
                buyer_name: next ? (profile?.display_name ?? 'You') : null,
              }
            : row,
        ) ?? null,
    );
    if (next) successFeedback();
    // Reconcile both ways: success refreshes from the server, and failure
    // rolls the optimistic flip back so the list never shows a lie.
    void write
      .run(async () => {
        await setBought(item.id, next, userId);
        await query.refetch();
      })
      .then((ok) => {
        if (!ok) void query.refetch();
      });
  }

  function remove(item: GroceryWithBuyer) {
    query.setData((rows) => rows?.filter((row) => row.id !== item.id) ?? null);
    pendingRestore.current = async () => {
      await restoreGroceries([item]);
      await query.refetch();
    };
    undo.show(`Deleted ${item.name}`);
    void write
      .run(async () => {
        await deleteGrocery(item.id);
      })
      .then((ok) => {
        if (!ok) void query.refetch();
      });
  }

  function clearAllBought() {
    if (!householdId || bought.length === 0) return;
    query.setData((rows) => rows?.filter((row) => !row.is_bought) ?? null);
    void write
      .run(async () => {
        const removed = await clearBought(householdId, month);
        pendingRestore.current = async () => {
          await restoreGroceries(removed);
          await query.refetch();
        };
        undo.show(`Cleared ${removed.length} bought`);
      })
      .then((ok) => {
        if (!ok) void query.refetch();
      });
  }

  function openSheet() {
    setDraft(emptyDraft);
    setSheet({ kind: 'add' });
  }

  function openEdit(item: GroceryWithBuyer) {
    setDraft({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      is_permanent: item.is_permanent,
    });
    setSheet({ kind: 'edit', item });
  }

  function closeSheet() {
    setSheet(null);
    setDraft(emptyDraft);
  }

  async function saveSheet() {
    if (!householdId || !userId || !sheet) return;
    if (sheet.kind === 'add') {
      const ok = await write.run(async () => {
        await addGrocery(householdId, month, userId, draft);
      });
      if (!ok) return;
    } else {
      const id = sheet.item.id;
      const ok = await write.run(async () => {
        await updateGrocery(id, draft);
      });
      if (!ok) return;
    }
    closeSheet();
    await query.refetch();
  }

  async function handleUndo() {
    const restore = pendingRestore.current;
    pendingRestore.current = null;
    undo.clear();
    if (!restore) return;
    await write.run(restore);
  }

  // Basket button: no store picked yet → Settings (Groceries section) to pick
  // one; otherwise open that store's search link directly — installed app or
  // browser, whatever claims it. No availability pre-check: it only gets in
  // the way.
  async function order(item: GroceryWithBuyer) {
    if (!storeId) {
      router.push('/settings');
      return;
    }
    const url = orderUrl(storeId, item.name);
    await write.run(async () => {
      await Linking.openURL(url);
    });
  }

  return (
    <View style={styles.flex}>
      <Screen bottomInset={120}>
        <ScreenHeader title="Groceries" subtitle={`${open.length} to buy`} />

        <MonthSelector
          month={month}
          onChange={setMonth}
          label="Grocery month"
          style={{ marginBottom: theme.spacing.lg }}
        />

        {query.loading ? (
          <LoadingState label="Loading groceries…" />
        ) : query.error || !householdId ? (
          <ErrorState
            message={query.error ?? 'Join or create a home first.'}
            onRetry={() => void query.refetch()}
          />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              icon="ShoppingCart"
              title="Nothing on the list"
              message="Add the first thing — milk, eggs, whatever runs out fastest."
              actionLabel="Add the first thing"
              onAction={openSheet}
            />
          </Card>
        ) : (
          <ScrollView
            contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.xxl }}
            refreshControl={
              <RefreshControl
                refreshing={query.refreshing}
                onRefresh={() => void query.refetch()}
              />
            }
          >
            {write.error ? (
              <Text variant="caption" tone="negative">
                {write.error}
              </Text>
            ) : null}

            {open.length > 0 ? (
              <ListSection>
                {open.map((item, index) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    separator={index < open.length - 1}
                    onToggle={() => toggleBought(item)}
                    onDelete={() => remove(item)}
                    onEdit={() => openEdit(item)}
                    onOrder={() => void order(item)}
                  />
                ))}
              </ListSection>
            ) : null}

            {bought.length > 0 ? (
              <View>
                <Collapsible label={`Bought (${bought.length})`}>
                  <View style={{ gap: theme.spacing.md }}>
                    <ListSection>
                      {bought.map((item, index) => (
                        <GroceryRow
                          key={item.id}
                          item={item}
                          separator={index < bought.length - 1}
                          onToggle={() => toggleBought(item)}
                          onDelete={() => remove(item)}
                          onOrder={() => void order(item)}
                          onEdit={() => openEdit(item)}
                        />
                      ))}
                    </ListSection>
                    <Button
                      label={`Clear bought (${bought.length})`}
                      variant="ghost"
                      size="sm"
                      onPress={clearAllBought}
                    />
                  </View>
                </Collapsible>
              </View>
            ) : null}
          </ScrollView>
        )}

        <Sheet
          visible={sheet !== null}
          onClose={closeSheet}
          title={sheet?.kind === 'edit' ? 'Edit item' : 'Add an item'}
          footer={
            <Button
              label={sheet?.kind === 'edit' ? 'Save changes' : 'Add item'}
              fullWidth
              variant="primary"
              onPress={() => void saveSheet()}
            />
          }
        >
          <AddGroceryForm draft={draft} onChange={setDraft} onSubmit={() => void saveSheet()} />
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
      <Fab icon="Plus" label="Add item" onPress={openSheet} style={{ bottom: theme.spacing.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
