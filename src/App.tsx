import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, BarChart3, HeartPulse, Home, Play, User } from 'lucide-react';
import type {
  ActivityRecord,
  DailyWellnessRecord,
  MealRecord,
  NavTab,
  PulseAppState,
  ThemeId,
  UserPreferences,
  UserProfile,
} from './types/pulse';
import { pulseApi } from './services/api';
import { HomeDashboard } from './components/HomeDashboard';
import { ActivitiesView } from './components/ActivitiesView';
import { WellnessView } from './components/WellnessView';
import { ProgressView } from './components/ProgressView';
import { ProfileView } from './components/ProfileView';
import { ActivityDetailModal, ActivityFormModal } from './components/ActivityModal';
import { toLocalDateKey } from './utils/metrics';
import { applyDocumentTheme, THEME_META_MAP } from './utils/themes';
import {
  computeTodayReminders,
  dispatchBrowserNotification,
  getBrowserNotificationStatus,
  getSentNotificationKeys,
  markNotificationSent,
} from './utils/reminders';

const LEFT_NAV: { id: NavTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'activities', label: 'Activity', icon: Activity },
  { id: 'wellness', label: 'Wellness', icon: HeartPulse },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [wellnessSubView, setWellnessSubView] = useState<'journal' | 'reminder-settings'>('journal');
  const [appState, setAppState] = useState<PulseAppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [previewTheme, setPreviewTheme] = useState<ThemeId | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityRecord | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [notificationWarning, setNotificationWarning] = useState<string>('');
  const [clockTick, setClockTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const savedTheme: ThemeId = appState?.preferences?.theme ?? 'midnight-mint';
  const effectiveTheme: ThemeId = previewTheme ?? savedTheme;

  useEffect(() => {
    applyDocumentTheme(effectiveTheme);
  }, [effectiveTheme]);

  // Periodic local clock tick for reminder scheduling & deduplication
  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [stateRes, cfgRes] = await Promise.all([
        pulseApi.getState(),
        pulseApi.getPublicConfig().catch(() => ({ googleMapsApiKey: '' })),
      ]);
      setAppState({ ...stateRes, preferences: { theme: 'midnight-mint', unitSystem: 'metric', dailyStepGoal: 8000, dailyHydrationGoalMl: 2250, weeklyDurationGoalMinutes: 150, mealRemindersEnabled: true, mealReminderEnabledMap: { breakfast: true, lunch: true, dinner: true, snack: false }, mealReminderTimes: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', snack: '15:30' }, hydrationRemindersEnabled: false, hydrationReminderIntervalMinutes: 120, hydrationReminderStartTime: '09:00', hydrationReminderEndTime: '20:00', browserNotificationsEnabled: false, dismissedReminders: {}, showOvernightMealGap: false, shareActivitiesPublicly: false, shareLocationRoutes: false, ...stateRes.preferences } });
      if (cfgRes.googleMapsApiKey) {
        setMapsApiKey(cfgRes.googleMapsApiKey);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load PULSE data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Scheduled notification dispatcher (timezone-aware + deduplicated per day)
  const reminderSnapshot = useMemo(() => {
    if (!appState) return { dueReminders: [], allSlots: [], dismissedCountToday: 0 };
    return computeTodayReminders(
      appState.preferences,
      appState.meals,
      appState.hydrationLogs,
      new Date(clockTick)
    );
  }, [appState, clockTick]);

  useEffect(() => {
    if (!appState) return;
    if (!appState.preferences.mealRemindersEnabled || !appState.preferences.browserNotificationsEnabled) {
      setNotificationWarning('');
      return;
    }

    const perm = getBrowserNotificationStatus();
    if (perm !== 'granted') {
      setNotificationWarning(
        perm === 'denied'
          ? 'Browser notifications are blocked in site settings; in-app reminders remain active.'
          : ''
      );
      return;
    }

    const todayKey = toLocalDateKey(new Date(clockTick));
    const sentMap = getSentNotificationKeys(todayKey);

    for (const due of reminderSnapshot.dueReminders) {
      const sig =
        due.kind === 'hydration'
          ? `${todayKey}-hydration-${Math.floor(clockTick / (Math.max(30, appState.preferences.hydrationReminderIntervalMinutes) * 60000))}`
          : `${todayKey}-${due.id}-${due.scheduledTime}`;

      if (sentMap[due.id] === sig) continue;

      const res = dispatchBrowserNotification(
        `PULSE · ${due.label}`,
        due.description,
        `pulse-${due.id}-${todayKey}`
      );
      if (res.ok) {
        markNotificationSent(todayKey, due.id, sig);
        setNotificationWarning('');
      } else {
        setNotificationWarning(res.error);
        break;
      }
    }
  }, [appState, reminderSnapshot.dueReminders, clockTick]);

  const handleSaveActivity = async (activity: ActivityRecord, isEdit = false) => {
    if (isEdit) {
      const { activity: updated } = await pulseApi.updateActivity(activity.id, activity);
      setAppState((prev) =>
        prev
          ? { ...prev, activities: prev.activities.map((a) => (a.id === updated.id ? updated : a)) }
          : prev
      );
      setSelectedActivity((curr) => (curr?.id === updated.id ? updated : curr));
    } else {
      const { activity: created, deduplicated } = await pulseApi.createActivity(activity);
      if (!deduplicated) {
        setAppState((prev) =>
          prev ? { ...prev, activities: [created, ...prev.activities] } : prev
        );
      }
    }
  };

  const handleDeleteActivity = async (id: string) => {
    await pulseApi.deleteActivity(id);
    setAppState((prev) =>
      prev ? { ...prev, activities: prev.activities.filter((a) => a.id !== id) } : prev
    );
  };

  const handleCreateMeal = async (meal: Omit<MealRecord, 'createdAt'>) => {
    const { meal: created } = await pulseApi.createMeal(meal);
    setAppState((prev) => (prev ? { ...prev, meals: [created, ...prev.meals] } : prev));
  };

  const handleUpdateMeal = async (id: string, patch: Partial<MealRecord>) => {
    const { meal: updated } = await pulseApi.updateMeal(id, patch);
    setAppState((prev) =>
      prev ? { ...prev, meals: prev.meals.map((m) => (m.id === updated.id ? updated : m)) } : prev
    );
  };

  const handleDeleteMeal = async (id: string) => {
    await pulseApi.deleteMeal(id);
    setAppState((prev) =>
      prev ? { ...prev, meals: prev.meals.filter((m) => m.id !== id) } : prev
    );
  };

  const handleAddHydration = async (amountMl: number, note = '') => {
    const { hydration } = await pulseApi.createHydration({
      id: crypto.randomUUID(),
      amountMl,
      timestamp: new Date().toISOString(),
      note,
    });
    setAppState((prev) =>
      prev ? { ...prev, hydrationLogs: [hydration, ...prev.hydrationLogs] } : prev
    );
  };

  const handleDeleteHydration = async (id: string) => {
    await pulseApi.deleteHydration(id);
    setAppState((prev) =>
      prev ? { ...prev, hydrationLogs: prev.hydrationLogs.filter((h) => h.id !== id) } : prev
    );
  };

  const handleUndoLastHydration = async () => {
    if (!appState) return;
    const todayKey = toLocalDateKey(new Date());
    const todayLogs = appState.hydrationLogs
      .filter((h) => toLocalDateKey(h.timestamp) === todayKey)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (todayLogs[0]) {
      await handleDeleteHydration(todayLogs[0].id);
    }
  };

  const handleUpsertWellness = async (record: Omit<DailyWellnessRecord, 'updatedAt'>) => {
    const { wellness } = await pulseApi.upsertWellness(record);
    setAppState((prev) => {
      if (!prev) return prev;
      const exists = prev.wellnessLogs.some((w) => w.dateKey === wellness.dateKey);
      return {
        ...prev,
        wellnessLogs: exists
          ? prev.wellnessLogs.map((w) => (w.dateKey === wellness.dateKey ? wellness : w))
          : [wellness, ...prev.wellnessLogs],
      };
    });
  };

  const handleUpdateProfileAndPrefs = async (
    profile?: Partial<UserProfile>,
    preferences?: Partial<UserPreferences>
  ) => {
    const res = await pulseApi.updateProfile({ profile, preferences });
    setAppState((prev) =>
      prev ? { ...prev, profile: res.profile, preferences: res.preferences } : prev
    );
  };

  const handleApplyTheme = async (theme: ThemeId) => {
    await handleUpdateProfileAndPrefs(undefined, { theme });
    setPreviewTheme(null);
  };

  const handleExportJson = async () => {
    const data = await pulseApi.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulse-export-${toLocalDateKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportActivitiesCsv = () => {
    if (!appState) return;
    const headers = [
      'id',
      'type',
      'title',
      'source',
      'startedAt',
      'durationSeconds',
      'distanceMeters',
      'elevationGainMeters',
      'avgHeartRateBpm',
      'notes',
    ];
    const escapeCsv = (val: unknown) => {
      const s = val == null ? '' : String(val);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = appState.activities.map((a) =>
      [
        a.id,
        a.type,
        a.title,
        a.source,
        a.startedAt,
        a.durationSeconds,
        a.distanceMeters ?? '',
        a.elevationGainMeters ?? '',
        a.avgHeartRateBpm ?? '',
        a.notes,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pulse-activities-${toLocalDateKey(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccount = async () => {
    const res = await pulseApi.deleteAccount();
    setAppState(res.state);
    setSelectedActivity(null);
    setEditingActivity(null);
    setPreviewTheme(null);
  };

  const renderMobileNavTab = (item: (typeof LEFT_NAV)[number]) => {
    const Icon = item.icon;
    const active = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setActiveTab(item.id)}
        className={`relative min-h-[44px] flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
          active ? 'text-[var(--accent-primary-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
        }`}
      >
        <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
        <span className="text-[11px] font-medium tracking-tight">{item.label}</span>
        {active && (
          <motion.span
            layoutId="mobile-nav-indicator"
            className="absolute bottom-1 w-4 h-0.5 rounded-full bg-[var(--accent-primary)]"
            transition={{ duration: 0.18 }}
          />
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] neo-canvas-glow text-[var(--text-main)] flex flex-col md:flex-row">
      {/* Required Google Maps Platform Demo Key Quota Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center fixed top-0 left-0 right-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Desktop Left Navigation Rail */}
      <aside className="hidden md:flex md:flex-col md:w-[224px] md:shrink-0 bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] sticky top-0 h-screen p-5 justify-between">
        <div>
          <div className="px-2 pb-5 border-b border-[var(--border-subtle)] flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold tracking-tight text-[var(--text-main)]">
              PULSE
            </span>
          </div>

          <nav className="mt-6 space-y-1" aria-label="Primary Navigation">
            {LEFT_NAV.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative w-full min-h-[44px] px-3.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[var(--bg-card)] text-[var(--accent-primary-text)] font-semibold border border-[var(--border-subtle)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]/50'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-[var(--accent-primary)]"
                    />
                  )}
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setActiveTab('activities')}
            className="mt-6 w-full h-11 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Start Workout
          </button>
        </div>

        {appState && (
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-left transition-colors"
          >
            <div className="w-9 h-9 rounded-full overflow-hidden bg-[var(--bg-primary)] shrink-0 flex items-center justify-center border border-[var(--border-subtle)]">
              {appState.profile.photoUrl ? (
                <img
                  src={appState.profile.photoUrl}
                  alt={appState.profile.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-4 h-4 text-[var(--text-secondary)]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-main)] truncate">{appState.profile.name}</p>
              <p className="text-xs text-[var(--accent-secondary-text)] truncate">
                {appState.preferences.unitSystem === 'imperial' ? 'Imperial · mi' : 'Metric · km'}
              </p>
            </div>
          </button>
        )}
      </aside>

      {/* Main Editorial Viewport */}
      <main className="flex-1 min-w-0 pb-28 md:pb-12">
        {/* Compact Mobile Brand Bar */}
        <div className="md:hidden flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border-subtle)]">
          <span className="font-display text-xl font-bold tracking-tight text-[var(--text-main)]">
            PULSE
          </span>
          {appState && (
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="w-9 h-9 rounded-full overflow-hidden bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-center"
              aria-label="Open athlete profile"
            >
              {appState.profile.photoUrl ? (
                <img
                  src={appState.profile.photoUrl}
                  alt={appState.profile.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-4 h-4 text-[var(--text-secondary)]" />
              )}
            </button>
          )}
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-9 space-y-6">
          {/* Live Theme Preview Bar (visible across all tabs while previewing a different theme) */}
          {previewTheme && previewTheme !== savedTheme && (
            <div className="rounded-xl bg-[var(--accent-secondary-soft)] border border-[var(--accent-secondary-border)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs sm:text-sm text-[var(--text-main)]">
                Previewing <span className="font-semibold">{THEME_META_MAP[previewTheme].name}</span> across PULSE.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTheme(null)}
                  className="h-9 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-main)]"
                >
                  Revert
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyTheme(previewTheme)}
                  className="h-9 px-3.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-bold"
                >
                  Apply Theme
                </button>
              </div>
            </div>
          )}

          {activeTab === 'wellness' && notificationWarning && (
            <div className="rounded-xl bg-[var(--warn-bg)] border border-[var(--warn-border)] px-4 py-2.5 text-xs text-[var(--warn-text)] flex items-center justify-between gap-2">
              <span>{notificationWarning}</span>
              <button
                type="button"
                onClick={() => setNotificationWarning('')}
                className="font-semibold hover:underline shrink-0"
              >
                Hide
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-5">
              <div className="h-10 w-64 rounded-lg bg-[var(--bg-card)] animate-pulse" />
              <div className="h-44 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] animate-pulse" />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 h-64 rounded-xl bg-[var(--bg-card)] animate-pulse" />
                <div className="lg:col-span-5 h-64 rounded-xl bg-[var(--bg-card)] animate-pulse" />
              </div>
            </div>
          ) : loadError || !appState ? (
            <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--danger-border)] p-6 text-center max-w-md mx-auto mt-12">
              <p className="text-base font-semibold text-[var(--text-main)]">Could not load your workspace</p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">{loadError || 'Server unreachable'}</p>
              <button
                type="button"
                onClick={loadInitialData}
                className="mt-4 h-10 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeTab === 'home' && (
                  <HomeDashboard
                    state={appState}
                    onNavigate={setActiveTab}
                    onStartQuickWorkout={() => setActiveTab('activities')}
                    onOpenManualActivity={() => {
                      setEditingActivity(null);
                      setManualModalOpen(true);
                    }}
                    onSelectActivity={setSelectedActivity}
                    onAddHydration={(ml) => handleAddHydration(ml)}
                    onUndoLastHydration={handleUndoLastHydration}
                    onUpsertWellness={handleUpsertWellness}
                  />
                )}

                {activeTab === 'activities' && (
                  <ActivitiesView
                    activities={appState.activities}
                    defaultType={appState.profile.preferredActivity}
                    unitSystem={appState.preferences.unitSystem}
                    themeId={effectiveTheme}
                    mapsApiKey={mapsApiKey}
                    quotaExceeded={quotaExceeded}
                    onSaveActivity={(act) => handleSaveActivity(act, false)}
                    onOpenManualModal={() => {
                      setEditingActivity(null);
                      setManualModalOpen(true);
                    }}
                    onSelectActivity={setSelectedActivity}
                  />
                )}

                {activeTab === 'wellness' && (
                  <WellnessView
                    state={appState}
                    initialSubView={wellnessSubView}
                    onSubViewHandled={() => setWellnessSubView('journal')}
                    onCreateMeal={handleCreateMeal}
                    onUpdateMeal={handleUpdateMeal}
                    onDeleteMeal={handleDeleteMeal}
                    onAddHydration={handleAddHydration}
                    onDeleteHydration={handleDeleteHydration}
                    onUpsertWellness={handleUpsertWellness}
                    onUpdatePreferences={(prefs) => handleUpdateProfileAndPrefs(undefined, prefs)}
                  />
                )}

                {activeTab === 'progress' && (
                  <ProgressView
                    activities={appState.activities}
                    unitSystem={appState.preferences.unitSystem}
                    onSelectActivity={setSelectedActivity}
                  />
                )}

                {activeTab === 'profile' && (
                  <ProfileView
                    state={appState}
                    previewTheme={previewTheme}
                    onPreviewTheme={setPreviewTheme}
                    onApplyTheme={handleApplyTheme}
                    onOpenReminderSettings={() => {
                      setWellnessSubView('reminder-settings');
                      setActiveTab('wellness');
                    }}
                    onSaveProfileAndPrefs={handleUpdateProfileAndPrefs}
                    onExportJson={handleExportJson}
                    onExportActivitiesCsv={handleExportActivitiesCsv}
                    onDeleteAccountAndData={handleDeleteAccount}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Mobile Floating Bottom Navigation Dock */}
      <nav
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl bg-[var(--bg-nav)] backdrop-blur-xl border border-[var(--border-subtle)] shadow-2xl px-1.5"
        aria-label="Mobile Navigation"
      >
        <div className="flex items-center justify-between h-[60px] pb-safe">
          {LEFT_NAV.map(renderMobileNavTab)}
        </div>
      </nav>

      {/* Manual Add / Edit Modal */}
      {appState && (manualModalOpen || editingActivity) && (
        <ActivityFormModal
          initialActivity={editingActivity}
          defaultType={appState.profile.preferredActivity}
          unitSystem={appState.preferences.unitSystem}
          onClose={() => {
            setManualModalOpen(false);
            setEditingActivity(null);
          }}
          onSave={handleSaveActivity}
        />
      )}

      {/* Activity Detail Modal */}
      {appState && selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          unitSystem={appState.preferences.unitSystem}
          themeId={effectiveTheme}
          mapsApiKey={mapsApiKey}
          quotaExceeded={quotaExceeded}
          onClose={() => setSelectedActivity(null)}
          onEdit={(act) => {
            setSelectedActivity(null);
            setEditingActivity(act);
          }}
          onDelete={handleDeleteActivity}
        />
      )}
    </div>
  );
}
