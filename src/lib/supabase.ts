import 'expo-sqlite/localStorage/install';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * Supabase client.
 *
 * Session persistence is AsyncStorage on native (reliable across reloads and
 * restarts — the documented Supabase/Expo setup) and the browser's own
 * localStorage on web. `expo-sqlite/localStorage/install` above still provides
 * the synchronous `localStorage` that `src/lib/storage.ts` needs for
 * first-paint reads (theme, onboarding flags), but the auth session no longer
 * depends on it: losing the session meant losing the login on every reload.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** True once `.env` has real values. Drives the "not configured yet" UI state. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabasePublishableKey.includes('your_key_here'),
);

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set. ' +
      'Copy .env.example to .env and fill in your project values. See docs/SETUP.md.',
  );
}

/**
 * Storage adapter. AsyncStorage on native (async getItem/setItem/removeItem is
 * fully supported by supabase-js); the real localStorage on web. The sqlite
 * polyfill import above is intentionally NOT used here.
 */
const storage = Platform.OS === 'web' ? globalThis.localStorage : AsyncStorage;

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabasePublishableKey ?? 'sb_publishable_placeholder',
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      // Android and iOS have no URL to read a session from.
      detectSessionInUrl: false,
    },
  },
);

/**
 * Keep the token fresh only while the app is in the foreground. Supabase's own
 * reference recommends tying the refresh loop to app state; leaving it running
 * in the background burns battery and races with the OS suspending the app.
 */
if (isSupabaseConfigured && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

/** Turn a PostgREST error into something a family member can read. */
export function readableError(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return 'Something went wrong. Please try again.';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : 'Something went wrong. Please try again.';
}
