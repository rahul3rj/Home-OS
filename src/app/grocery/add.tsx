import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Screen, ScreenHeader, Stack as StackLayout, Text } from '@/components/ui';
import { currentMonth } from '@/lib/format';
import { useHousehold } from '@/lib/household';
import { useMutation } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import { AddGroceryForm, emptyDraft, type GroceryDraft } from '@/features/groceries/AddGroceryForm';
import { addGrocery } from '@/features/groceries/api';

/**
 * Full-screen add form — the same fields as the bottom sheet, for anyone who
 * reaches adding through a link rather than the list. The sheet on the
 * groceries tab stays the primary two-tap path.
 */
export default function AddGrocery() {
  const router = useRouter();
  const { user } = useAuth();
  const { household } = useHousehold();

  const [draft, setDraft] = useState<GroceryDraft>(emptyDraft);
  const save = useMutation();

  const householdId = household?.id ?? null;
  const userId = user?.id ?? null;

  async function submit() {
    if (!householdId || !userId) return;
    const ok = await save.run(async () => {
      await addGrocery(householdId, currentMonth(), userId, draft);
    });
    if (!ok) return;
    router.back();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Add item' }} />
      <ScreenHeader title="Add an item" subtitle="This month's list" />

      <StackLayout gap="xl">
        <Card>
          <AddGroceryForm draft={draft} onChange={setDraft} onSubmit={() => void submit()} />
        </Card>

        {(save.error ?? (!householdId || !userId)) ? (
          <Text variant="caption" tone="negative">
            {save.error ?? 'Join or create a home first.'}
          </Text>
        ) : null}

        <Button
          label="Add item"
          size="lg"
          fullWidth
          variant="primary"
          loading={save.pending}
          disabled={draft.name.trim().length === 0}
          onPress={() => void submit()}
        />
      </StackLayout>
    </Screen>
  );
}
