/**
 * Deadline pings, kept on this device.
 *
 * A deadline lives in Postgres (`tasks.due_at`); the scheduled ping lives in
 * the OS notification tray, and the link between them (task id → system
 * notification id) lives in the synchronous device store. No server push, no
 * new columns — the ping fires on the phone that set it.
 *
 * The library is never statically imported AND never required inside Expo
 * Go: its native side was removed in SDK 53 and merely loading it throws.
 * (A try/catch around the require is not enough — Metro hoists the require
 * out of it at bundle time.) Here a missing module just means "deadlines
 * save, but this build cannot ping" — a dev build
 * (`eas build --profile development`) gets the real pings.
 */

import { Platform } from 'react-native';

import { loadDeviceNotifications, type DeviceNotificationsModule } from '@/lib/notifications';
import { getStored, setStored } from '@/lib/storage';

const CHANNEL_ID = 'task-deadlines';
const MAP_KEY = 'home-os.task-reminders';
const MAX_KEPT = 50;

let configured = false;

function loadNotifications(): DeviceNotificationsModule | null {
  return loadDeviceNotifications();
}

/** Foreground banners + a high-importance Android channel. Idempotent. */
export function setupTaskReminders(): void {
  if (configured) return;
  configured = true;
  const Notifications = loadNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Task deadlines',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {
      // A missing channel still delivers — just without heads-up.
    });
  }
}

function readMap(): Record<string, string> {
  try {
    const raw = getStored(MAP_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>): void {
  try {
    setStored(MAP_KEY, JSON.stringify(map));
  } catch {
    // A full store just drops old links; worst case is a stale ping.
  }
}

/** True when the OS will actually deliver a scheduled ping. */
export async function ensureReminderPermission(): Promise<boolean> {
  const Notifications = loadNotifications();
  if (!Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Reconcile the ping for one task: drop any previous schedule, then — only
 * for a future deadline with permission granted — schedule and remember it.
 * Never throws; a missed ping is not worth failing a save over.
 */
export async function syncTaskReminder(args: {
  taskId: string;
  title: string;
  dueAt: string | null;
}): Promise<void> {
  await cancelTaskReminder(args.taskId);
  if (!args.dueAt) return;
  const when = new Date(args.dueAt).getTime();
  if (Number.isNaN(when) || when <= Date.now()) return;
  if (!(await ensureReminderPermission())) return;
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: 'Task due', body: args.title },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(when) },
    });
    const map = readMap();
    map[args.taskId] = id;
    writeMap(Object.fromEntries(Object.entries(map).slice(-MAX_KEPT)) as Record<string, string>);
  } catch {
    // Validated above; a miss just means no ping.
  }
}

/**
 * Fire a status-bar notification right now (SOS confirmation). Same rule as
 * everything here: silently a no-op where the module is absent (Expo Go).
 * Never throws.
 */
export async function notifyNow(title: string, body: string): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    if (!(await ensureReminderPermission())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // A missed ping is not worth failing anything over.
  }
}

/** Drop the scheduled ping for a task, if any. Never throws. */
export async function cancelTaskReminder(taskId: string): Promise<void> {
  const map = readMap();
  const id = map[taskId];
  if (!id) return;
  delete map[taskId];
  writeMap(map);
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or gone — nothing to cancel.
  }
}
