/**
 * Add-grocery form, shared by the bottom sheet and the full-screen add route.
 *
 * Controlled: the caller owns the values and the save action, so the sheet can
 * put Save in its footer while the route renders its own button. Name is
 * always focused with a go key that submits — two taps to add an item.
 */

import { StyleSheet, View } from 'react-native';

import { Chip, Collapsible, Input, LabeledSwitch, Text } from '@/components/ui';
import { GROCERY_CATEGORIES } from '@/lib/types';
import { useTheme } from '@/theme/useTheme';
import type { NewGrocery } from './api';

export type GroceryDraft = NewGrocery;

export const emptyDraft: GroceryDraft = {
  name: '',
  category: 'Other',
  quantity: null,
  unit: null,
  is_permanent: false,
};

export function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function AddGroceryForm({
  draft,
  onChange,
  onSubmit,
}: {
  draft: GroceryDraft;
  onChange: (draft: GroceryDraft) => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Input
        label="Item name"
        placeholder="e.g. Milk"
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
        autoFocus
        autoCapitalize="words"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      <Collapsible label="More options">
        <Text variant="label" tone="muted">
          Category
        </Text>
        <View style={styles.chips}>
          {GROCERY_CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category}
              selected={draft.category === category}
              onPress={() => onChange({ ...draft, category })}
              // Slimmer, wider pills: short labels read as balls at the
              // default full-height chip size.
              style={styles.pick}
            />
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.flex}>
            <Input
              label="Quantity"
              placeholder="1"
              value={draft.quantity === null ? '' : String(draft.quantity)}
              onChangeText={(raw) => {
                const parsed = parseQuantity(raw);
                onChange({ ...draft, quantity: raw.trim() === '' ? null : parsed });
              }}
              keyboardType="decimal-pad"
              returnKeyType="next"
            />
          </View>
          <View style={styles.flex}>
            <Input
              label="Unit"
              placeholder="kg, L, pcs"
              value={draft.unit ?? ''}
              onChangeText={(unit) => onChange({ ...draft, unit: unit === '' ? null : unit })}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>
        </View>

        <LabeledSwitch
          label="Repeat every month"
          hint="Keeps coming back every month."
          value={draft.is_permanent}
          onChange={(is_permanent) => onChange({ ...draft, is_permanent })}
        />
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { minHeight: 40, paddingHorizontal: 20 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
