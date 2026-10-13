import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_900Black,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Image, ImageBackground, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HouseholdProvider, useHousehold } from '@/lib/household';
import { OnboardingProgressProvider, useOnboardingProgress } from '@/lib/onboarding-progress';
import { AuthProvider, useAuth } from '@/lib/session';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/useTheme';

/**
 * Root layout: providers plus the flow gate.
 *
 * The flow, in the order a person actually experiences it:
 *
 *   1. onboarding  — email, password, name. Creates the account (or signs in).
 *   2. profile     — join a home, or create one. Applied immediately: by now a
 *                    session always exists, which the database's security rules
 *                    require. No choice is ever stored for later.
 *   3. invite      — fresh sign-ups see the share code before the app.
 *   4. (tabs)      — the app.
 *
 * A signed-in person with no household lands on step 2 — that is the
 * "signed in on a second device" case.
 *
 * SDK 57 notes:
 *  - `Stack.Protected` has no `redirectTo`; that arrived in SDK 58. A denied
 *    guard falls back to the anchor route, so `src/app/index.tsx` is a
 *    redirector that sends people wherever they belong.
 *  - importing from `@react-navigation/*` is a hard bundler error in SDK 56+.
 */

// Keep the native splash (dark + logo) visible until fonts are ready.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 400, fade: true });

export default function RootLayout() {
  // DESIGN.md's display face is the proprietary Wise Sans; the documented
  // open-source substitute is Inter at 900, with Inter 600 for sub-display and
  // body. These bundle locally, so the first paint after load already has the
  // brand voice — no network fetch, works in Expo Go.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <HouseholdProvider>
              <OnboardingProgressProvider>
                {fontsLoaded ? <AppStack /> : <BootSplash />}
              </OnboardingProgressProvider>
            </HouseholdProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Gradient hold while the brand fonts load. Providers above still mount
 * and restore the session underneath, so auth state is ready when the stack
 * appears — this only avoids a system-font flash on the hero headlines.
 */
function BootSplash() {
  return (
    <ImageBackground
      source={require('../../assets/gradient.png')}
      style={styles.bootSplash}
      resizeMode="cover"
      accessibilityRole="image"
      accessibilityLabel="Home Os loading"
    >
      <View style={styles.bootLogoWrap}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.bootLogo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="Home Os logo"
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bootSplash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootLogo: {
    borderRadius: 28,
    height: 132,
    width: 132,
  },
});

function AppStack() {
  const theme = useTheme();
  const { status: authStatus } = useAuth();
  const { status: householdStatus, profile } = useHousehold();

  const signedIn = authStatus === 'signed-in';
  const hasHousehold = householdStatus === 'ready';
  // Existing accounts already have `is_set_up` true from when they signed up, so
  // this only ever gates a genuinely fresh account.
  const profileReady = profile?.is_set_up !== false;
  // Fresh sign-ups owe the invite step before the tabs; everyone else never sees it.
  const { inviteSeen } = useOnboardingProgress();

  const canUseApp = signedIn && hasHousehold && profileReady && inviteSeen;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.canvas },
        animation: Platform.OS === 'ios' ? 'default' : 'fade',
      }}
    >
      {/* Anchor. A denied guard lands on index, which redirects. */}
      <Stack.Protected guard={!canUseApp}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="invite" />
      </Stack.Protected>

      <Stack.Protected guard={canUseApp}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="edit-profile" />
      </Stack.Protected>

      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
