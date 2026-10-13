import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/useTheme';

/**
 * Empty state.
 *
 * Shows the FIRST ACTION rather than an illustration and "nothing here yet".
 * For a family app this doubles as onboarding, so it should be actionable rather
 * than decorative.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: React.ComponentProps<typeof Icon>['name'];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.centered, { gap: theme.spacing.md, paddingVertical: theme.spacing.xxl }]}>
      {icon ? <Icon name={icon} size={28} tone="faint" /> : null}
      <Text variant="title" style={styles.centeredText}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="muted" style={styles.centeredText}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        // Tertiary: the empty state sits directly on the sage canvas, where the
        // white outlined pill reads and the sage secondary would blend in.
        <Button label={actionLabel} variant="tertiary" onPress={onAction} />
      ) : null}
    </View>
  );
}

/**
 * First-load spinner.
 *
 * Only for the very first load. Later refreshes keep showing stale data with a
 * pull-to-refresh indicator, because blanking a list the user is reading is
 * worse than showing slightly stale rows.
 */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[styles.centered, { gap: theme.spacing.md, paddingVertical: theme.spacing.xxl }]}
    >
      <ActivityIndicator color={theme.colors.text} />
      <Text variant="label" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/** Inline, non-blocking failure with a retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.centered, { gap: theme.spacing.md, paddingVertical: theme.spacing.xl }]}>
      <Text variant="body" tone="negative" style={styles.centeredText}>
        {message}
      </Text>
      {onRetry ? <Button label="Try again" variant="tertiary" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  centeredText: { textAlign: 'center' },
});
