/**
 * Synchronous key-value storage for small preferences.
 *
 * Uses `globalThis.localStorage` directly rather than a storage package:
 *  - On iOS/Android, `expo-sqlite/localStorage/install` (imported below, and
 *    again by the Supabase client) provides a synchronous implementation.
 *  - On web the browser already provides one.
 *
 * Sync matters: an async read resolves *after* first paint, which shows the user
 * a white flash followed by a colour flip when the theme is restored. This lets
 * the very first render already carry the right palette.
 *
 * Only the theme preference lives here. Anything large or queryable belongs in
 * Postgres, not on the device.
 */
import 'expo-sqlite/localStorage/install';

const memory = new Map<string, string>();

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let warned = false;

export function getStored(key: string): string | null {
  const backing = store();
  if (!backing) return memory.get(key) ?? null;

  try {
    return backing.getItem(key);
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn(`[storage] read failed for "${key}"`, error);
    }
    return memory.get(key) ?? null;
  }
}

export function setStored(key: string, value: string): void {
  memory.set(key, value);

  const backing = store();
  if (!backing) return;

  try {
    backing.setItem(key, value);
  } catch (error) {
    // A failed preference write is not worth interrupting the user over.
    console.warn(`[storage] write failed for "${key}"`, error);
  }
}
