import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { isSupabaseConfigured, readableError, supabase } from '@/lib/supabase';

type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

type AuthValue = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  /** Set when the app has no .env yet, so the UI can explain instead of failing. */
  error: string | null;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthValue>({
  status: 'loading',
  user: null,
  session: null,
  error: null,
  signOut: async () => {},
  clearError: () => {},
});

const NOT_CONFIGURED =
  'Home Os is not connected yet. Add your Supabase values to .env — see docs/SETUP.md.';

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seeded from whether .env has real values. Doing this in the initial state
  // rather than in the effect means the unconfigured case never calls setState
  // during an effect, and the UI shows setup instructions instead of spinning.
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    isSupabaseConfigured ? 'loading' : 'signed-out',
  );
  const [error, setError] = useState<string | null>(() =>
    isSupabaseConfigured ? null : NOT_CONFIGURED,
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setStatus(data.session ? 'signed-in' : 'signed-out');
      })
      .catch((cause) => {
        if (!active) return;
        setStatus('signed-out');
        setError(readableError(cause) ?? 'Could not restore your session.');
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? 'signed-in' : 'signed-out');
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setStatus('signed-out');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      error,
      signOut,
      clearError,
    }),
    [status, session, error, signOut, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return use(AuthContext);
}
