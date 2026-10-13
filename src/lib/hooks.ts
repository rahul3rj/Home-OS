import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data hooks.
 *
 * Deliberately not TanStack Query. This app has ten tables and a handful of
 * screens; a server-state library would add a shared dependency and a config
 * file — pure merge-conflict surface for the feature agents working in parallel
 * — for no benefit at this scale.
 *
 * What matters is that `useQuery` supports an optimistic local write, because
 * checking off a grocery must feel instant (see plan.md §4.4).
 */

export type QueryState<T> = {
  data: T | null;
  error: string | null;
  /** True only on the first load. Later refreshes keep showing stale data. */
  loading: boolean;
  /** True while a background refetch runs with data already on screen. */
  refreshing: boolean;
  refetch: () => Promise<void>;
  /** Replace local state without a round trip. Used by optimistic updates. */
  setData: (updater: T | null | ((current: T | null) => T | null)) => void;
};

/**
 * Run `fetcher` on mount and whenever `deps` change.
 *
 * `fetcher` receives an `isStale` flag so it can skip work when the user is
 * happy with what is already on screen.
 */
export function useQuery<T>(
  fetcher: (signal: { stale: boolean }) => Promise<T>,
  deps: readonly unknown[],
): QueryState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const hasLoaded = useRef(false);
  const mounted = useRef(true);
  // Keep the latest fetcher without making it a dependency, so an inline arrow
  // function does not re-trigger the effect on every render. Written in an
  // effect rather than during render: React Compiler forbids touching refs while
  // rendering, and this effect is declared before the fetch effect below, so the
  // ref is always populated by the time a fetch runs.
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (force: boolean) => {
    const stale = !force && hasLoaded.current;

    if (!stale) {
      if (hasLoaded.current) setRefreshing(true);
      else setLoading(true);
    }

    try {
      const result = await fetcherRef.current({ stale });
      if (!mounted.current) return;
      setDataState(result);
      setError(null);
      hasLoaded.current = true;
    } catch (cause) {
      if (!mounted.current) return;
      // A failed background refetch should not blow away good data.
      if (!hasLoaded.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load this.');
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((updater: T | null | ((current: T | null) => T | null)) => {
    setDataState((current) =>
      typeof updater === 'function' ? (updater as (c: T | null) => T | null)(current) : updater,
    );
  }, []);

  const refetch = useCallback(() => run(true), [run]);

  return { data, error, loading, refreshing, refetch, setData };
}

export type MutationState = {
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
  pending: boolean;
  error: string | null;
  clearError: () => void;
};

/**
 * Wrap a write so every caller gets pending state and a readable error without
 * repeating the same try/catch in six screens.
 *
 * Also guards against non-throwing failures: a resolved `{ ok: false }`
 * (AuthResult style, with its `message`) or a resolved `false` is treated as
 * failure. Previously only thrown errors surfaced, so forgetting to re-throw
 * read as success.
 */
export function useMutation(): MutationState {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (
        typeof result === 'object' &&
        result !== null &&
        'ok' in result &&
        (result as { ok: unknown }).ok === false
      ) {
        const message = (result as { message?: unknown }).message;
        throw new Error(typeof message === 'string' && message ? message : 'That did not work.');
      }
      if (result === false) {
        throw new Error('That did not work.');
      }
      if (mounted.current) setError(null);
      return true;
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'That did not work.');
      }
      return false;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}

/**
 * An undo toast.
 *
 * Destructive actions get a ~4s window to take it back rather than a
 * confirmation dialog, which is what people dismiss without reading.
 */
export function useUndo(timeoutMs = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMessage(null);
  }, []);

  const show = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      timer.current = setTimeout(() => setMessage(null), timeoutMs);
    },
    [timeoutMs],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { message, show, clear };
}
