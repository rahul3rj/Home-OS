/**
 * Week grid: one member's seven days, one row per day.
 *
 * Rows (not columns) because a phone is narrow — seven columns would squeeze
 * every task name to an initial. Each day lists that member's due tasks with
 * the same large checkbox as the list view, so the gesture never changes.
 * The whole grid is Pressables with checkbox roles, so keyboard and screen
 * readers walk it day by day.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { CheckBox, Icon, IconButton, ProgressBar, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { createdOn, type TaskWithPeople } from './api';
import { dateKey, formatWeekRange, isSameDay, weekDates, weekdayLabels } from './week';

function dueOn(task: TaskWithPeople, day: string): boolean {
  if (task.cadence !== 'once') return true;
  // A one-off is due from its creation day until it is done — an old one that
  // was never ticked off keeps showing (overdue) instead of silently vanishing.
  return createdOn(task) <= day;
}

export function WeekGrid({
  anchor,
  onAnchorChange,
  memberName,
  tasks,
  completions,
  onToggle,
}: {
  anchor: Date;
  onAnchorChange: (next: Date) => void;
  memberName: string;
  tasks: TaskWithPeople[];
  completions: Map<string, Map<string, string[]>>;
  onToggle: (task: TaskWithPeople, date: string) => void;
}) {
  const days = weekDates(anchor);
  const { start, end } = formatWeekRange(anchor);
  const theme = useTheme();
  const todayKey = dateKey(new Date());

  const dueByDay = days.map((day) =>
    tasks.filter((task) => {
      if (!dueOn(task, day)) return false;
      if (task.cadence !== 'once') return true;
      // Carried forward only while still open: a completion on any earlier day
      // of the window closes every later slot.
      const doneEarlier = days.some(
        (other) =>
          other < day &&
          other >= createdOn(task) &&
          (completions.get(task.id)?.get(other)?.length ?? 0) > 0,
      );
      return !doneEarlier;
    }),
  );

  const dueSlots = dueByDay.reduce((sum, list) => sum + list.length, 0);
  const doneSlots = dueByDay.reduce(
    (sum, list, index) =>
      sum +
      list.filter((task) => (completions.get(task.id)?.get(days[index])?.length ?? 0) > 0).length,
    0,
  );

  function shift(delta: number) {
    const next = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + delta);
    onAnchorChange(next);
  }

  return (
    <View style={styles.grid} accessibilityRole="list" accessibilityLabel={`${memberName}'s week`}>
      <View style={styles.nav} accessibilityRole="toolbar" accessibilityLabel="Week">
        <IconButton
          icon={<Icon name="ChevronLeft" size={24} />}
          label="Previous week"
          onPress={() => shift(-7)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Week of ${formatDate(dateKey(start))}. Go to this week.`}
          accessibilityHint="Shows this week"
          onPress={() => onAnchorChange(new Date())}
          style={styles.navLabel}
        >
          <Text variant="title" style={styles.center} numberOfLines={1}>
            {`${formatDate(dateKey(start))} – ${formatDate(dateKey(end))}`}
          </Text>
          {!isSameDay(anchor, new Date()) ? (
            <Text variant="caption" tone="accent" style={styles.center}>
              Back to this week
            </Text>
          ) : null}
        </Pressable>
        <IconButton
          icon={<Icon name="ChevronRight" size={24} />}
          label="Next week"
          onPress={() => shift(7)}
        />
      </View>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${doneSlots} of ${dueSlots} done this week`}
      >
        <ProgressBar value={dueSlots === 0 ? 0 : doneSlots / dueSlots} />
        <Text variant="caption" tone="faint" style={styles.center}>
          {dueSlots === 0 ? 'Nothing due this week' : `${doneSlots} of ${dueSlots} done this week`}
        </Text>
      </View>

      {days.map((day, index) => {
        const due = dueByDay[index];
        const label = weekdayLabels[index];
        const isToday = day === todayKey;
        return (
          <View
            key={day}
            accessibilityRole="list"
            accessibilityLabel={`${label} ${formatDate(day)}${isToday ? ', today' : ''}`}
            style={styles.day}
          >
            <View style={styles.dayHead}>
              <Text variant="label" tone={isToday ? 'accent' : 'muted'} numberOfLines={1}>
                {label}
              </Text>
              <Text variant="caption" tone="faint" numberOfLines={1}>
                {formatDate(day)}
              </Text>
              {isToday ? (
                <View
                  style={[styles.todayDot, { backgroundColor: theme.colors.positive }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              ) : null}
            </View>
            {due.length === 0 ? (
              <Text variant="caption" tone="faint">
                Nothing due
              </Text>
            ) : (
              due.map((task) => {
                const done = (completions.get(task.id)?.get(day)?.length ?? 0) > 0;
                return (
                  <Pressable
                    key={task.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={`${task.title}, ${label}, ${done ? 'done' : 'not done'}`}
                    accessibilityHint="Double tap to tick off"
                    onPress={() => onToggle(task, day)}
                    style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
                  >
                    {/* Visual-only: the slot above already toggles on press. */}
                    <CheckBox checked={done} label={`${task.title}, ${label}`} />
                    <Text
                      variant="body"
                      tone={done ? 'muted' : 'default'}
                      numberOfLines={2}
                      style={[styles.slotText, done && styles.struck]}
                    >
                      {task.title}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navLabel: { flex: 1, alignItems: 'center' },
  center: { textAlign: 'center' },
  day: { gap: 4 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayDot: { width: 8, height: 8, borderRadius: 4 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 6,
  },
  slotText: { flex: 1 },
  pressed: { opacity: 0.6 },
  struck: { textDecorationLine: 'line-through' },
});
