import { useContext } from 'react';

import { ThemeContext } from '@/theme/ThemeProvider';
import type { Theme } from '@/theme/tokens';

/**
 * The app's design tokens.
 *
 * Note this is NOT expo-router's `useTheme()` (which returns the navigation
 * theme). Import this one for colours, spacing, radius and type.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** The raw preference plus its setter, for the appearance toggle in Settings. */
export function useThemePreference() {
  const { preference, setPreference } = useContext(ThemeContext);
  return { preference, setPreference };
}

export type { Theme, ThemeName } from '@/theme/tokens';
