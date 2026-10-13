import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { InkContext, Text } from '@/components/ui/Text';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/**
 * Compact screen header.
 *
 * Deliberately NOT a large title. Android's own guidance reserves large titles
 * for parent views; using one on every screen is a top-level AI-slop tell and
 * wastes vertical space on a phone.
 */
export function ScreenHeader({
  title,
  subtitle,
  left,
  right,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.header, { marginBottom: theme.spacing.lg }]}>
      {left ? <View style={styles.side}>{left}</View> : null}

      <View style={styles.titles}>
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="faint">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? <View style={styles.side}>{right}</View> : null}
    </View>
  );
}

/**
 * Small uppercase group label.
 *
 * Android TalkBack spells out every letter when `textTransform: uppercase` is
 * combined with letter spacing, so the accessible name is set separately in
 * natural casing.
 */
export function SectionHeader({ label, action }: { label: string; action?: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
      <Text variant="caption" tone="faint" accessibilityLabel={label} style={styles.sectionLabel}>
        {label}
      </Text>
      {action}
    </View>
  );
}

/** The card fills available in the brand's palette. */
export type CardTone = 'surface' | 'sage' | 'green' | 'dark' | 'negative';

/**
 * A distinct entity worth boxing — a goal, a savings summary.
 *
 * NOT for list rows. See Row for those: one card per row is the "cardyptosis"
 * pattern that makes a list hard to scan.
 *
 * Every tone is 24px-rounded with 24px of interior padding, and none of them
 * carry a shadow: the white-on-sage surface contrast is the brand's elevation.
 */
export function Card({
  children,
  style,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: ViewStyle;
  tone?: CardTone;
}) {
  const theme = useTheme();

  // Each dark fill needs light type, so the card carries its own ink too.
  const tones: Record<CardTone, { bg: string; fg: string }> = {
    surface: { bg: theme.colors.surface, fg: theme.colors.text },
    sage: { bg: theme.colors.surfaceMuted, fg: theme.colors.text },
    green: { bg: theme.colors.primaryPale, fg: theme.colors.text },
    dark: { bg: theme.colors.surfaceInverse, fg: theme.colors.onInverse },
    negative: { bg: theme.colors.negativeBg, fg: theme.colors.surface },
  };

  const { bg, fg } = tones[tone];
  const inverted = tone === 'dark' || tone === 'negative';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderRadius: theme.radius.xl,
          padding: theme.spacing.xl,
          gap: theme.spacing.md,
        },
        style,
      ]}
    >
      {/* An inverted card hands its own ink down the tree, so nothing inside it
          has to repeat a tone prop to stay legible. */}
      {inverted ? (
        <InkContext.Provider value={{ fg, muted: fg, faint: fg }}>{children}</InkContext.Provider>
      ) : (
        children
      )}
    </View>
  );
}

/**
 * Borderless list row with an optional hairline separator.
 *
 * Height is a minimum, not a fixed value, so the row grows when the user has
 * larger system text instead of clipping it.
 */
export function Row({
  children,
  onPress,
  onLongPress,
  separator = true,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  separator?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
  disabled?: boolean;
}) {
  const theme = useTheme();

  const content = (
    <View
      style={[
        styles.row,
        {
          minHeight: HIT_SIZE + 8,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md,
          borderBottomWidth: separator ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: theme.colors.hairline,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  );
}

/** Groups rows with a white card behind them, so the group reads on the sage canvas. */
export function ListSection({ children, style }: { children: ReactNode; style?: ViewStyle }) {
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
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titles: { flex: 1, gap: 2 },
  side: { minWidth: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The eyebrow label: uppercase, tracked out, and semibold so it reads as a
  // label rather than as body copy that happens to be small.
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 1 },
  card: {},
  row: { flexDirection: 'row', alignItems: 'center' },
  listSection: { overflow: 'hidden' },
});
