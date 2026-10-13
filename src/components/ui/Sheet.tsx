import { useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/useTheme';

/**
 * Bottom sheet for add and edit.
 *
 * Preferred over a full-screen modal for two reasons: it is reachable with a
 * thumb, and it keeps the list behind it visible so the user can see what they
 * are adding to. Swiping down dismisses.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Lazy initialised rather than useRef: the Animated.Value is created exactly
  // once, and nothing touches a ref during render.
  const [slide] = useState(() => new Animated.Value(0));
  const screenHeight = Dimensions.get('window').height;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [screenHeight * 0.4, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // iOS needs this for VoiceOver to treat the sheet as its own context.
      accessibilityViewIsModal
    >
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingBottom: insets.bottom + theme.spacing.lg,
              maxHeight: screenHeight * 0.9,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.colors.hairline }]} />

          <View style={[styles.header, { paddingHorizontal: theme.spacing.xl }]}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            <IconButton
              icon={<Icon name="X" size={22} tone="muted" />}
              label="Close"
              onPress={onClose}
            />
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: theme.spacing.xl,
                paddingBottom: theme.spacing.xl,
                gap: theme.spacing.xl,
              }}
            >
              {children}
            </ScrollView>

            {footer ? (
              <View
                style={[
                  styles.footer,
                  {
                    paddingHorizontal: theme.spacing.xl,
                    paddingTop: theme.spacing.md,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.hairline,
                  },
                ]}
              >
                {footer}
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Confirm dialog.
 *
 * Reserved for irreversible, consequential actions — deleting money records.
 * Everything reversible gets an undo toast instead (see DESIGN.md).
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  pending,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.centered}>
        <Pressable
          style={styles.scrim}
          onPress={onCancel}
          accessibilityLabel="Cancel"
          accessibilityRole="button"
        />
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.xl,
              padding: theme.spacing.xl,
              gap: theme.spacing.md,
              ...theme.shadow.raised,
            },
          ]}
        >
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {message ? (
            <Text variant="body" tone="muted">
              {message}
            </Text>
          ) : null}
          <View style={[styles.dialogActions, { marginTop: theme.spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              style={[
                styles.dialogButton,
                {
                  borderRadius: theme.radius.xl,
                  borderWidth: 1,
                  borderColor: theme.colors.text,
                },
              ]}
            >
              <Text variant="label" tone="default">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ busy: Boolean(pending), disabled: Boolean(pending) }}
              disabled={pending}
              onPress={onConfirm}
              style={[
                styles.dialogButton,
                {
                  borderRadius: theme.radius.xl,
                  // Lime CTA by default, semantic red only when it destroys.
                  backgroundColor: destructive ? theme.colors.negative : theme.colors.primary,
                  opacity: pending ? 0.5 : 1,
                },
              ]}
            >
              <Text
                variant="label"
                style={{ color: destructive ? theme.colors.surface : theme.colors.onPrimary }}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  centered: { flex: 1, justifyContent: 'center', padding: 24 },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,17,14,0.45)',
  },
  sheet: { paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: {},
  dialog: { gap: 8 },
  dialogActions: { flexDirection: 'row', gap: 8 },
  dialogButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
