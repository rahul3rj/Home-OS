import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from 'expo-router';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform } from 'react-native';

import { getStored, setStored } from '@/lib/storage';
import { darkTheme, lightTheme, type Theme, type ThemeName } from '@/theme/tokens';

const THEME_KEY = 'home-os.theme';

/**
 * Read the persisted preference synchronously so the first paint is already
 * correct. Defaults to light when unset or unreadable — the product decision is
 * that the app opens light unless the user says otherwise, so this never follows
 * the OS setting.
 */
function readInitialTheme(): ThemeName {
  return getStored(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export const ThemeContext = createContext<{
  theme: Theme;
  preference: ThemeName;
  setPreference: (next: ThemeName) => void;
}>({
  theme: lightTheme,
  preference: 'light',
  setPreference: () => {},
});

/**
 * Map our design tokens onto the navigation theme so headers, tab bars and the
 * swipe-back overlay follow the app's palette instead of the framework default.
 * Fonts are carried over untouched — the type scale lives in our tokens.
 */
function navThemeFor(theme: Theme) {
  const base = theme.name === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.name === 'dark',
    colors: {
      ...base.colors,
      // Lime is the brand's CTA colour, so it is also what a selected tab or an
      // active control reports as `primary` to native navigation.
      primary: theme.colors.primary,
      background: theme.colors.canvas,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.hairline,
      notification: theme.colors.negative,
    },
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initialiser: runs once, synchronously, before first paint.
  const [preference, setPreferenceState] = useState<ThemeName>(readInitialTheme);

  const setPreference = useCallback((next: ThemeName) => {
    setPreferenceState(next);
    setStored(THEME_KEY, next);
  }, []);

  const theme = preference === 'dark' ? darkTheme : lightTheme;

  // Native chrome is not a React component, so it has to be told separately.
  // Without this the status bar, Android nav bar and native pickers stay light.
  //
  // `Appearance.setColorScheme` is a native-only API and does not exist on
  // react-native-web, where calling it throws and takes the whole tree down with
  // it. Guard on platform, and check the function actually exists rather than
  // trusting the platform check alone.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Appearance.setColorScheme?.(preference);
  }, [preference]);

  const navTheme = useMemo(() => navThemeFor(theme), [theme]);

  const value = useMemo(
    () => ({ theme, preference, setPreference }),
    [theme, preference, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <NavThemeProvider value={navTheme}>{children}</NavThemeProvider>
    </ThemeContext.Provider>
  );
}
