import { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellRing,
  CheckCircle2,
  Droplets,
  Info,
  ShieldAlert,
  Utensils,
} from 'lucide-react';
import type { MealCategory, UserPreferences } from '../types/pulse';
import {
  dispatchBrowserNotification,
  getBrowserNotificationStatus,
  getLocalTimezoneName,
  type BrowserNotificationSupport,
} from '../utils/reminders';

interface ReminderSettingsViewProps {
  preferences: UserPreferences;
  onBack: () => void;
  onSavePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

const MEAL_ROWS: { id: MealCategory; label: string; hint: string }[] = [
  { id: 'breakfast', label: 'Breakfast', hint: 'Morning meal check-in' },
  { id: 'lunch', label: 'Lunch', hint: 'Midday refueling check-in' },
  { id: 'dinner', label: 'Dinner', hint: 'Evening nourishment check-in' },
  { id: 'snack', label: 'Snack', hint: 'Afternoon or post-session snack check-in' },
];

export function ReminderSettingsView({
  preferences,
  onBack,
  onSavePreferences,
}: ReminderSettingsViewProps) {
  const [remindersEnabled, setRemindersEnabled] = useState(preferences.mealRemindersEnabled);
  const [enabledMap, setEnabledMap] = useState({ ...preferences.mealReminderEnabledMap });
  const [times, setTimes] = useState({ ...preferences.mealReminderTimes });
  const [hydrationEnabled, setHydrationEnabled] = useState(preferences.hydrationRemindersEnabled);
  const [hydrationInterval, setHydrationInterval] = useState(
    String(preferences.hydrationReminderIntervalMinutes || 120)
  );
  const [hydrationStart, setHydrationStart] = useState(preferences.hydrationReminderStartTime || '09:00');
  const [hydrationEnd, setHydrationEnd] = useState(preferences.hydrationReminderEndTime || '20:00');
  const [browserNotifsEnabled, setBrowserNotifsEnabled] = useState(preferences.browserNotificationsEnabled);

  const [permissionStatus, setPermissionStatus] = useState<BrowserNotificationSupport>(() =>
    getBrowserNotificationStatus()
  );
  const [previewSlot, setPreviewSlot] = useState<MealCategory | 'hydration'>('breakfast');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const timezoneName = getLocalTimezoneName();

  const requestNotificationPermission = async (): Promise<BrowserNotificationSupport> => {
    setTestResult(null);
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionStatus('unsupported');
      setBrowserNotifsEnabled(false);
      setTestResult({
        ok: false,
        message: 'Browser notifications are not supported in this browser environment.',
      });
      return 'unsupported';
    }

    try {
      const result = await window.Notification.requestPermission();
      setPermissionStatus(result);
      if (result === 'granted') {
        setBrowserNotifsEnabled(true);
        setTestResult({
          ok: true,
          message: 'Browser notification permission granted. Scheduled alerts can fire while this tab is open.',
        });
      } else if (result === 'denied') {
        setBrowserNotifsEnabled(false);
        setTestResult({
          ok: false,
          message:
            'Permission was denied by the browser or user. Notifications were NOT scheduled. Enable permissions in your browser site settings if you want OS popups.',
        });
      } else {
        setBrowserNotifsEnabled(false);
        setTestResult({
          ok: false,
          message: 'Permission prompt was dismissed without granting access.',
        });
      }
      return result;
    } catch (err) {
      setBrowserNotifsEnabled(false);
      setTestResult({
        ok: false,
        message:
          err instanceof Error
            ? `Failed to request permission: ${err.message}`
            : 'Unable to request notification permission.',
      });
      return getBrowserNotificationStatus();
    }
  };

  const handleToggleBrowserNotifications = async () => {
    if (browserNotifsEnabled) {
      setBrowserNotifsEnabled(false);
      setTestResult(null);
      return;
    }
    const status = getBrowserNotificationStatus();
    setPermissionStatus(status);
    if (status === 'granted') {
      setBrowserNotifsEnabled(true);
      setTestResult(null);
      return;
    }
    await requestNotificationPermission();
  };

  const getPreviewContent = () => {
    if (previewSlot === 'hydration') {
      return {
        title: 'PULSE · Hydration Check-In',
        body: `Scheduled every ${hydrationInterval} min (${hydrationStart}–${hydrationEnd}). Take a moment to sip water and log your intake.`,
        timeLabel: `Every ${hydrationInterval} min`,
      };
    }
    const labelMap: Record<MealCategory, string> = {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snack: 'Snack',
    };
    return {
      title: `PULSE · ${labelMap[previewSlot]} Rhythm`,
      body: `Steady nourishment fuels movement. Tap to log your ${labelMap[previewSlot].toLowerCase()} if you haven't already.`,
      timeLabel: times[previewSlot],
    };
  };

  const handleSendTestNotification = () => {
    const preview = getPreviewContent();
    const res = dispatchBrowserNotification(preview.title, preview.body, `pulse-preview-${previewSlot}`);
    if (res.ok) {
      setTestResult({
        ok: true,
        message: `System notification dispatched ("${preview.title}").`,
      });
    } else {
      setTestResult({
        ok: false,
        message: res.error,
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setSaveMessage('');

    const currentStatus = getBrowserNotificationStatus();
    setPermissionStatus(currentStatus);
    const effectiveBrowserNotifs = browserNotifsEnabled && currentStatus === 'granted';
    if (browserNotifsEnabled && currentStatus !== 'granted') {
      setBrowserNotifsEnabled(false);
    }

    setSaving(true);
    try {
      await onSavePreferences({
        mealRemindersEnabled: remindersEnabled,
        mealReminderEnabledMap: enabledMap,
        mealReminderTimes: times,
        hydrationRemindersEnabled: hydrationEnabled,
        hydrationReminderIntervalMinutes: Math.max(30, Math.min(480, Number(hydrationInterval) || 120)),
        hydrationReminderStartTime: hydrationStart,
        hydrationReminderEndTime: hydrationEnd,
        browserNotificationsEnabled: effectiveBrowserNotifs,
      });
      setSaveMessage('Reminder schedule and preferences saved.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save reminder settings.');
    } finally {
      setSaving(false);
    }
  };

  const preview = getPreviewContent();

  return (
    <div className="space-y-7 max-w-4xl">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-secondary-text)] hover:underline mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Wellness
          </button>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-[var(--text-main)]">
            Reminder Settings
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Configure gentle meal and hydration reminders in your local timezone ({timezoneName}).
          </p>
        </div>
      </header>

      {saveMessage && (
        <div className="flex items-center gap-2.5 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] px-4 py-3 text-sm text-[var(--text-main)]">
          <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2.5 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger-border)] px-4 py-3 text-sm text-[var(--danger-text)]">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Master Enable Switch */}
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-[var(--accent-secondary-text)] mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-display font-bold text-[var(--text-main)]">
                Enable Gentle Reminders
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Reminders automatically clear for the day as soon as a meal is logged, and never encourage skipping meals.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={remindersEnabled}
            onClick={() => setRemindersEnabled((v) => !v)}
            className={`h-10 px-4 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              remindersEnabled
                ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] border-[var(--accent-primary)]'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
            }`}
          >
            {remindersEnabled ? 'Reminders Enabled' : 'Reminders Paused'}
          </button>
        </section>

        {/* Individual Meal Schedules */}
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-[var(--accent-primary-text)]" />
            <h2 className="text-base font-display font-bold text-[var(--text-main)]">
              Daily Meal Schedule
            </h2>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {MEAL_ROWS.map((row) => {
              const rowEnabled = enabledMap[row.id];
              return (
                <div
                  key={row.id}
                  className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-main)]">{row.label}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{row.hint}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      aria-label={`${row.label} reminder time`}
                      disabled={!remindersEnabled || !rowEnabled}
                      value={times[row.id]}
                      onChange={(e) =>
                        setTimes((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      className="h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)] disabled:opacity-45"
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rowEnabled}
                      aria-label={`Toggle ${row.label} reminder`}
                      disabled={!remindersEnabled}
                      onClick={() =>
                        setEnabledMap((prev) => ({
                          ...prev,
                          [row.id]: !prev[row.id],
                        }))
                      }
                      className={`h-10 min-w-[84px] px-3 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap disabled:opacity-45 ${
                        rowEnabled && remindersEnabled
                          ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)]'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      }`}
                    >
                      {rowEnabled ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Optional Hydration Reminders */}
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Droplets className="w-4 h-4 text-[var(--accent-secondary-text)] mt-0.5 shrink-0" />
              <div>
                <h2 className="text-base font-display font-bold text-[var(--text-main)]">
                  Optional Hydration Reminders
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Check-in prompts when no hydration has been logged for your selected interval.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hydrationEnabled}
              disabled={!remindersEnabled}
              onClick={() => setHydrationEnabled((v) => !v)}
              className={`h-10 px-4 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap disabled:opacity-45 ${
                hydrationEnabled && remindersEnabled
                  ? 'bg-[var(--accent-secondary-soft)] text-[var(--accent-secondary-text)] border-[var(--accent-secondary-border)]'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
              }`}
            >
              {hydrationEnabled ? 'Hydration On' : 'Hydration Off'}
            </button>
          </div>

          {hydrationEnabled && remindersEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--border-subtle)]">
              <div>
                <label htmlFor="hyd-interval" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                  Interval
                </label>
                <select
                  id="hyd-interval"
                  value={hydrationInterval}
                  onChange={(e) => setHydrationInterval(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                >
                  <option value="60">Every 60 min</option>
                  <option value="90">Every 90 min</option>
                  <option value="120">Every 2 hours</option>
                  <option value="150">Every 2.5 hours</option>
                  <option value="180">Every 3 hours</option>
                </select>
              </div>
              <div>
                <label htmlFor="hyd-start" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                  Window Start
                </label>
                <input
                  id="hyd-start"
                  type="time"
                  value={hydrationStart}
                  onChange={(e) => setHydrationStart(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
              <div>
                <label htmlFor="hyd-end" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                  Window End
                </label>
                <input
                  id="hyd-end"
                  type="time"
                  value={hydrationEnd}
                  onChange={(e) => setHydrationEnd(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
            </div>
          )}
        </section>

        {/* Browser Notification Permission & Platform Transparency */}
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-bold text-[var(--text-main)]">
                Device &amp; Browser Notifications
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Current permission status:{' '}
                <span className="font-mono font-semibold text-[var(--text-main)]">
                  {permissionStatus === 'granted'
                    ? 'Granted'
                    : permissionStatus === 'denied'
                      ? 'Blocked / Denied'
                      : permissionStatus === 'default'
                        ? 'Not yet requested'
                        : 'Unsupported'}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {permissionStatus !== 'granted' && permissionStatus !== 'unsupported' && (
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className="h-10 px-4 rounded-lg bg-[var(--accent-secondary)] text-[var(--accent-secondary-ink)] text-xs font-semibold hover:opacity-90 whitespace-nowrap"
                >
                  Request Permission
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={browserNotifsEnabled && permissionStatus === 'granted'}
                onClick={handleToggleBrowserNotifications}
                className={`h-10 px-4 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                  browserNotifsEnabled && permissionStatus === 'granted'
                    ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                {browserNotifsEnabled && permissionStatus === 'granted' ? 'Browser Popups On' : 'Browser Popups Off'}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-3.5 flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
            <Info className="w-4 h-4 text-[var(--accent-secondary-text)] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              PULSE is running as a browser-based web application (not a native Android APK). Browser notifications
              fire in your local timezone ({timezoneName}) while PULSE is open in a browser tab, with automatic daily
              deduplication. Native Android background alarms when the browser is closed require an installed native
              Android NotificationChannel / WorkManager or server Web Push setup.
            </p>
          </div>
        </section>

        {/* Notification Preview */}
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[var(--accent-secondary-text)]" />
              <h2 className="text-base font-display font-bold text-[var(--text-main)]">
                Notification Preview
              </h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['breakfast', 'lunch', 'dinner', 'snack', 'hydration'] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setPreviewSlot(slot)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize border transition-colors whitespace-nowrap ${
                    previewSlot === slot
                      ? 'bg-[var(--accent-secondary)] text-[var(--accent-secondary-ink)] border-[var(--accent-secondary)] font-semibold'
                      : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--accent-secondary-soft)] border border-[var(--accent-secondary-border)] flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-[var(--accent-secondary-text)]" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-main)]">{preview.title}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{preview.timeLabel}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{preview.body}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendTestNotification}
              className="h-10 px-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent-secondary)] transition-colors whitespace-nowrap shrink-0"
            >
              Send Test Notification
            </button>
          </div>

          {testResult && (
            <div
              className={`rounded-lg px-3.5 py-2.5 text-xs flex items-center gap-2 border ${
                testResult.ok
                  ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--text-main)]'
                  : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onBack}
            className="h-11 px-5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)]"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-11 px-6 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-sm font-semibold disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
