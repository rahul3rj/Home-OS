import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon, tapFeedback, type IconName } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Tab = {
  key: string;
  label: string;
  icon: IconName;
  href: '/(tabs)' | '/(tabs)/groceries' | '/(tabs)/maps' | '/(tabs)/tasks' | '/(tabs)/settings';
};

const TABS: Tab[] = [
  { key: 'index', label: 'Home', icon: 'House', href: '/(tabs)' },
  { key: 'groceries', label: 'Groceries', icon: 'ShoppingCart', href: '/(tabs)/groceries' },
  { key: 'maps', label: 'Maps', icon: 'MapPin', href: '/(tabs)/maps' },
  { key: 'tasks', label: 'Tasks', icon: 'ListTodo', href: '/(tabs)/tasks' },
  { key: 'settings', label: 'Settings', icon: 'Settings', href: '/(tabs)/settings' },
];

const GLIDE = { duration: 350, easing: Easing.out(Easing.exp) };

/**
 * Bottom tab bar: a full-width white surface section (the same background the
 * bar always had), with the selected tab as a lime primary pill carrying
 * icon + label, and bare icons for the rest.
 *
 * Motion is google_nav_bar-style (Cuberto): one 350ms expo-out curve drives the
 * gliding thumb and the unfurling label together — timing, never a spring.
 * Cell widths are fixed by flex (`flexBasis: 0`, the selected cell grows
 * twice), so labels appearing never resize anything under the finger; the
 * thumb measures each cell once and glides to the selected frame, placed
 * instantly on first layout so it never slides in on mount.
 *
 * Reads the focused tab from the navigator segments and switches with
 * `router.navigate`, so it never stacks duplicate tab routes. Hides with the
 * keyboard via `tabBarHideOnKeyboard` on the Tabs navigator.
 */
export function AppTabBar() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  const segmentsKey = segments[0] === '(tabs)' ? (segments[1] ?? 'index') : 'index';
  // Optimistic selection: segments only catch up after the router finishes
  // navigating, so driving the UI off them leaves the old label hanging for
  // extra frames before its exit even starts. The pressed tab takes over
  // immediately; once the router confirms it, both values agree and the
  // segments take over again — no reset needed.
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  // A press takes over instantly; the router confirms a frame or two later.
  // Anything that bypasses the bar (home shortcuts, back button, deep links)
  // changes segments with no press — a stale press must never override the
  // real route, so it clears on every segment change. This was the stuck
  // highlight: tapping Groceries on Home left the old tab lit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external nav must reset the optimistic press
    setPressedKey(null);
  }, [segmentsKey]);
  const activeKey = pressedKey !== null && pressedKey !== segmentsKey ? pressedKey : segmentsKey;

  // Measured cell frames in track space. Widths are flex-fixed, so these are
  // stable across selection changes — the thumb target never jumps.
  const [frames, setFrames] = useState<Record<string, { x: number; width: number }>>({});
  const thumbX = useSharedValue(0);
  const thumbW = useSharedValue(0);
  const placed = useRef(false);

  const pad = theme.spacing.xs;

  useEffect(() => {
    const frame = frames[activeKey];
    if (!frame) return;
    if (placed.current) {
      thumbX.value = withTiming(frame.x, GLIDE);
      thumbW.value = withTiming(frame.width, GLIDE);
    } else {
      thumbX.value = frame.x;
      thumbW.value = frame.width;
      placed.current = true;
    }
  }, [activeKey, frames, thumbX, thumbW]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
    width: thumbW.value,
  }));

  function onTabLayout(key: string, x: number, width: number) {
    setFrames((current) => {
      const prev = current[key];
      if (prev && prev.x === x && prev.width === width) return current;
      return { ...current, [key]: { x, width } };
    });
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.colors.surface,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Main tabs"
        style={[
          styles.bar,
          {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.hairline,
          },
        ]}
      >
        <View style={[styles.track, { padding: pad }]}>
          {frames[activeKey] ? (
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[
                {
                  position: 'absolute',
                  top: pad,
                  bottom: pad,
                  left: 0,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primary,
                },
                thumbStyle,
              ]}
            />
          ) : null}
          {TABS.map((tab) => {
            const selected = tab.key === activeKey;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected }}
                onPress={() => {
                  if (selected) return;
                  tapFeedback();
                  setPressedKey(tab.key);
                  router.navigate(tab.href);
                }}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  onTabLayout(tab.key, x, width);
                }}
                style={({ pressed }) => [
                  styles.tab,
                  {
                    zIndex: 1,
                    flexBasis: 0,
                    flexGrow: selected ? 2 : 1,
                    minHeight: HIT_SIZE,
                    borderRadius: theme.radius.pill,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Icon name={tab.icon} size={22} tone={selected ? 'onPrimary' : 'muted'} />
                <TabLabel label={tab.label} visible={selected} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * google_nav_bar-style reveal: the icon stays anchored while the label
 * unfurls beside it — width, gap and opacity ride one shared curve, so
 * nothing ever pops or shoves. The natural width is read once from an
 * absolutely-positioned measurer (zero layout footprint), and the visible
 * text is pinned to it so it can never wrap or ellipsize mid-animation.
 * Always mounted; screen readers get the tab name from the Pressable label.
 */
function TabLabel({ label, visible }: { label: string; visible: boolean }) {
  const theme = useTheme();
  const [fullWidth, setFullWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, GLIDE);
  }, [visible, progress]);

  const gap = theme.spacing.sm;
  const maskStyle = useAnimatedStyle(() => ({
    width: progress.value * fullWidth,
    marginLeft: progress.value * gap,
    opacity: progress.value,
  }));

  return (
    <View>
      <View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.measurer}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0 && width !== fullWidth) setFullWidth(width);
        }}
      >
        <Text variant="caption" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Animated.View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.mask, maskStyle]}
      >
        <Text
          variant="caption"
          tone="onPrimary"
          numberOfLines={1}
          style={fullWidth > 0 ? { width: fullWidth } : undefined}
        >
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: 'transparent' },
  // Clips the sliding thumb: even mid-animation it can never paint outside
  // the bar.
  bar: { overflow: 'hidden' },
  track: { flexDirection: 'row', alignItems: 'center' },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  measurer: { position: 'absolute', opacity: 0 },
  mask: { overflow: 'hidden' },
});
