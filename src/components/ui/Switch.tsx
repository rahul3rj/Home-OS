/**
 * Labeled switch row: text on the left, toggle on the right.
 *
 * The iOS-Settings-shaped way to offer an on/off option. The whole row
 * is the press target (≥48px); the Switch itself is visual-only so one tap
 * can never double-toggle, and screen readers get a single `switch` role with
 * its checked state.
 */

import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const KNOB = 24;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB - 8;

export function LabeledSwitch({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();

  // Custom-built toggle: the platform Switch paints a ripple halo on every
  // flip that cannot be disabled, so the knob here is a plain view gliding on
  // a fixed curve. No flash, ever.
  const knobX = useSharedValue(value ? KNOB_TRAVEL : 0);
  useEffect(() => {
    knobX.value = withTiming(value ? KNOB_TRAVEL : 0, { duration: 180 });
  }, [value, knobX]);
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.value }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => onChange(!value)}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" tone="faint" numberOfLines={3}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[
          styles.track,
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: theme.radius.pill,
            backgroundColor: value ? theme.colors.positivePale : theme.colors.surfaceMuted,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              width: KNOB,
              height: KNOB,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.primary,
            },
            knobStyle,
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: HIT_SIZE,
  },
  text: { flex: 1, gap: 2 },
  track: {
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  knob: {},
});
