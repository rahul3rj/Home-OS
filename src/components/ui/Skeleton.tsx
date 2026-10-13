import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { usePageTop } from '@/components/ui/Screen';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/**
 * One shimmering block.
 *
 * Base is the theme inset fill; the sheen sweeps across in a loop driven by
 * the parent's shared progress, so every block on screen moves in sync with a
 * single running animation. No new dependency — Reanimated is already
 * installed. Sheen is the lighter step in both modes (surface on light,
 * hairline on dark), so the sweep reads on either polarity.
 */
export function SkeletonBlock({
  height = 14,
  width = '100%',
  radius,
  circle,
  style,
  progress,
}: {
  height?: number;
  width?: DimensionValue;
  radius?: number;
  /** Shorthand for a round block of diameter `circle`. */
  circle?: number;
  style?: ViewStyle;
  progress?: SharedValue<number>;
}) {
  const theme = useTheme();
  // Static fallback when no driver is passed: parked, invisible sheen. A plain
  // shared value costs nothing — no loop is started here.
  const fallback = useSharedValue(0);
  const p = progress ?? fallback;
  const [blockWidth, setBlockWidth] = useState(0);

  const sheen = useAnimatedStyle(() => ({
    transform: [{ translateX: (p.value * 2 - 1) * (blockWidth || 180) }],
    opacity: progress ? 0.55 : 0,
  }));

  const size = circle ?? null;

  return (
    <View
      onLayout={(event) => setBlockWidth(event.nativeEvent.layout.width)}
      style={[
        styles.block,
        {
          height: size ?? height,
          width: size ?? width,
          borderRadius: size ? size / 2 : (radius ?? theme.radius.md),
          backgroundColor: theme.colors.surfaceMuted,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.sheen,
          {
            width: '45%',
            backgroundColor: theme.name === 'dark' ? theme.colors.hairline : theme.colors.surface,
          },
          sheen,
        ]}
      />
    </View>
  );
}

/** Shared loop driver so every block on screen sweeps in sync. */
export function useShimmerProgress() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1300 }), -1, false);
  }, [progress]);
  return progress;
}

/**
 * Home-shaped loading skeleton.
 *
 * Deliberately measured to match `src/app/(tabs)/index.tsx`: same hero panel
 * (artwork over the ink base, avatar 56, three greeting lines), same month
 * card (header row with badge + 48 circle, display amount, savings row,
 * 6px progress bar, four shortcut circles with captions), same body (section
 * headers with badges, white ListSections, 56-min rows with hairlines). The
 * real content replaces each block in place instead of reflowing the page.
 */
export function HomeSkeleton({ hero = true }: { hero?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pageTop = usePageTop();
  const progress = useShimmerProgress();

  const todayRows = (
    <ListSkeleton>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.row,
            {
              borderBottomWidth: i < 2 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: theme.colors.hairline,
            },
          ]}
        >
          <SkeletonBlock circle={28} progress={progress} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock height={16} width={i === 1 ? '42%' : '58%'} progress={progress} />
            {i === 2 ? <SkeletonBlock height={12} width="26%" progress={progress} /> : null}
          </View>
        </View>
      ))}
    </ListSkeleton>
  );

  const goalsRows = (
    <ListSkeleton>
      {[0, 1].map((i) => (
        <View
          key={i}
          style={[
            styles.row,
            {
              borderBottomWidth: i < 1 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: theme.colors.hairline,
            },
          ]}
        >
          <SkeletonBlock circle={28} progress={progress} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock height={16} width={i === 0 ? '66%' : '48%'} progress={progress} />
            <SkeletonBlock height={12} width="38%" progress={progress} />
          </View>
        </View>
      ))}
    </ListSkeleton>
  );

  const body = (
    <View style={{ gap: theme.spacing.xl }}>
      <View>
        <SectionSkeleton labelWidth={64} progress={progress} />
        {todayRows}
      </View>

      <View>
        <SectionSkeleton labelWidth={60} progress={progress} />
        {goalsRows}
      </View>

      <ListSkeleton>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <SkeletonBlock circle={32} progress={progress} />
          <SkeletonBlock height={16} width="52%" progress={progress} />
          <SkeletonBlock height={18} width={18} radius={theme.radius.sm} progress={progress} />
        </View>
      </ListSkeleton>
    </View>
  );

  if (!hero) {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your home"
        style={{ gap: theme.spacing.xl }}
      >
        {body}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your home"
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
    >
      <View
        style={{
          backgroundColor: theme.colors.textAccent,
          paddingTop: pageTop,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
          borderBottomLeftRadius: theme.radius.xl,
          borderBottomRightRadius: theme.radius.xl,
          overflow: 'hidden',
        }}
      >
        <Image
          source={require('../../../assets/gradient.png')}
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <View style={{ gap: theme.spacing.xl }}>
          <View style={styles.heroTop}>
            <SkeletonBlock circle={56} progress={progress} />
            <View style={styles.heroTitles}>
              <SkeletonBlock height={38} width="46%" progress={progress} />
              <SkeletonBlock height={20} width="68%" progress={progress} />
              <SkeletonBlock height={12} width="38%" progress={progress} />
            </View>
          </View>
          <View
            style={[
              styles.monthCard,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.xl,
                padding: theme.spacing.xl,
                gap: theme.spacing.md,
              },
            ]}
          >
            <View style={styles.between}>
              <View style={styles.inlineStatus}>
                <SkeletonBlock height={14} width={104} progress={progress} />
                <SkeletonBlock
                  height={22}
                  width={72}
                  radius={theme.radius.pill}
                  progress={progress}
                />
              </View>
              <SkeletonBlock circle={HIT_SIZE} progress={progress} />
            </View>
            <SkeletonBlock height={42} width="58%" progress={progress} />
            <View style={styles.between}>
              <SkeletonBlock height={14} width={96} progress={progress} />
              <SkeletonBlock height={18} width={72} progress={progress} />
            </View>
            <View style={{ gap: theme.spacing.xs }}>
              <SkeletonBlock
                height={6}
                width="100%"
                radius={theme.radius.pill}
                progress={progress}
              />
              <SkeletonBlock height={12} width="62%" progress={progress} />
            </View>
            <View style={styles.quickRow}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.quickAction}>
                  <SkeletonBlock circle={HIT_SIZE} progress={progress} />
                  <SkeletonBlock height={10} width={36} progress={progress} />
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.xl,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
      >
        {body}
      </View>
    </View>
  );
}

/** Section eyebrow + badge, mirroring SectionHeader's slot and margin. */
function SectionSkeleton({
  labelWidth,
  progress,
}: {
  labelWidth: DimensionValue;
  progress: SharedValue<number>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
      <SkeletonBlock
        height={12}
        width={labelWidth}
        radius={theme.radius.pill}
        progress={progress}
      />
      <SkeletonBlock height={22} width={64} radius={theme.radius.pill} progress={progress} />
    </View>
  );
}

/** White grouped-rows card, mirroring ListSection: side padding only. */
function ListSkeleton({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.listSection,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.xl,
          paddingHorizontal: theme.spacing.xl,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { overflow: 'hidden', justifyContent: 'center' },
  sheen: { height: '100%', borderRadius: 9999 },
  // Mirrors Row: 56-min height, 12px vertical rhythm, hairline separators.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: HIT_SIZE + 8,
    paddingVertical: 12,
    gap: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listSection: { overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroTitles: { flex: 1, gap: 8, minWidth: 0 },
  monthCard: {},
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickAction: { flex: 1, alignItems: 'center', gap: 8 },
});
