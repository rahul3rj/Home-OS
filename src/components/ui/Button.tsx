import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
};

/** `{typography.button-md}` for the default sizes, one step down for `sm`. */
const SIZES: Record<ButtonSize, { height: number; padding: number; text: 'label' | 'bodyStrong' }> =
  {
    sm: { height: HIT_SIZE, padding: 20, text: 'label' },
    md: { height: HIT_SIZE, padding: 26, text: 'bodyStrong' },
    lg: { height: 56, padding: 32, text: 'bodyStrong' },
  };

/**
 * Primary action button.
 *
 * `primary` is the lime CTA pill from DESIGN.md — the brand's universal primary
 * action. Everything else is deliberately quieter: a white card-shaped
 * `secondary`, an ink-outlined `tertiary`, a borderless `ghost`, and a red
 * `danger` for destructive confirmation. Never two lime buttons side by side.
 *
 * Height comes from HIT_SIZE so every button clears both platforms' minimum
 * touch target without a separate accessibility pass. `hitSlop` is not used as
 * a substitute — it never extends past a parent's bounds.
 *
 * Press feedback is opacity only (0.85 while held). No scale transform: it
 * proved fragile across devices and could drop the pill background.
 */
export const Button = forwardRef<View, Props>(function Button(
  { label, variant = 'primary', size = 'md', loading, fullWidth, icon, disabled, style, ...rest },
  ref,
) {
  const theme = useTheme();
  const spec = SIZES[size];
  const isDisabled = disabled || loading;

  // DESIGN.md: primary is the lime CTA; secondary is the sage-tinted pill for
  // use on white cards; tertiary is the white pill with a 1px ink outline for
  // use directly on the sage canvas. Ghost stays borderless and transparent.
  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.colors.primary },
    secondary: { backgroundColor: theme.colors.canvas },
    tertiary: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.text,
    },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: theme.colors.negative },
  };

  // Lime and the white fills take ink; the red fill takes white.
  const ink =
    variant === 'primary'
      ? theme.colors.onPrimary
      : variant === 'danger'
        ? theme.colors.surface
        : theme.colors.text;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: spec.height,
          paddingHorizontal: spec.padding,
          // The brand's signature 24px pill-rectangle, never a sharp corner.
          borderRadius: theme.radius.xl,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
        },
        surface[variant],
        fullWidth && styles.fullWidth,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text variant={spec.text} style={{ color: ink }} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

/**
 * Round icon button from the Home hero — a lime (or ink) circle with an ink
 * (or near-white) glyph. Full 48px target, opacity-only press feedback.
 */
export function CircleButton({
  icon,
  label,
  hint,
  onPress,
  fill = 'ink',
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  fill?: 'ink' | 'lime';
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: HIT_SIZE,
          height: HIT_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.full,
          backgroundColor: fill === 'lime' ? theme.colors.primary : theme.colors.surfaceInverse,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Icon name={icon} size={20} tone={fill === 'lime' ? 'onPrimary' : 'inverse'} />
    </Pressable>
  );
}
