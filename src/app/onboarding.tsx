import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import {
  Avatar,
  Button,
  Card,
  Icon,
  Input,
  Screen,
  SectionHeader,
  SegmentedControl,
  Stack,
  Stepper,
  Text,
} from '@/components/ui';
import { MIN_PASSWORD, signInWithEmail, signUpWithEmail } from '@/lib/email-auth';
import { useHousehold } from '@/lib/household';
import { useMutation } from '@/lib/hooks';
import { ONBOARDING_STEPS } from '@/lib/onboarding';
import { HIT_SIZE, avatarTints } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Mode = 'signup' | 'signin';

/**
 * Step 1 of setup: the account.
 *
 * Email, password, name — then the home choice on the next screen. Both
 * sign-up and sign-in live here: a family member who set this up months ago
 * opens the app and gets straight back in instead of making a second account.
 *
 * Sign-up creates the session, saves the profile, and moves to the home
 * choice. Sign-in hands off to the index redirector, which knows whether a
 * home is still owed. No choice is stored here — the home step applies its own
 * decision immediately, because by then a session always exists.
 */
export default function Onboarding() {
  const theme = useTheme();
  const router = useRouter();
  const { updateProfile, error: householdError } = useHousehold();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const auth = useMutation();
  const apply = useMutation();

  const busy = auth.pending || apply.pending;
  const visibleError = formError ?? auth.error ?? apply.error ?? householdError;

  async function submit() {
    setFormError(null);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail) {
      setFormError('Enter your email address.');
      return;
    }
    if (password.length === 0) {
      setFormError('Enter your password.');
      return;
    }
    if (mode === 'signup' && !trimmedName) {
      setFormError('Tell your family your name.');
      return;
    }

    // Existing accounts skip profile setup entirely: their name and avatar are
    // already stored, and re-asking would be an annoyance every single login.
    if (mode === 'signin') {
      const signed = await auth.run(async () => {
        // signInWithEmail returns { ok: false } instead of throwing, so an
        // explicit throw is what makes useMutation report the failure.
        const result = await signInWithEmail(email, password);
        if (!result.ok) throw new Error(result.message);
      });
      if (!signed) return;

      // The index redirector decides from here: tabs when a home is ready,
      // the home choice when one is still owed.
      router.replace('/');
      return;
    }

    const created = await auth.run(async () => {
      const result = await signUpWithEmail(email, password, trimmedName);
      if (!result.ok) throw new Error(result.message);
    });
    if (!created) return;

    // The profile is saved first so the family roster never shows the part
    // before the @. Then the home choice on the next screen.
    const saved = await apply.run(() => updateProfile(trimmedName, avatarIndex));
    if (!saved) return;

    router.push('/profile');
  }

  return (
    <Screen>
      <View style={styles.centred}>
        <Stepper steps={ONBOARDING_STEPS} current={0} />

        {/* Brand moment: lime mark, then display 900. Rises in on mount. */}
        <Animated.View entering={FadeInUp.duration(350)} style={styles.hero}>
          <View
            style={[
              styles.mark,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.radius.xl,
              },
            ]}
          >
            <Icon name="User" size={26} tone="default" />
          </View>
          <View style={styles.flex}>
            <Stack gap="sm">
              <Text variant="display" accessibilityRole="header">
                {mode === 'signup' ? 'Create your account' : 'Welcome back'}
              </Text>
              <Text variant="body" tone="muted">
                {mode === 'signup'
                  ? 'This is how your family will know the app is yours.'
                  : 'Sign in to get back to your home.'}
              </Text>
            </Stack>
          </View>
        </Animated.View>

        <SegmentedControl
          accessibilityLabel="Create an account or sign in"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'signin', label: 'I have an account' },
            { value: 'signup', label: 'New here' },
          ]}
        />

        {/* Auth-form card: text inputs live on white, not bare on the canvas. */}
        <Animated.View entering={FadeInUp.duration(350).delay(90)}>
          <Card>
            <Stack gap="md">
              {mode === 'signup' ? (
                <>
                  <View style={styles.identity}>
                    <Avatar name={name || email || '?'} tintIndex={avatarIndex} size={64} />
                    <View style={styles.flex}>
                      <SectionHeader label="Your colour" />
                      <View style={styles.swatches}>
                        {avatarTints.map((tint, index) => (
                          <Pressable
                            key={tint}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: avatarIndex === index }}
                            accessibilityLabel={`Colour ${index + 1}`}
                            onPress={() => setAvatarIndex(index)}
                            style={[
                              styles.swatch,
                              {
                                backgroundColor: tint,
                                borderColor:
                                  avatarIndex === index ? theme.colors.text : 'transparent',
                              },
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  </View>

                  <Input
                    label="Your name"
                    placeholder="What should the family call you?"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoComplete="name"
                    returnKeyType="next"
                  />
                </>
              ) : null}

              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
              />

              <Input
                label="Password"
                placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : '••••••••'}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                returnKeyType="go"
                onSubmitEditing={submit}
              />

              {mode === 'signup' ? (
                <Text variant="caption" tone="faint">
                  Write it down somewhere safe. There is no reset email in this app.
                </Text>
              ) : null}
            </Stack>
          </Card>
        </Animated.View>

        {visibleError ? (
          <Card tone="negative">
            <View style={styles.errorRow}>
              <Icon name="CircleAlert" size={18} tone="inverse" />
              <Text variant="label" style={styles.flex}>
                {visibleError}
              </Text>
            </View>
          </Card>
        ) : null}

        <Animated.View entering={FadeInUp.duration(350).delay(180)}>
          <Button
            label={mode === 'signup' ? 'Create account' : 'Sign in'}
            size="lg"
            fullWidth
            variant="primary"
            loading={busy}
            disabled={
              email.trim().length === 0 ||
              password.length === 0 ||
              (mode === 'signup' && name.trim().length === 0)
            }
            onPress={submit}
          />
        </Animated.View>

        <Text variant="caption" tone="faint" style={styles.center}>
          Next: choose your home
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centred: { flex: 1, justifyContent: 'center', gap: 24 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: HIT_SIZE, height: HIT_SIZE, alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: {
    width: HIT_SIZE - 12,
    height: HIT_SIZE - 12,
    borderRadius: 999,
    borderWidth: 3,
  },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
