/**
 * Add/edit bill form for the bottom sheet.
 *
 * Controlled like the grocery form: the screen owns values + save. Category
 * is a chip picker (eight options never fit a 2–4 slot SegmentedControl).
 * The repeat chip copies the bill forward — bounded, explicit, no
 * recurring-bills engine behind it.
 */

import { StyleSheet, View } from 'react-native';

import { Chip, Input, LabeledSwitch, SegmentedControl, Text } from '@/components/ui';
import { HOUSE_EXPENSE_CATEGORIES, type HouseExpenseCategory } from '@/lib/types';
import { useTheme } from '@/theme/useTheme';
import { CATEGORY_LABELS, type ExpenseInput } from './api';

export type ExpenseDraft = {
  label: string;
  amount: string;
  category: HouseExpenseCategory;
  dueDay: string;
  repeatYear: boolean;
};

export const emptyExpenseDraft: ExpenseDraft = {
  label: '',
  amount: '',
  category: 'other',
  dueDay: '',
  repeatYear: false,
};

export function draftToInput(draft: ExpenseDraft): ExpenseInput {
  const due = draft.dueDay.trim() === '' ? null : Number(draft.dueDay.trim());
  return {
    label: draft.label,
    amount: Number(draft.amount.trim().replace(',', '.')),
    category: draft.category,
    due_day: due === null || !Number.isInteger(due) ? null : due,
  };
}

const PAID_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
] as const;

export type PaidFilter = (typeof PAID_FILTERS)[number]['value'];

export function ExpenseForm({
  draft,
  onChange,
  onSubmit,
  showRepeat,
}: {
  draft: ExpenseDraft;
  onChange: (draft: ExpenseDraft) => void;
  onSubmit: () => void;
  /** Repeat only makes sense when adding; editing edits one bill. */
  showRepeat: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Input
        label="Bill"
        placeholder="e.g. Electricity"
        value={draft.label}
        onChangeText={(label) => onChange({ ...draft, label })}
        autoFocus
        returnKeyType="next"
      />

      <View style={styles.row}>
        <View style={styles.flex}>
          <Input
            label="Amount (₹)"
            placeholder="0"
            value={draft.amount}
            onChangeText={(amount) => onChange({ ...draft, amount })}
            keyboardType="decimal-pad"
            returnKeyType="next"
          />
        </View>
        <View style={styles.flex}>
          <Input
            label="Due day (optional)"
            placeholder="5"
            value={draft.dueDay}
            onChangeText={(dueDay) => onChange({ ...draft, dueDay })}
            keyboardType="number-pad"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="muted">
          Category
        </Text>
        <View style={styles.chips}>
          {HOUSE_EXPENSE_CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={CATEGORY_LABELS[category]}
              selected={draft.category === category}
              onPress={() => onChange({ ...draft, category })}
              // Slimmer, wider pills: short labels read as balls at the
              // default full-height chip size.
              style={styles.pick}
            />
          ))}
        </View>
      </View>

      {showRepeat ? (
        <LabeledSwitch
          label="Repeat for 12 months"
          hint="Copies this bill for 12 months."
          value={draft.repeatYear}
          onChange={(repeatYear) => onChange({ ...draft, repeatYear })}
        />
      ) : null}
    </View>
  );
}

export function PaidFilterControl({
  value,
  onChange,
}: {
  value: PaidFilter;
  onChange: (value: PaidFilter) => void;
}) {
  return (
    <SegmentedControl
      accessibilityLabel="Filter by paid state"
      value={value}
      onChange={onChange}
      options={[...PAID_FILTERS]}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { minHeight: 40, paddingHorizontal: 20 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
