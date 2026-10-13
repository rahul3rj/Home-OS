import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Icon,
  IconButton,
  LoadingState,
  Screen,
  Stepper,
  Text,
} from '@/components/ui';
import { useHousehold } from '@/lib/household';
import { ONBOARDING_STEPS } from '@/lib/onboarding';
import { useOnboardingProgress } from '@/lib/onboarding-progress';
import { useAuth } from '@/lib/session';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import * as Clipboard from 'expo-clipboard';

/**
 * Step 3 of sign-up: the invite code.
 *
 * Creators get the household code with copy + share so the family can join.
 * Joiners get a welcome — the code lives in Settings whenever they need it.
 * Either way, Continue closes the flow and the tabs open.
 */
export default function Invite() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { status, household, members } = useHousehold();
  const { markInviteSeen } = useOnboardingProgress();

  const [copied, setCopied] = useState(false);

  // Owners created the household; joiners arrived as members. The RPC assigns
  // exactly those roles, so this also tells us which variant to show.
  const isOwner = members.some((member) => member.user_id === user?.id && member.role === 'owner');

  if (status === 'loading') {
    return (
      <Screen contentStyle={styles.centered}>
        <LoadingState label="Getting your home ready…" />
      </Screen>
    );
  }

  // No household means this screen was reached out of order — start over.
  if (status !== 'ready' || !household) {
    return <Redirect href="/onboarding" />;
  }

  const homeName = household.name;
  const inviteCode = household.invite_code;

  async function copyCode() {
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareCode() {
    try {
      await Share.share({
        message: `Join ${homeName} on Home Os with code ${inviteCode}`,
      });
    } catch {
      // The user dismissed the share sheet. Nothing to report.
    }
  }

  function continueToApp() {
    markInviteSeen();
    router.replace('/');
  }

  return (
    <Screen>
      <View style={[styles.page, { gap: theme.spacing.xl }]}>
        <Stepper steps={ONBOARDING_STEPS} current={2} />

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
            <Icon name="Users" size={26} tone="onPrimary" />
          </View>

          <Text variant="display" accessibilityRole="header" style={styles.center}>
            {isOwner ? 'Share your code' : "You're in!"}
          </Text>
          <Text variant="body" tone="muted" style={styles.center}>
            {isOwner ? 'Send the code below to bring everyone in.' : `Welcome to ${homeName}.`}
          </Text>

          {isOwner ? (
            <>
              <View
                style={[
                  styles.codeBox,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderRadius: theme.radius.xl,
                  },
                ]}
              >
                <Text variant="caption" tone="muted">
                  Invite code
                </Text>
                <View style={styles.codeRow}>
                  <Text
                    variant="display"
                    style={[styles.code, styles.flex]}
                    accessibilityLabel={`Invite code ${inviteCode}`}
                  >
                    {inviteCode}
                  </Text>
                  <IconButton
                    icon={
                      copied ? (
                        <Icon name="Check" size={22} tone="positive" />
                      ) : (
                        <Icon name="Copy" size={22} tone="muted" />
                      )
                    }
                    label={copied ? 'Copied' : 'Copy invite code'}
                    onPress={copyCode}
                  />
                </View>
                {copied ? (
                  <Text variant="caption" tone="positive">
                    Copied to clipboard
                  </Text>
                ) : null}
              </View>

              <Button
                label="Share the code"
                size="lg"
                fullWidth
                variant="primary"
                icon={<Icon name="Share" size={18} tone="onPrimary" />}
                onPress={shareCode}
              />
            </>
          ) : null}

          <Button
            label="Continue"
            size="lg"
            fullWidth
            variant={isOwner ? 'tertiary' : 'primary'}
            onPress={continueToApp}
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center' },
  centered: { flex: 1, justifyContent: 'center' },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  mark: { width: HIT_SIZE, height: HIT_SIZE, alignItems: 'center', justifyContent: 'center' },
  codeBox: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, gap: 4 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Wide, letter-spaced so a 6-character code is easy to read back and share.
  code: { letterSpacing: 4, textAlign: 'center' },
});
