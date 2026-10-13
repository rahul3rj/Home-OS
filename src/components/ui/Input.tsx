import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
};

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, hint, style, ...rest },
  ref,
) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      {label ? (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      ) : null}

      <TextInput
        ref={ref}
        accessibilityLabel={label ?? rest.placeholder}
        placeholderTextColor={theme.colors.textFaint}
        style={[
          styles.input,
          theme.type.body,
          {
            minHeight: HIT_SIZE,
            // `{text-input}`: a white field with a 1px ink hairline. The brand
            // prefers a visible outline over a soft shadow on form controls.
            borderRadius: theme.radius.md,
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.negative : theme.colors.text,
          },
          style,
        ]}
        {...rest}
      />

      {error ? (
        <Text variant="caption" tone="negative">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/** A search field. Clears itself and returns `search` from the keyboard. */
export const SearchInput = forwardRef<TextInput, Props>(function SearchInput(props, ref) {
  return <Input ref={ref} clearButtonMode="while-editing" returnKeyType="search" {...props} />;
});

/**
 * Square icon-only button, sized to HIT_SIZE.
 *
 * `label` must describe the action, not the shape — "Add milk", not "plus icon".
 */
export function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  iconButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
