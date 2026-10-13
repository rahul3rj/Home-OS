/**
 * Email and password authentication.
 *
 * Replaces Google OAuth, which was a lot of moving parts — a Google Cloud
 * project, three client IDs, SHA-1 fingerprints, a config plugin — for an app
 * that is never sold and is only used by one family. Email and password is one
 * screen and no external setup at all.
 *
 * Supabase still owns the session and the security rules; this file is just the
 * four calls the app needs.
 */

import { isSupabaseConfigured, readableError, supabase } from '@/lib/supabase';

export type AuthFailure =
  | 'email-taken'
  | 'wrong-credentials'
  | 'weak-password'
  | 'invalid-email'
  | 'not-configured'
  | 'rate-limited'
  | 'unknown';

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure; message: string };

/**
 * Minimum password length Supabase accepts by default.
 *
 * Kept here rather than inline so the UI hint and the validation cannot drift.
 */
export const MIN_PASSWORD = 6;

/** Pragmatic upper bound: bcrypt silently truncates beyond 72 bytes. */
const MAX_PASSWORD = 72;

function validate(email: string, password: string): AuthResult | null {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      reason: 'not-configured',
      message: 'Home Os is not connected yet. Add your Supabase values to .env.',
    };
  }

  const trimmedEmail = email.trim();

  // Deliberately loose. A strict RFC check rejects valid addresses; Supabase
  // owns the real validation and returns a clear error if it is wrong.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return {
      ok: false,
      reason: 'invalid-email',
      message: 'That email address does not look right.',
    };
  }

  if (password.length < MIN_PASSWORD) {
    return {
      ok: false,
      reason: 'weak-password',
      message: `Use at least ${MIN_PASSWORD} characters.`,
    };
  }

  if (password.length > MAX_PASSWORD) {
    return {
      ok: false,
      reason: 'weak-password',
      message: `Use at most ${MAX_PASSWORD} characters.`,
    };
  }

  return null;
}

/**
 * Turn a Supabase auth error into something a parent can act on.
 *
 * The raw messages are developer-facing ("User already registered"), so they are
 * translated rather than shown verbatim.
 */
function classify(error: { message: string }): AuthResult {
  const message = error.message.toLowerCase();

  if (message.includes('already registered') || message.includes('already been registered')) {
    return {
      ok: false,
      reason: 'email-taken',
      message: 'That email already has an account. Sign in instead.',
    };
  }

  if (message.includes('invalid login')) {
    return {
      ok: false,
      reason: 'wrong-credentials',
      message: 'That email and password do not match.',
    };
  }

  if (message.includes('rate limit') || message.includes('too many')) {
    return {
      ok: false,
      reason: 'rate-limited',
      message: 'Too many attempts. Wait a minute and try again.',
    };
  }

  if (message.includes('password')) {
    return {
      ok: false,
      reason: 'weak-password',
      message: `Use at least ${MIN_PASSWORD} characters.`,
    };
  }

  if (message.includes('email')) {
    return {
      ok: false,
      reason: 'invalid-email',
      message: 'That email address does not look right.',
    };
  }

  return { ok: false, reason: 'unknown', message: readableError(error) ?? 'Something went wrong.' };
}

/**
 * Create an account.
 *
 * `options.data.display_name` seeds the profile so the person appears with a
 * sensible name before they finish setting up.
 *
 * Note: `emailRedirectTo` is left unset on purpose. Email confirmation requires
 * a working mail provider, and for a closed family app the code being known to
 * the person is the whole of the security model. See docs/SETUP.md if you ever
 * want to turn it on.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResult> {
  const invalid = validate(email, password);
  if (invalid) return invalid;

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: displayName ? { data: { full_name: displayName.trim() } } : undefined,
  });

  if (error) return classify(error);

  // Supabase returns a user with no session when email confirmation is enabled.
  // Detected here so the UI can explain rather than silently appearing to do
  // nothing.
  if (!data.session) {
    return {
      ok: false,
      reason: 'unknown',
      message: 'Check your email to finish creating the account.',
    };
  }

  return { ok: true };
}

/** Sign in with an existing account. */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const invalid = validate(email, password);
  if (invalid) return invalid;

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) return classify(error);
  return { ok: true };
}

/** Sign out. Safe to call when already signed out. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
