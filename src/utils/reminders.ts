import type {
  HydrationRecord,
  MealCategory,
  MealRecord,
  UserPreferences,
} from '../types/pulse';
import { toLocalDateKey, toLocalTimeInput } from './metrics';

export type ReminderSlotId = MealCategory | 'hydration';

export interface ActiveReminderItem {
  id: ReminderSlotId;
  kind: 'meal' | 'hydration';
  category?: MealCategory;
  label: string;
  scheduledTime: string;
  description: string;
  isDue: boolean;
  isCompletedToday: boolean;
  isDismissedToday: boolean;
}

export type BrowserNotificationSupport =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export function getBrowserNotificationStatus(): BrowserNotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export function getLocalTimezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local device time';
  } catch {
    return 'Local device time';
  }
}

export function computeTodayReminders(
  preferences: UserPreferences,
  meals: MealRecord[],
  hydrationLogs: HydrationRecord[],
  now = new Date()
): {
  dueReminders: ActiveReminderItem[];
  allSlots: ActiveReminderItem[];
  dismissedCountToday: number;
} {
  const todayKey = toLocalDateKey(now);
  const nowTime = toLocalTimeInput(now);
  const todayMeals = meals.filter((m) => toLocalDateKey(m.timestamp) === todayKey);
  const dismissedToday = preferences.dismissedReminders?.[todayKey] ?? [];

  const mealSlots: { id: MealCategory; label: string; desc: string }[] = [
    { id: 'breakfast', label: 'Breakfast', desc: 'Morning nourishment supports steady focus and movement.' },
    { id: 'lunch', label: 'Lunch', desc: 'Midday refueling helps sustain afternoon energy.' },
    { id: 'dinner', label: 'Dinner', desc: 'Evening nourishment supports recovery and rest.' },
    { id: 'snack', label: 'Snack', desc: 'Optional light fuel when hunger cues arise between meals.' },
  ];

  const allSlots: ActiveReminderItem[] = [];

  for (const slot of mealSlots) {
    const enabled = preferences.mealRemindersEnabled && (preferences.mealReminderEnabledMap?.[slot.id] ?? true);
    const scheduledTime = preferences.mealReminderTimes?.[slot.id] || (slot.id === 'snack' ? '15:30' : '12:00');
    const isCompletedToday = todayMeals.some((m) => m.category === slot.id);
    const isDismissedToday = dismissedToday.includes(slot.id);
    const isDue = enabled && !isCompletedToday && !isDismissedToday && nowTime >= scheduledTime;

    if (enabled) {
      allSlots.push({
        id: slot.id,
        kind: 'meal',
        category: slot.id,
        label: slot.label,
        scheduledTime,
        description: slot.desc,
        isDue,
        isCompletedToday,
        isDismissedToday,
      });
    }
  }

  if (preferences.mealRemindersEnabled && preferences.hydrationRemindersEnabled) {
    const todayHydration = hydrationLogs
      .filter((h) => toLocalDateKey(h.timestamp) === todayKey)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const totalMl = todayHydration.reduce((sum, h) => sum + h.amountMl, 0);
    const goalReached = preferences.dailyHydrationGoalMl > 0 && totalMl >= preferences.dailyHydrationGoalMl;
    const isDismissedToday = dismissedToday.includes('hydration');
    const startT = preferences.hydrationReminderStartTime || '09:00';
    const endT = preferences.hydrationReminderEndTime || '20:00';
    const intervalMin = Math.max(30, preferences.hydrationReminderIntervalMinutes || 120);

    let elapsedSinceLastOk = false;
    if (todayHydration.length === 0) {
      elapsedSinceLastOk = nowTime >= startT;
    } else {
      const lastMs = new Date(todayHydration[0].timestamp).getTime();
      elapsedSinceLastOk = (now.getTime() - lastMs) / 60000 >= intervalMin;
    }

    const inWindow = nowTime >= startT && nowTime <= endT;
    const isDue = !goalReached && !isDismissedToday && inWindow && elapsedSinceLastOk;

    allSlots.push({
      id: 'hydration',
      kind: 'hydration',
      label: 'Hydration Check-In',
      scheduledTime: `Every ${intervalMin} min`,
      description: 'Sip water regularly to support circulation and recovery.',
      isDue,
      isCompletedToday: goalReached,
      isDismissedToday,
    });
  }

  const dueReminders = allSlots.filter((item) => item.isDue);
  const dismissedCountToday = allSlots.filter((item) => item.isDismissedToday && !item.isCompletedToday).length;

  return { dueReminders, allSlots, dismissedCountToday };
}

const SENT_STORAGE_PREFIX = 'pulse_sent_notifications_';

export function getSentNotificationKeys(dateKey: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(`${SENT_STORAGE_PREFIX}${dateKey}`);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function markNotificationSent(dateKey: string, slotKey: string, signature: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getSentNotificationKeys(dateKey);
    current[slotKey] = signature;
    window.localStorage.setItem(`${SENT_STORAGE_PREFIX}${dateKey}`, JSON.stringify(current));
  } catch {
    // Ignore storage quota errors
  }
}

export function dispatchBrowserNotification(
  title: string,
  body: string,
  tag: string
): { ok: true } | { ok: false; error: string } {
  const status = getBrowserNotificationStatus();
  if (status === 'unsupported') {
    return {
      ok: false,
      error: 'Browser Notifications are not supported in this browser environment.',
    };
  }
  if (status === 'denied') {
    return {
      ok: false,
      error: 'Notification permission is blocked in browser settings. Enable notifications for this site to receive system alerts.',
    };
  }
  if (status !== 'granted') {
    return {
      ok: false,
      error: 'Notification permission has not been granted yet. Click Enable Browser Notifications first.',
    };
  }

  try {
    const notification = new window.Notification(title, {
      body,
      tag,
      renotify: false,
    } as NotificationOptions);
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore focus error
      }
      notification.close();
    };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Browser refused to show notification: ${err.message}`
          : 'The browser blocked notification delivery.',
    };
  }
}
