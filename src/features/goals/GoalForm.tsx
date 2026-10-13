/**
 * Add/edit goal form.
 *
 * Controlled: the caller owns the draft and the save action. Title plus an
 * optional note plus which month it targets — nothing else, because progress
 * is binary and any milestone UI would be speculative scope.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, IconButton, Input, Text } from '@/components/ui';
import { currentMonth, formatMonth, shiftMonth } from '@/lib/format';
import type { NewGoal } from './api';

export type GoalDraft = NewGoal;

export function emptyGoalDraft(month: string): GoalDraft {
  return { title: '', description: null, month };
}

export function GoalForm({
  draft,
  onChange,
  onSubmit,
}: {
  draft: GoalDraft;
  onChange: (draft: GoalDraft) => void;
  onSubmit: () => void;
}) {
  const isCurrent = draft.month === currentMonth();

  return (
    <View style={styles.form}>
      <Input
        label="Goal"
        placeholder="e.g. Trip to Goa"
        value={draft.title}
        onChangeText={(title) => onChange({ ...draft, title })}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={onSubmit}
        maxLength={120}
      />

      <Input
        label="Details (optional)"
        placeholder="What does done look like?"
        value={draft.description ?? ''}
        onChangeText={(description) => onChange({ ...draft, description })}
        multiline
        numberOfLines={3}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      <View style={styles.field}>
        <Text variant="label" tone="muted">
          Targets
        </Text>
        <View style={styles.monthRow} accessibilityRole="toolbar" accessibilityLabel="Goal month">
          <IconButton
            icon={<Icon name="ChevronLeft" size={24} />}
            label="Previous month"
            onPress={() => onChange({ ...draft, month: shiftMonth(draft.month, -1) })}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${formatMonth(draft.month)}. Go to this month.`}
            accessibilityState={{ disabled: isCurrent }}
            disabled={isCurrent}
            onPress={() => onChange({ ...draft, month: currentMonth() })}
            style={styles.monthLabel}
          >
            <Text variant="title" style={styles.center} numberOfLines={1}>
              {formatMonth(draft.month)}
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
            onPress={() => onChange({ ...draft, month: shiftMonth(draft.month, 1) })}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  field: { gap: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { flex: 1, alignItems: 'center' },
  center: { textAlign: 'center' },
});
