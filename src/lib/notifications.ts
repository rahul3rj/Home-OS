/**
 * Device-side notifications. No database column: the events themselves (SOS
 * alerts) already live in Postgres, and each phone only remembers which ones
 * it has seen — a small id list in the synchronous device store.
 */

import Constants from 'expo-constants';
import { useEffect } from 'react';

import { fetchActiveSos } from '@/features/maps/api';
import { fetchOpenDeadlines } from '@/features/tasks/api';
import { useHousehold } from '@/lib/household';
import { useQuery } from '@/lib/hooks';
import { useAuth } from '@/lib/session';
import { getStored, setStored } from '@/lib/storage';

const SEEN_KEY = 'home-os.notifications.seen-sos';
const MAX_KEPT = 100;

export type DeviceNotificationsModule = typeof import('expo-notifications');

/**
 * Whether this build can put anything in the status bar. Expo Go ships
 * without the notification native side (removed in SDK 53), so there
 * deadlines save but never ping — a dev build is the fix, not a setting.
 * Synchronous and native-free, so any screen can ask it for honest copy.
 */
export function canPingThisDevice(): boolean {
  return Constants.appOwnership !== 'expo';
}

let cachedModule: DeviceNotificationsModule | null | undefined;

/**
 * The notification library, loaded lazily and never statically imported: its
 * native side was removed from Expo Go in SDK 53 and merely loading it throws
 * there. (A try/catch around the require is not enough — Metro hoists the
 * require out of it at bundle time.) Null means "this build cannot ping".
 */
export function loadDeviceNotifications(): DeviceNotificationsModule | null {
  if (cachedModule !== undefined) return cachedModule;
  // Expo Go has no native side — don't even attempt the load.
  if (Constants.appOwnership === 'expo') {
    cachedModule = null;
    return cachedModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('expo-notifications') as DeviceNotificationsModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/**
 * Fire a status-bar notification right now. Silently a no-op where the
 * module is absent (Expo Go). Never throws.
 */
export async function notifyNow(title: string, body: string): Promise<void> {
  const Notifications = loadDeviceNotifications();
  if (!Notifications) return;
  try {
    const current = await Notifications.getPermissionsAsync();
    const granted =
      current.granted ||
      (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // A missed ping is not worth failing anything over.
  }
}

/** Ids of SOS alerts already opened on this device. Never throws. */
export function getSeenSosIds(): string[] {
  try {
    const raw = getStored(SEEN_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

/** Remember alert ids as seen on this device. Never throws. */
export function markSosSeen(ids: string[]): void {
  const merged = Array.from(new Set([...ids, ...getSeenSosIds()])).slice(0, MAX_KEPT);
  try {
    setStored(SEEN_KEY, JSON.stringify(merged));
  } catch {
    // A full store just resets seen-state; the list rebuilds itself.
  }
}

/**
 * Active SOS alerts from other members that this device hasn't seen.
 * Polls lightly so the bell dot appears without opening any screen.
 */
export function useUnreadSosCount(): number {
  const { user } = useAuth();
  const { household } = useHousehold();
  const householdId = household?.id ?? null;

  const query = useQuery(async () => {
    if (!householdId) return [];
    return fetchActiveSos(householdId);
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    const timer = setInterval(() => {
      void query.refetch();
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  const seen = new Set(getSeenSosIds());
  return (query.data ?? []).filter(
    (alert) => alert.triggered_by !== user?.id && !seen.has(alert.id),
  ).length;
}

/**
 * Overdue deadlines nobody has ticked off — the deadline half of the bell
 * dot. Polls at a minute: overdue is minute-granular, and the SOS half
 * already polls hot at fifteen seconds. Resolves itself: finishing the task
 * drops it from the query, no seen-state needed.
 */
export function useOverdueDeadlineCount(): number {
  const { household } = useHousehold();
  const householdId = household?.id ?? null;

  const query = useQuery(async () => {
    if (!householdId) return { overdue: [], upcoming: [] };
    return fetchOpenDeadlines(householdId);
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    const timer = setInterval(() => {
      void query.refetch();
    }, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  return query.data?.overdue.length ?? 0;
}
