/**
 * Set/edit savings form, rendered inside a bottom sheet.
 *
 * One allocation per member per month, so this is a single amount plus an
 * optional note — not a list. Controlled like the earning form: the screen
 * owns the draft and the save action.
 */

import { View } from 'react-native';

import { Input } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';
import { parseAmount } from './amount';

export type SavingsDraft = {
  amountRaw: string;
  note: string;
};

export const emptySavingsDraft: SavingsDraft = {
  amountRaw: '',
  note: '',
};

export function SavingsForm({
  draft,
  onChange,
  onSubmit,
  showErrors,
}: {
  draft: SavingsDraft;
  onChange: (draft: SavingsDraft) => void;
  onSubmit: () => void;
  /** True once a save was attempted — empty amounts error only from then on. */
  showErrors: boolean;
}) {
  const theme = useTheme();
  const amountInvalid =
    (showErrors || draft.amountRaw.trim() !== '') && parseAmount(draft.amountRaw) === null;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Input
        label="Amount"
        placeholder="e.g. 10,000"
        value={draft.amountRaw}
        onChangeText={(amountRaw) => onChange({ ...draft, amountRaw })}
        keyboardType="decimal-pad"
        autoFocus
        returnKeyType="next"
        error={amountInvalid ? 'Enter an amount above ₹0.' : null}
        hint="What you set aside this month. Only you can see it."
      />
      <Input
        label="Note (optional)"
        placeholder="e.g. Emergency fund"
        value={draft.note}
        onChangeText={(note) => onChange({ ...draft, note })}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}
