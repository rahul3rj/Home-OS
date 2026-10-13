import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/useTheme';

type Props = {
  children: ReactNode;
  /** Renders inside a ScrollView. Turn off for FlatList screens. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  /** Extra bottom padding, e.g. to clear a floating action button. */
  bottomInset?: number;
} & Omit<ScrollViewProps, 'children' | 'contentContainerStyle'>;

/**
 * The one top gap for the whole app: status inset + xxl, exactly Home's hero
 * gap. Home's panel, every Screen, and the stuck settings button all read it
 * from here, so the pages cannot drift apart again.
 */
export function usePageTop(): number {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return insets.top + theme.spacing.xxl;
}

/**
 * Themed page shell.
 *
 * Native tabs already apply the bottom inset for the tab bar, so this only pads
 * the top for the status bar / notch. Over-padding here is what pushes content
 * under the tab bar on some devices.
 */
export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
  bottomInset = 0,
  ...rest
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pageTop = usePageTop();

  const padding = {
    paddingTop: pageTop,
    paddingLeft: insets.left + theme.spacing.lg,
    paddingRight: insets.right + theme.spacing.lg,
    paddingBottom: theme.spacing.xl + bottomInset,
  };

  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: theme.colors.canvas }, padding, contentStyle]}>
        {children}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        // Without this a ScrollView's content can lay out wider than the
        // viewport on web, and long labels run off the right edge.
        style={styles.viewport}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={theme.colors.textMuted}
            />
          ) : undefined
        }
        {...rest}
      >
        <View style={[styles.content, padding, contentStyle]}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = {
  content: { flexGrow: 1, width: '100%', maxWidth: '100%' },
  // DESIGN.md marketing container centres at ~1200px. Phones are far narrower
  // so this only takes effect on web / tablets, where full-bleed rows would
  // otherwise stretch past a readable measure.
  viewport: { width: '100%', maxWidth: 1200, alignSelf: 'center' },
} satisfies Record<string, ViewStyle>;

/** Vertical rhythm between blocks. */
export function Stack({
  children,
  gap = 'lg',
  style,
}: {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return <View style={[{ gap: theme.spacing[gap] }, style]}>{children}</View>;
}
