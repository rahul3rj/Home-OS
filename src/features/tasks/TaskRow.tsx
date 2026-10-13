/**
 * One task row: a large checkbox to tick off, the name to open details.
 *
 * The same toggle/delete actions exist as accessibility actions, because a
 * checkbox alone is not operable the same way for every screen-reader user.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, CheckBox, Chip, Text } from '@/components/ui';
import { formatDueAt } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { cadenceLabel } from './TaskForm';
import type { TaskWithPeople } from './api';

export function TaskRow({
  task,
  done,
  doneBy,
  onToggle,
  onDelete,
  onOpen,
}: {
  task: TaskWithPeople;
  done: boolean;
  /** Who ticked it off today, for the caption. Null while open. */
  doneBy: string | null;
  onToggle: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();

  const caption = [
    task.cadence === 'once' ? null : cadenceLabel(task.cadence),
    task.is_permanent ? 'Repeats' : null,
    task.assignee && task.cadence !== 'daily' ? task.assignee.display_name : null,
    task.due_at && !done ? `Due ${formatDueAt(task.due_at)}` : null,
    doneBy ? `Done by ${doneBy}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      accessible
      accessibilityLabel={`${task.title}, ${done ? 'done' : 'not done'}`}
      accessibilityActions={[
        { name: 'toggle', label: done ? 'Mark as not done' : 'Mark as done' },
        { name: 'delete', label: 'Delete task' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'toggle') onToggle();
        if (event.nativeEvent.actionName === 'delete') onDelete();
      }}
    >
      <View
        style={[
          styles.row,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.xl,
            opacity: done ? 0.75 : 1,
          },
        ]}
      >
        <CheckBox
          checked={done}
          label={`${task.title}, ${done ? 'done' : 'not done'}`}
          hint="Double tap to tick off"
          onToggle={onToggle}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${task.title}`}
          accessibilityHint="Opens task details"
          onPress={onOpen}
          style={styles.flex}
        >
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={2} style={done ? styles.struck : undefined}>
              {task.title}
            </Text>
            {caption ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {caption}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {task.assignee && task.cadence !== 'daily' ? (
          <Avatar
            name={task.assignee.display_name}
            tintIndex={task.assignee.avatar_index}
            size={28}
            uri={task.assignee.avatar_url}
          />
        ) : null}
        {task.is_permanent && !done ? <Chip label="Repeats" selected={false} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  flex: { flex: 1, gap: 2 },
  struck: { textDecorationLine: 'line-through' },
});
