import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, UIManager, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Button,
  Card,
  Icon,
  Input,
  LoadingState,
  Screen,
  SegmentedControl,
  Stepper,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/lib/household';
import { useMutation } from '@/lib/hooks';
import { CODE_LENGTH, normaliseCode, ONBOARDING_STEPS } from '@/lib/onboarding';
import { useOnboardingProgress } from '@/lib/onboarding-progress';
import { useAuth } from '@/lib/session';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// Needed for the cross-fade when the join/create choice changes.
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type Mode = 'join' | 'create';

const OPTIONS: readonly { value: Mode; label: string }[] = [
  { value: 'join', label: 'Join a home' },
  { value: 'create', label: 'Create a home' },
];

/**
 * Step 2 of setup: join a home, or make one.
 *
 * The account already exists by the time anyone gets here, so the choice is
 * applied immediately — joining needs a signed-in user (the database's
 * security rules are keyed off it) and nothing has to be stored for later.
 *
 * Layout is a centred SaaS card: the three-step stepper, the lime mark, one
 * headline, one subline, the join/create switch, a single field, and the CTA.
 */
export default function ChooseHome() {
  const theme = useTheme();
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const { createHousehold, joinHousehold, error: householdError } = useHousehold();
  const { markInvitePending } = useOnboardingProgress();

  const [mode, setMode] = useState<Mode>('join');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const apply = useMutation();

  const busy = apply.pending;
  const visibleError = apply.error ?? householdError;

  if (authStatus === 'loading') {
    return (
      <Screen contentStyle={styles.centered}>
        <LoadingState label="Opening Home Os…" />
      </Screen>
    );
  }

  // No session means this screen was reached out of order — start at step 1.
  if (authStatus === 'signed-out') {
    return <Redirect href="/onboarding" />;
  }

  const canContinue =
    mode === 'create' ? name.trim().length > 0 : normaliseCode(code).length === CODE_LENGTH;

  function select(next: Mode) {
    if (next === mode) return;
    // Headline, subline and field swap out, so animate rather than snap.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(next);
  }

  async function continueToInvite() {
    if (!canContinue || busy) return;

    const applied = await apply.run(() =>
      mode === 'create' ? createHousehold(name.trim()) : joinHousehold(normaliseCode(code)),
    );

    // On failure the real database message stays on this screen — never push
    // to /invite without a household, which would bounce back here.
    if (!applied) return;

    // Household exists now, but the invite step is still owed — send them
    // there instead of letting the guard drop them into the tabs.
    markInvitePending();
    router.replace('/invite');
  }

  const isCreate = mode === 'create';

  return (
    <Screen>
      <View style={[styles.page, { gap: theme.spacing.xl }]}>
        <Stepper steps={ONBOARDING_STEPS} current={1} />

        {/* The home card: everything for step 2 lives in here. Rises in. */}
        <Animated.View entering={FadeInUp.duration(350).delay(60)}>
          <Card>
            <View
              style={[
                styles.mark,
                {
                  alignSelf: 'center',
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radius.xl,
                },
              ]}
            >
              <Icon name="House" size={26} tone="onPrimary" />
            </View>

            <Text variant="display" accessibilityRole="header" style={styles.center}>
              {isCreate ? 'Create your home' : 'Join your home'}
            </Text>
            <Text variant="body" tone="muted" style={styles.center}>
              {isCreate
                ? 'Name it — you will get a code to share.'
                : 'Enter the code your family shared with you.'}
            </Text>

            <SegmentedControl
              accessibilityLabel="Join a home or create one"
              value={mode}
              onChange={select}
              options={OPTIONS}
            />

            {isCreate ? (
              <Input
                label="Home name"
                placeholder="e.g. Sharma Home"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoFocus
                returnKeyType="next"
                onSubmitEditing={continueToInvite}
              />
            ) : (
              <Input
                label="Invite code"
                placeholder="e.g. K7M2QP"
                value={code}
                onChangeText={(next) => setCode(normaliseCode(next))}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={CODE_LENGTH}
                returnKeyType="next"
                onSubmitEditing={continueToInvite}
                style={styles.code}
              />
            )}

            {visibleError ? (
              <Text variant="caption" tone="negative">
                {visibleError}
              </Text>
            ) : null}

            <Button
              label="Continue"
              size="lg"
              fullWidth
              variant="primary"
              loading={busy}
              disabled={!canContinue}
              onPress={continueToInvite}
            />
          </Card>
        </Animated.View>

        <Text variant="caption" tone="faint" style={styles.center}>
          Next: share your code
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center' },
  centered: { flex: 1, justifyContent: 'center' },
  center: { textAlign: 'center' },

  mark: { width: HIT_SIZE, height: HIT_SIZE, alignItems: 'center', justifyContent: 'center' },

  // Wide, letter-spaced so a 6-character code is easy to read back and type.
  code: { letterSpacing: 4, fontWeight: '600' },
});
