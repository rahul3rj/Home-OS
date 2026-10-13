import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ErrorState, HomeSkeleton, Screen } from '@/components/ui';
import { useHousehold } from '@/lib/household';
import { useOnboardingProgress } from '@/lib/onboarding-progress';
import { useAuth } from '@/lib/session';

/**
 * Redirector, and the stack's anchor.
 *
 * `Stack.Protected` has no `redirectTo` on SDK 57, so a denied guard lands here.
 * From here we send people to whichever step they still owe. Keeping the
 * decision in one place means the guard itself only has to answer one question.
 */
export default function Index() {
  const { status: authStatus } = useAuth();
  const { status: householdStatus, profile, error: householdError, refresh } = useHousehold();
  const { inviteSeen } = useOnboardingProgress();

  if (authStatus === 'loading' || householdStatus === 'loading') {
    return <HomeSkeleton />;
  }

  // Signed in but the household failed to load (offline, hiccup): stay here
  // with a retry. Falling through to /onboarding would look exactly like being
  // signed out and ask for the invite code + login all over again.
  if (authStatus === 'signed-in' && householdStatus === 'error') {
    return (
      <Screen contentStyle={styles.center}>
        <ErrorState
          message={householdError ?? 'Could not load your home.'}
          onRetry={() => void refresh()}
        />
      </Screen>
    );
  }

  const settled = authStatus === 'signed-in' && householdStatus === 'ready';

  // Signed in, with a home, a finished profile, and the invite step behind
  // them: straight to the app.
  if (settled && profile?.is_set_up !== false && inviteSeen) {
    return <Redirect href="/(tabs)" />;
  }

  // Fresh sign-ups land here with a household but the invite step still owed.
  if (settled && profile?.is_set_up !== false && !inviteSeen) {
    return <Redirect href="/invite" />;
  }

  // Signed in but no finished profile — step 1 (account) is still owed.
  if (authStatus === 'signed-in' && profile?.is_set_up === false) {
    return <Redirect href="/onboarding" />;
  }

  // Signed in and set up but homeless — step 2 (home choice) is still owed.
  // That covers second devices and invites that were never applied.
  if (authStatus === 'signed-in') {
    return <Redirect href="/profile" />;
  }

  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
