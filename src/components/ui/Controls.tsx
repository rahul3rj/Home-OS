import { Fragment, useEffect, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Two-to-four option switcher.
 *
 * Equal-width segments, because a control whose options resize as labels change
 * is harder to hit accurately.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (next: T) => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();

  // Sliding thumb: equal-width segments, so the thumb is pure arithmetic —
  // no per-segment measuring. It glides on a fixed-duration curve (no spring,
  // so overshoot past the track is impossible) and is placed instantly on
  // first layout so it never slides in on mount.
  const TRACK_PAD = 3;
  const SEG_GAP = 3;
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbX = useSharedValue(0);
  const placed = useRef(false);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const segWidth =
    trackWidth > 0
      ? (trackWidth - TRACK_PAD * 2 - SEG_GAP * (options.length - 1)) / options.length
      : 0;

  useEffect(() => {
    if (trackWidth <= 0) return;
    const target = TRACK_PAD + selectedIndex * (segWidth + SEG_GAP);
    thumbX.value = placed.current
      ? withTiming(target, { duration: 220, easing: Easing.out(Easing.cubic) })
      : target;
    placed.current = true;
  }, [selectedIndex, trackWidth, segWidth, thumbX]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={[
        styles.segmentTrack,
        // A capsule on the canvas; the thumb carries the brand lime. The
        // hairline outline is the last separation step (DESIGN.md order:
        // whitespace → surface shift → elevation → border) — without it the
        // unselected options melt into the canvas, especially in dark mode.
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.pill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.hairline,
          // Clips the sliding thumb: even mid-animation it can never paint
          // outside the capsule.
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {segWidth > 0 ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[
            {
              position: 'absolute',
              top: TRACK_PAD,
              bottom: TRACK_PAD,
              left: 0,
              width: segWidth,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.primary,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              {
                zIndex: 1,
                borderRadius: theme.radius.pill,
                opacity: pressed && !selected ? 0.6 : 1,
              },
            ]}
          >
            <View style={styles.segmentContent}>
              {option.icon ? (
                <Icon name={option.icon} size={16} tone={selected ? 'onPrimary' : 'muted'} />
              ) : null}
              <Text
                variant="label"
                numberOfLines={1}
                style={{ color: selected ? theme.colors.onPrimary : theme.colors.textMuted }}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Expandable region. Used for the "More options" pattern in add sheets, so
 * optional fields do not crowd the primary one.
 */
export function Collapsible({
  label,
  children,
  initiallyOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(initiallyOpen);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((current) => !current);
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        onPress={toggle}
        style={styles.collapsibleHeader}
      >
        <Text variant="label" tone="accent">
          {open ? 'Hide' : label}
        </Text>
        <View style={open && styles.chevOpen}>
          <Icon name="ChevronDown" size={18} tone="muted" />
        </View>
      </Pressable>
      {open ? <View style={{ gap: theme.spacing.md }}>{children}</View> : null}
    </View>
  );
}

/**
 * Numbered SaaS stepper: done steps are lime pills with a check, the current
 * step is a lime-ringed circle, upcoming steps are quiet outlines. The track
 * between two steps turns lime once the left one is done.
 */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}
      style={styles.stepper}
    >
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        const highlighted = done || active;

        return (
          <Fragment key={label}>
            {index > 0 ? (
              <View
                style={[
                  styles.stepLine,
                  {
                    marginTop: (STEP_CIRCLE - STEP_LINE) / 2,
                    backgroundColor:
                      index <= current ? theme.colors.primary : theme.colors.hairline,
                  },
                ]}
              />
            ) : null}

            <View style={styles.stepCol}>
              <View
                style={[
                  styles.stepCircle,
                  {
                    borderRadius: theme.radius.full,
                    backgroundColor: done ? theme.colors.primary : theme.colors.surface,
                    borderColor: done || active ? theme.colors.primary : theme.colors.hairline,
                    borderWidth: active ? 2 : 1,
                  },
                ]}
              >
                {done ? (
                  <Icon name="Check" size={16} tone="onPrimary" />
                ) : (
                  <Text
                    variant="label"
                    tone={active ? 'default' : 'faint'}
                    style={styles.stepNumber}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                variant="caption"
                tone={highlighted ? 'default' : 'faint'}
                style={highlighted ? styles.stepLabelActive : undefined}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const STEP_CIRCLE = 32;
const STEP_LINE = 2;

/**
 * The one checkbox in the app: a 28px circle, hairline ring open, positive
 * fill with a white tick done.
 *
 * With `onToggle` it is a full 48px press target carrying the checkbox role
 * itself. Without it, it is the same pixels as a visual — for rows that
 * already toggle on press (groceries, goals, history), where a nested
 * pressable would fire twice.
 */
export function CheckBox({
  checked,
  label,
  hint,
  onToggle,
}: {
  checked: boolean;
  /** Action-first accessible name. Ignored when visual-only. */
  label: string;
  hint?: string;
  onToggle?: () => void;
}) {
  const theme = useTheme();

  const box = (
    <View
      style={[
        styles.check,
        {
          borderRadius: theme.radius.full,
          borderColor: checked ? theme.colors.positive : theme.colors.hairline,
          backgroundColor: checked ? theme.colors.positive : 'transparent',
        },
      ]}
    >
      {checked ? <Icon name="Check" size={16} tone="inverse" /> : null}
    </View>
  );

  if (!onToggle) return box;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onToggle}
      style={styles.checkHit}
    >
      {box}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  stepCol: { alignItems: 'center', gap: 4, minWidth: 64 },
  stepCircle: {
    width: STEP_CIRCLE,
    height: STEP_CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stepNumber: { fontWeight: '700' },
  stepLabelActive: { fontWeight: '600' },
  stepLine: { flex: 1, height: STEP_LINE, maxWidth: 72 },

  segmentTrack: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: HIT_SIZE - 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  collapsibleHeader: {
    minHeight: HIT_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevOpen: { transform: [{ rotate: '180deg' }] },
  checkHit: {
    padding: 10,
    margin: -10,
    minWidth: HIT_SIZE,
    minHeight: HIT_SIZE,
    justifyContent: 'center',
  },
  check: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});
