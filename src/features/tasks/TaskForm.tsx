/**
 * Add/edit task form for the bottom sheet.
 *
 * Controlled: the caller owns the draft and the save action. Cadence is a
 * segmented switch; the assignee picker only exists when the cadence is not
 * daily — daily tasks are personal, and offering a picker would write a row
 * the database rejects.
 */

import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  Avatar,
  Button,
  Chip,
  Input,
  LabeledSwitch,
  SegmentedControl,
  Text,
} from '@/components/ui';
import { formatDueAt } from '@/lib/format';
import { canPingThisDevice } from '@/lib/notifications';
import type { Member } from '@/lib/types';
import type { NewTask } from './api';
import { ensureReminderPermission } from './reminders';

export type TaskDraft = NewTask;

export const emptyTaskDraft: TaskDraft = {
  title: '',
  cadence: 'daily',
  is_permanent: false,
  assignee_id: null,
  due_at: null,
};

/** Tomorrow at 9:00 — the least surprising first deadline. */
function defaultDeadline(): string {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(9, 0, 0, 0);
  return at.toISOString();
}

export const CADENCE_OPTIONS = [
  { value: 'once', label: 'One-off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] as const;

export function cadenceLabel(cadence: TaskDraft['cadence']): string {
  if (cadence === 'daily') return 'Daily';
  if (cadence === 'weekly') return 'Weekly';
  return 'One-off';
}

export function TaskForm({
  draft,
  onChange,
  onSubmit,
  members,
  meId,
}: {
  draft: TaskDraft;
  onChange: (draft: TaskDraft) => void;
  onSubmit: () => void;
  members: Member[];
  meId: string | null;
}) {
  const showAssignee = draft.cadence !== 'daily';
  const [picker, setPicker] = useState<null | 'date' | 'time'>(null);
  const [permNote, setPermNote] = useState(false);
  const [dueDate, dueTime] = draft.due_at ? formatDueAt(draft.due_at).split(' · ') : [];

  function toggleDeadline(on: boolean) {
    if (on) {
      onChange({ ...draft, due_at: defaultDeadline() });
      // Ask in context: the switch is the moment wanting a ping is clearest.
      // A refusal still saves the deadline — it just will not ping.
      void ensureReminderPermission().then((ok) => setPermNote(!ok));
    } else {
      setPermNote(false);
      setPicker(null);
      onChange({ ...draft, due_at: null });
    }
  }

  function pickMoment(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') {
      setPicker(null);
      return;
    }
    if (!selected || !draft.due_at) return;
    const base = new Date(draft.due_at);
    if (picker === 'date') {
      base.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    } else {
      base.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    onChange({ ...draft, due_at: base.toISOString() });
    if (Platform.OS === 'android') setPicker(null);
  }

  return (
    <View style={styles.form}>
      <Input
        label="Task name"
        placeholder="e.g. Take out the bins"
        value={draft.title}
        onChangeText={(title) => onChange({ ...draft, title })}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        maxLength={120}
      />

      <View style={styles.field}>
        <Text variant="label" tone="muted">
          How often
        </Text>
        <SegmentedControl
          options={[...CADENCE_OPTIONS]}
          value={draft.cadence}
          onChange={(cadence) =>
            onChange({
              ...draft,
              cadence,
              // Clearing here (not on save) keeps the intent visible: switching
              // back to weekly starts unassigned again.
              assignee_id: cadence === 'daily' ? null : draft.assignee_id,
            })
          }
          accessibilityLabel="How often the task repeats"
        />
        {draft.cadence === 'daily' ? (
          <Text variant="caption" tone="faint">
            Daily tasks are just for you — nobody else can be assigned.
          </Text>
        ) : null}
      </View>

      {showAssignee ? (
        <View style={styles.field}>
          <Text variant="label" tone="muted">
            Assigned to
          </Text>
          <View style={styles.chips}>
            <Chip
              label="Anyone"
              selected={draft.assignee_id === null}
              onPress={() => onChange({ ...draft, assignee_id: null })}
            />
            {members.map((member) => {
              const name = member.profile?.display_name ?? 'Member';
              const isMe = member.user_id === meId;
              return (
                <Chip
                  key={member.user_id}
                  label={isMe ? `${name} (you)` : name}
                  selected={draft.assignee_id === member.user_id}
                  onPress={() => onChange({ ...draft, assignee_id: member.user_id })}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.field}>
        <LabeledSwitch
          label={draft.is_permanent ? 'Repeats forever' : 'Ends once done'}
          hint={
            draft.is_permanent
              ? 'Stays on the list and comes back every day or week.'
              : 'A temporary task disappears from Today once it is done.'
          }
          value={draft.is_permanent}
          onChange={(is_permanent) => onChange({ ...draft, is_permanent })}
        />
      </View>

      <View style={styles.field}>
        <LabeledSwitch
          label="Deadline"
          hint={
            draft.due_at
              ? canPingThisDevice()
                ? `Pings this phone ${formatDueAt(draft.due_at)}.`
                : `Due ${formatDueAt(draft.due_at)} — pings need a dev build.`
              : canPingThisDevice()
                ? 'Ask for a date and get pinged there.'
                : 'Ask for a date — pings need a dev build.'
          }
          value={draft.due_at !== null}
          onChange={toggleDeadline}
        />
        {draft.due_at ? (
          <View style={styles.deadlineRow}>
            <Button
              label={dueDate ?? 'Pick date'}
              variant="secondary"
              size="sm"
              onPress={() => setPicker('date')}
            />
            <Button
              label={dueTime ?? 'Pick time'}
              variant="secondary"
              size="sm"
              onPress={() => setPicker('time')}
            />
          </View>
        ) : null}
        {permNote ? (
          <Text variant="caption" tone="muted">
            Notifications are off — the deadline still saves, but this phone will not ping.
          </Text>
        ) : null}
        {picker && draft.due_at ? (
          <DateTimePicker
            value={new Date(draft.due_at)}
            mode={picker}
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            minimumDate={new Date()}
            onChange={pickMoment}
          />
        ) : null}
      </View>

      {showAssignee && draft.assignee_id ? (
        <View style={styles.assigneePreview}>
          <Avatar
            name={members.find((m) => m.user_id === draft.assignee_id)?.profile?.display_name}
            tintIndex={
              members.find((m) => m.user_id === draft.assignee_id)?.profile?.avatar_index ?? 0
            }
            size={28}
            uri={members.find((m) => m.user_id === draft.assignee_id)?.profile?.avatar_url ?? null}
          />
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {members.find((m) => m.user_id === draft.assignee_id)?.profile?.display_name ??
              'Member'}{' '}
            will see this on their list
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  field: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  deadlineRow: { flexDirection: 'row', gap: 8 },
  assigneePreview: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
