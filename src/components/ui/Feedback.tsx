import {
  BatteryMedium,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  Copy,
  Flag,
  House,
  Info,
  ListChecks,
  ListTodo,
  LocateFixed,
  MapPin,
  Moon,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  Share,
  ShoppingCart,
  Siren,
  Sun,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/ui/Text';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/**
 * The app's one icon set, curated from Lucide.
 *
 * Emoji are forbidden as icons (see DESIGN.md), and mixing icon families is the
 * other tell — every glyph here is the same 2px-stroke geometric family, so a
 * settings gear and a grocery cart look like they were drawn by one hand.
 * Only icons the app actually uses are listed; add to the map, never import
 * Lucide directly from a screen.
 */
const ICONS = {
  BatteryMedium,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  Copy,
  Flag,
  House,
  Info,
  ListChecks,
  ListTodo,
  LocateFixed,
  MapPin,
  Moon,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  Share,
  ShoppingCart,
  Siren,
  Sun,
  User,
  Users,
  Wallet,
  X,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  tone = 'muted',
}: {
  name: IconName;
  size?: number;
  tone?: 'default' | 'muted' | 'faint' | 'positive' | 'negative' | 'inverse' | 'onPrimary';
}) {
  const theme = useTheme();

  // No lime icon tone: the accent is a fill, and an outline glyph in it would
  // be unreadable at 18–22px on either the sage canvas or a white card.
  // `onPrimary` is the ink that sits ON the lime fill (buttons, marks, pills).
  const colors = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    faint: theme.colors.textFaint,
    positive: theme.colors.positiveDeep,
    negative: theme.colors.negative,
    inverse: theme.colors.onInverse,
    onPrimary: theme.colors.onPrimary,
  };

  const Glyph = ICONS[name];
  return <Glyph size={size} color={colors[tone]} />;
}

/** Short haptic. Ignored on web, where there is no such thing. */
export function tapFeedback(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(style);
}

/** Positive haptic for a rare good moment, e.g. completing a goal. */
export function successFeedback() {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Small selectable tag, for categories and permanent-vs-temporary. */
export function Chip({
  label,
  selected,
  onPress,
  tone = 'primary',
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'primary' | 'neutral' | 'inverse';
  style?: ViewStyle;
}) {
  const theme = useTheme();

  // A selected chip inverts to a solid fill — lime for the brand tone, ink for
  // the inverse tone — and takes that fill's own ink as its label. Unselected
  // keeps a hairline outline so a row of chips does not read as a block of noise.
  const accents = {
    primary: { active: theme.colors.primary, ink: theme.colors.onPrimary },
    neutral: { active: theme.colors.surfaceMuted, ink: theme.colors.text },
    inverse: { active: theme.colors.surfaceInverse, ink: theme.colors.onInverse },
  };
  const accent = accents[tone];

  const body = (
    <View
      style={[
        styles.chip,
        {
          borderRadius: theme.radius.pill,
          paddingHorizontal: 12,
          backgroundColor: selected ? accent.active : 'transparent',
          borderColor: selected ? accent.ink : theme.colors.hairline,
        },
        style,
      ]}
    >
      <Text
        variant="caption"
        style={{ color: selected ? accent.ink : theme.colors.textMuted }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [pressed && { opacity: 0.6 }]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Floating action button.
 *
 * Reserved for screens with no natural inline affordance. The grocery list gets
 * a persistent bottom input bar instead, because typing and adding belong in the
 * same gesture.
 */
export function Fab({
  icon,
  label,
  onPress,
  style,
}: {
  icon: IconName;
  /** Required: an icon alone tells a screen-reader user nothing. */
  label: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.fab,
        {
          // The FAB is the screen's primary action, so it wears the brand CTA.
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radius.pill,
          ...theme.shadow.floating,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={26} tone="onPrimary" />
    </Pressable>
  );
}

/**
 * Undo toast.
 *
 * Destructive actions get a few seconds to be taken back rather than a
 * confirmation dialog, which people dismiss without reading.
 */
export function UndoToast({
  message,
  actionLabel = 'Undo',
  onAction,
  bottomOffset = 0,
}: {
  message: string | null;
  actionLabel?: string;
  onAction: () => void;
  bottomOffset?: number;
}) {
  const theme = useTheme();

  // `aria-live` is Android-only. iOS needs an explicit announcement, or the
  // message is never spoken at all. Declared before the early return because
  // hooks may not be conditional.
  useEffect(() => {
    if (!message || Platform.OS === 'android') return;
    AccessibilityInfo.announceForAccessibility?.(message);
  }, [message]);

  if (!message) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          bottom: bottomOffset + theme.spacing.lg,
          // The dark polarity flip, as in the DESIGN.md footer band.
          backgroundColor: theme.colors.surfaceInverse,
          borderRadius: theme.radius.xl,
          ...theme.shadow.raised,
          paddingHorizontal: theme.spacing.xl,
        },
      ]}
    >
      <Text variant="label" tone="onInverse" numberOfLines={2} style={styles.toastMessage}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        onPress={() => {
          tapFeedback();
          onAction();
        }}
        style={styles.toastAction}
      >
        <Text variant="label" style={{ color: theme.colors.primary }}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 48 is the tap area; the visual pill stays 36 by clipping inside it, so the
  // chip is a full-size target without looking like a button.
  chip: {
    minHeight: HIT_SIZE,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: HIT_SIZE + 8,
    height: HIT_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  toastMessage: { flex: 1 },
  toastAction: { minHeight: HIT_SIZE - 12, justifyContent: 'center', paddingHorizontal: 4 },
});
