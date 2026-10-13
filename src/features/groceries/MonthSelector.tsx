/**
 * Month stepper shared by groceries and expenses (both sub-agent 2).
 *
 * Chevron back/forward plus a label that jumps back to the current month.
 * Tapping the label is the fastest recovery from getting lost in the past.
 */

import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, IconButton, Text } from '@/components/ui';
import { currentMonth, formatMonth, shiftMonth } from '@/lib/format';

export function MonthSelector({
  month,
  onChange,
  label,
  style,
}: {
  month: string;
  onChange: (month: string) => void;
  label: string;
  style?: ViewStyle;
}) {
  const isCurrent = month === currentMonth();

  return (
    <View style={[styles.row, style]} accessibilityRole="toolbar" accessibilityLabel={label}>
      <IconButton
        icon={<Icon name="ChevronLeft" size={24} />}
        label="Previous month"
        onPress={() => onChange(shiftMonth(month, -1))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatMonth(month)}. Go to this month.`}
        accessibilityState={{ disabled: isCurrent }}
        disabled={isCurrent}
        onPress={() => onChange(currentMonth())}
        style={styles.label}
      >
        <Text variant="title" style={styles.center}>
          {formatMonth(month)}
        </Text>
        {!isCurrent ? (
          <Text variant="caption" tone="accent" style={styles.center}>
            Back to this month
          </Text>
        ) : null}
      </Pressable>
      <IconButton
        icon={<Icon name="ChevronRight" size={24} />}
        label="Next month"
        onPress={() => onChange(shiftMonth(month, 1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { flex: 1, alignItems: 'center' },
  center: { textAlign: 'center' },
});
