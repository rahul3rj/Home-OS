/**
 * One grocery row: tap anywhere to tick off, swipe to act.
 *
 * Full-swipe gestures, no buttons: dragging rightward opens edit, dragging
 * leftward deletes (with a 4-second undo). Faint hint washes sit behind the
 * row while dragging so the gesture is discoverable. The same three actions
 * exist as accessibility actions, because swipe alone is not operable with
 * VoiceOver or TalkBack.
 */

import { useRef, type ElementRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { CheckBox, Chip, Icon, Text } from '@/components/ui';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import type { GroceryWithBuyer } from './api';

/**
 * Hint wash revealed behind the row mid-drag. Visual only — the gesture
 * itself fires the action on release, so there is nothing to tap.
 */
function SwipeHint({
  side,
  label,
  icon,
  tone,
}: {
  side: 'left' | 'right';
  label: string;
  icon: 'Check' | 'X' | 'ListTodo';
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const theme = useTheme();
  const backgrounds = {
    positive: theme.colors.positivePale,
    negative: theme.colors.negativePale,
    neutral: theme.colors.surfaceMuted,
  };
  const inks = {
    positive: theme.colors.positiveDeep,
    negative: theme.colors.negative,
    neutral: theme.colors.textMuted,
  };
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.hint,
        {
          backgroundColor: backgrounds[tone],
          borderRadius: theme.radius.none,
          justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        },
      ]}
    >
      <Icon name={icon} size={22} tone={tone === 'positive' ? 'positive' : 'muted'} />
      <Text variant="label" style={{ color: inks[tone] }}>
        {label}
      </Text>
    </View>
  );
}

export function GroceryRow({
  item,
  onToggle,
  onDelete,
  onEdit,
  onOrder,
  separator = true,
}: {
  item: GroceryWithBuyer;
  onToggle: () => void;
  onDelete: () => void;
  /** Opens the full edit sheet (name, category, quantity, staple). */
  onEdit: () => void;
  /** Orders this item from the default store (or asks to pick one). */
  onOrder: () => void;
  /** Hairline under the row — false on the last row of a ListSection. */
  separator?: boolean;
}) {
  const theme = useTheme();
  const swipeable = useRef<ElementRef<typeof ReanimatedSwipeable>>(null);

  function startEditing() {
    // The panel is open over the row at this point — close it first so the
    // sheet lands on a settled list instead of a mid-gesture one.
    swipeable.current?.close();
    onEdit();
  }

  // Every action settles the panel first. Firing a list update while the panel
  // is open unmounts the row mid-gesture, which is how taps got swallowed.
  function act(fn: () => void) {
    swipeable.current?.close();
    fn();
  }

  const detail = [item.quantity !== null ? String(item.quantity) : null, item.unit]
    .filter(Boolean)
    .join(' ');

  const caption = [
    detail || null,
    item.category,
    item.is_permanent ? 'Monthly' : null,
    item.buyer_name,
  ]
    .filter(Boolean)
    .join(' · ');

  const row = (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.is_bought }}
      accessibilityLabel={`${item.name}, ${item.is_bought ? 'bought' : 'not bought'}`}
      accessibilityHint="Double tap to tick off"
      onPress={onToggle}
      style={[
        styles.row,
        {
          minHeight: HIT_SIZE + 8,
          borderBottomWidth: separator ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: theme.colors.hairline,
          opacity: item.is_bought ? 0.75 : 1,
        },
      ]}
    >
      {/* Visual-only: the whole row above already toggles on press. */}
      <CheckBox checked={item.is_bought} label={`${item.name}, bought`} />

      <View style={styles.flex}>
        <Text
          variant="bodyStrong"
          numberOfLines={2}
          style={item.is_bought ? styles.struck : undefined}
        >
          {item.name}
        </Text>
        {caption ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>

      {item.is_permanent && !item.is_bought ? <Chip label="Monthly" selected={false} /> : null}

      {!item.is_bought ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Order ${item.name}`}
          accessibilityHint="Opens the item searched in your delivery app"
          onPress={onOrder}
          style={styles.orderHit}
        >
          <Icon name="ShoppingCart" size={22} tone="muted" />
        </Pressable>
      ) : null}
    </Pressable>
  );

  return (
    <View
      accessible
      accessibilityLabel={`${item.name}, ${item.is_bought ? 'bought' : 'not bought'}${
        item.buyer_name ? ` by ${item.buyer_name}` : ''
      }`}
      accessibilityActions={[
        {
          name: 'toggle',
          label: item.is_bought ? 'Mark as not bought' : 'Mark as bought',
        },
        { name: 'rename', label: 'Edit item' },
        { name: 'delete', label: 'Delete item' },
        ...(item.is_bought ? [] : [{ name: 'order', label: `Order ${item.name}` }]),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'toggle') onToggle();
        if (event.nativeEvent.actionName === 'rename') startEditing();
        if (event.nativeEvent.actionName === 'delete') onDelete();
        if (event.nativeEvent.actionName === 'order') onOrder();
      }}
    >
      <ReanimatedSwipeable
        ref={swipeable}
        friction={2}
        leftThreshold={96}
        rightThreshold={96}
        // No activeOffsetX prop in this gesture-handler version: horizontal
        // drags past dragOffset claim the gesture while vertical scrolls stay
        // with the list, which is the same non-fighting behaviour.
        dragOffsetFromLeftEdge={10}
        dragOffsetFromRightEdge={10}
        renderLeftActions={() => (
          <SwipeHint side="left" label="Edit" icon="ListTodo" tone="neutral" />
        )}
        renderRightActions={() => (
          <SwipeHint side="right" label="Delete" icon="X" tone="negative" />
        )}
        onSwipeableOpen={(direction) => {
          // A released full swipe is the whole action. NOTE on the direction
          // semantics: 'right' fires when the row was dragged rightward (left
          // panel revealed), 'left' when dragged leftward. Swapped once after
          // observing it backwards on device — trust behavior, not docs here.
          if (direction === 'right') startEditing();
          else act(onDelete);
        }}
      >
        {row}
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  flex: { flex: 1, gap: 2 },
  orderHit: { padding: 6, margin: -6 },
  struck: { textDecorationLine: 'line-through' },
  hint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    minHeight: 56,
  },
});
