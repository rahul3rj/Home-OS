import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { avatarTints } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** Initials from a display name. Handles single names and empty strings. */
export function initialsOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Initials avatar, or the uploaded photo when one exists.
 *
 * `tintIndex` comes from profiles.avatar_index, so a person keeps the same
 * colour on every device without storing anything per-device. `uri` comes
 * from profiles.avatar_url; when set, the photo replaces the initials and the
 * tint is only the loading backdrop.
 */
export function Avatar({
  name,
  tintIndex = 0,
  size = 40,
  uri = null,
  style,
}: {
  name: string | null | undefined;
  tintIndex?: number;
  size?: number;
  /** Photo URL. Null/undefined falls back to coloured initials. */
  uri?: string | null;
  // ImageStyle, not ViewStyle: expo-image rejects ViewStyle, while a View
  // accepts ImageStyle fine — one type serves both branches below.
  style?: ImageStyle;
}) {
  const tint = avatarTints[tintIndex % avatarTints.length];
  const theme = useTheme();

  const shape = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={name ?? 'Member'}
        style={[styles.avatar, shape, { backgroundColor: tint }, style]}
        contentFit="cover"
        // Crossfade on load so a new photo blooms in instead of popping.
        transition={250}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={name ?? 'Member'}
      style={[styles.avatar, shape, { backgroundColor: tint }, style]}
    >
      <Text
        variant="label"
        // Contrast against every avatar tint is well above 4.5:1.
        style={[styles.initials, { fontSize: size * 0.38, color: theme.colors.surface }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/** Small count or status pill. */
export function Badge({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: 'neutral' | 'primary' | 'positive' | 'warning' | 'negative';
  style?: ViewStyle;
}) {
  const theme = useTheme();

  // `{badge-positive}` and `{badge-negative}` from DESIGN.md: a pale green pill
  // with deep green ink, and a dark maroon pill with white. Lime is not a status
  // colour here — it is the CTA.
  //
  // The negative pill keeps a dark maroon fill in both modes, but `surface`
  // is only white in light mode (it is the dark card fill in dark mode), so
  // dark mode pairs the fill with the light semantic ink instead. Without
  // this the "N unpaid" and overdue badges render dark-on-dark and vanish.
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceMuted, fg: theme.colors.textMuted },
    primary: { bg: theme.colors.primary, fg: theme.colors.onPrimary },
    positive: { bg: theme.colors.positivePale, fg: theme.colors.positiveDeep },
    warning: { bg: theme.colors.warning, fg: theme.colors.warningContent },
    negative:
      theme.name === 'dark'
        ? { bg: theme.colors.negativeBg, fg: theme.colors.negativeDeep }
        : { bg: theme.colors.negativeBg, fg: theme.colors.surface },
  };

  const { bg, fg } = tones[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderRadius: theme.radius.pill }, style]}>
      <Text variant="caption" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Thin single-fill progress bar.
 *
 * Deliberately not a ring or a chart — the tasks feature needs a completion
 * count, and a chart library for one bar would be a large dependency for a
 * single element.
 */
export function ProgressBar({
  value,
  tone = 'primary',
  style,
}: {
  /** 0 to 1. Clamped, so a bad ratio cannot render a broken bar. */
  value: number;
  tone?: 'primary' | 'accent' | 'positive';
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

  // Lime is the "making progress" signal — it is the one place outside a button
  // where the brand accent is allowed to fill.
  const fills = {
    primary: theme.colors.primary,
    accent: theme.colors.textAccent,
    positive: theme.colors.positive,
  };

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[
        styles.track,
        { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: fills[tone],
            width: `${clamped * 100}%`,
            borderRadius: theme.radius.pill,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  track: { height: 6, width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
});
