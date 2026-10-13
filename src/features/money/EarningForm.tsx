/**
 * Add/edit earning form, rendered inside a bottom sheet.
 *
 * Controlled: the screen owns the draft and the save action, so the sheet
 * can put Save in its footer. Amount takes the numeric keypad; source is a
 * chip picker (never free text — it is unique per month); the note is
 * optional. Validation is inline on the amount field; the screen keeps the
 * sheet open when the amount is missing.
 */

import { StyleSheet, View } from 'react-native';

import { Chip, Input, Text } from '@/components/ui';
import { EARNING_SOURCES } from '@/lib/types';
import { useTheme } from '@/theme/useTheme';
import { parseAmount } from './amount';

export type EarningDraft = {
  amountRaw: string;
  source: string;
  note: string;
};

export const emptyEarningDraft: EarningDraft = {
  amountRaw: '',
  source: 'Salary',
  note: '',
};

export function EarningForm({
  draft,
  onChange,
  onSubmit,
  showErrors,
}: {
  draft: EarningDraft;
  onChange: (draft: EarningDraft) => void;
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
        placeholder="e.g. 25,000"
        value={draft.amountRaw}
        onChangeText={(amountRaw) => onChange({ ...draft, amountRaw })}
        keyboardType="decimal-pad"
        autoFocus
        returnKeyType="next"
        error={amountInvalid ? 'Enter an amount above ₹0.' : null}
        hint="Whole rupees are fine — paise are optional."
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="muted">
          Source
        </Text>
        <View style={styles.chips}>
          {EARNING_SOURCES.map((source) => (
            <Chip
              key={source}
              label={source}
              selected={draft.source === source}
              onPress={() => onChange({ ...draft, source })}
            />
          ))}
        </View>
        <Text variant="caption" tone="faint">
          One entry per source each month.
        </Text>
      </View>

      <Input
        label="Note (optional)"
        placeholder="e.g. October salary"
        value={draft.note}
        onChangeText={(note) => onChange({ ...draft, note })}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
