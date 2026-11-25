import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Shield,
  Trash2,
  Upload,
  User,
  CheckCircle2,
  AlertTriangle,
  Palette,
  SlidersHorizontal,
  Bell,
  Info,
} from 'lucide-react';
import type {
  ActivityType,
  PulseAppState,
  ThemeId,
  UnitSystem,
  UserPreferences,
  UserProfile,
} from '../types/pulse';
import {
  ACTIVITY_META_MAP,
  ACTIVITY_TYPES,
  computeAnalytics,
  formatDistance,
  formatDurationHuman,
} from '../utils/metrics';
import { PULSE_THEMES, THEME_META_MAP } from '../utils/themes';

interface ProfileViewProps {
  state: PulseAppState;
  previewTheme: ThemeId | null;
  onPreviewTheme: (theme: ThemeId | null) => void;
  onApplyTheme: (theme: ThemeId) => Promise<void>;
  onOpenReminderSettings: () => void;
  onSaveProfileAndPrefs: (profile: Partial<UserProfile>, prefs: Partial<UserPreferences>) => Promise<void>;
  onExportJson: () => Promise<void>;
  onExportActivitiesCsv: () => void;
  onDeleteAccountAndData: () => Promise<void>;
}

const DEFAULT_AVATAR = '/src/assets/images/athlete_profile_avatar_1795607428880.jpg';

export function ProfileView({
  state,
  previewTheme,
  onPreviewTheme,
  onApplyTheme,
  onOpenReminderSettings,
  onSaveProfileAndPrefs,
  onExportJson,
  onExportActivitiesCsv,
  onDeleteAccountAndData,
}: ProfileViewProps) {
  const [name, setName] = useState(state.profile.name);
  const [bio, setBio] = useState(state.profile.bio);
  const [photoUrl, setPhotoUrl] = useState(state.profile.photoUrl);
  const [preferredActivity, setPreferredActivity] = useState<ActivityType>(state.profile.preferredActivity);

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(state.preferences.unitSystem);
  const [dailyStepGoal, setDailyStepGoal] = useState(String(state.preferences.dailyStepGoal));
  const [dailyHydrationGoalMl, setDailyHydrationGoalMl] = useState(
    String(state.preferences.dailyHydrationGoalMl)
  );
  const [weeklyDurationGoalMinutes, setWeeklyDurationGoalMinutes] = useState(
    String(state.preferences.weeklyDurationGoalMinutes)
  );
  const [mealRemindersEnabled, setMealRemindersEnabled] = useState(state.preferences.mealRemindersEnabled);
  const [breakfastTime, setBreakfastTime] = useState(state.preferences.mealReminderTimes.breakfast);
  const [lunchTime, setLunchTime] = useState(state.preferences.mealReminderTimes.lunch);
  const [dinnerTime, setDinnerTime] = useState(state.preferences.mealReminderTimes.dinner);
  const [shareActivitiesPublicly, setShareActivitiesPublicly] = useState(
    state.preferences.shareActivitiesPublicly
  );
  const [shareLocationRoutes, setShareLocationRoutes] = useState(state.preferences.shareLocationRoutes);

  const [saving, setSaving] = useState(false);
  const [applyingTheme, setApplyingTheme] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(state.profile.name);
  }, [state.profile.name]);

  useEffect(() => {
    setBio(state.profile.bio);
  }, [state.profile.bio]);

  useEffect(() => {
    setPhotoUrl(state.profile.photoUrl);
  }, [state.profile.photoUrl]);

  useEffect(() => {
    setPreferredActivity(state.profile.preferredActivity);
  }, [state.profile.preferredActivity]);

  useEffect(() => {
    setMealRemindersEnabled(state.preferences.mealRemindersEnabled);
    setBreakfastTime(state.preferences.mealReminderTimes.breakfast);
    setLunchTime(state.preferences.mealReminderTimes.lunch);
    setDinnerTime(state.preferences.mealReminderTimes.dinner);
  }, [
    state.preferences.mealRemindersEnabled,
    state.preferences.mealReminderTimes.breakfast,
    state.preferences.mealReminderTimes.lunch,
    state.preferences.mealReminderTimes.dinner,
  ]);

  const savedTheme = state.preferences.theme ?? 'midnight-mint';
  const activeVisualTheme = previewTheme ?? savedTheme;
  const isPreviewingOtherTheme = previewTheme !== null && previewTheme !== savedTheme;

  const allTimeStats = useMemo(
    () => computeAnalytics(state.activities, { range: 'all', activityType: 'all' }),
    [state.activities]
  );

  const persistPhotoUrl = async (nextPhoto: string) => {
    setPhotoUrl(nextPhoto);
    setErrorMsg('');
    try {
      await onSaveProfileAndPrefs({ photoUrl: nextPhoto }, {});
      setSavedMsg('Profile photo updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update profile photo.');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setErrorMsg('Please choose an image smaller than 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void persistPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyThemeClick = async (themeToApply: ThemeId) => {
    setApplyingTheme(true);
    setErrorMsg('');
    try {
      await onApplyTheme(themeToApply);
      setSavedMsg(`Theme switched to ${THEME_META_MAP[themeToApply].name}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save theme.');
    } finally {
      setApplyingTheme(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSavedMsg('');

    if (!name.trim()) {
      setErrorMsg('Display name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      await onSaveProfileAndPrefs(
        {
          name: name.trim(),
          bio: bio.trim(),
          photoUrl,
          preferredActivity,
        },
        {
          theme: activeVisualTheme,
          unitSystem,
          dailyStepGoal: Math.max(500, Math.round(Number(dailyStepGoal) || 8000)),
          dailyHydrationGoalMl: Math.max(500, Math.round(Number(dailyHydrationGoalMl) || 2250)),
          weeklyDurationGoalMinutes: Math.max(15, Math.round(Number(weeklyDurationGoalMinutes) || 150)),
          mealRemindersEnabled,
          mealReminderTimes: {
            ...state.preferences.mealReminderTimes,
            breakfast: breakfastTime,
            lunch: lunchTime,
            dinner: dinnerTime,
          },
          shareActivitiesPublicly,
          shareLocationRoutes,
        }
      );
      onPreviewTheme(null);
      setSavedMsg('Profile, theme, and preferences saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      await onDeleteAccountAndData();
      setName('Athlete');
      setBio('Moving with intention and consistency.');
      setPhotoUrl(DEFAULT_AVATAR);
      setPreferredActivity('running');
      setUnitSystem('metric');
      setShareActivitiesPublicly(false);
      setShareLocationRoutes(false);
      onPreviewTheme(null);
      setShowDeleteConfirm(false);
      setSavedMsg('All account data has been cleared and reset.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Athlete Profile Header Banner */}
      <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[var(--bg-secondary)] border-2 border-[var(--accent-primary)] shrink-0 flex items-center justify-center">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={name || 'Athlete profile'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-9 h-9 text-[var(--text-secondary)]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-secondary-text)]">
              Athlete Profile
            </p>

            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-[var(--text-main)] mt-1 truncate">
              {state.profile.name}
            </h1>

            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {state.profile.bio || 'No bio added yet'} · Primary:{' '}
              <span className="text-[var(--accent-primary-text)] font-medium">
                {ACTIVITY_META_MAP[state.profile.preferredActivity]?.label ?? state.profile.preferredActivity}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-2.5 mt-4">
              <label className="h-9 px-3.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-main)] hover:border-[var(--accent-primary)] flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap">
                <Upload className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />
                Change Photo
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="sr-only" />
              </label>
              {photoUrl !== DEFAULT_AVATAR && (
                <button
                  type="button"
                  onClick={() => void persistPhotoUrl(DEFAULT_AVATAR)}
                  className="h-9 px-3 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] whitespace-nowrap"
                >
                  Use Default
                </button>
              )}
              {photoUrl && (
                <button
                  type="button"
                  onClick={() => void persistPhotoUrl('')}
                  className="h-9 px-3 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--danger-text)] whitespace-nowrap"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* All-Time Personal Activity Statistics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 mt-6 border-t border-[var(--border-subtle)]">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Total Workouts</p>
            <p className="text-xl font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
              {allTimeStats.activityCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Total Distance</p>
            <p className="text-xl font-bold font-mono tabular-nums text-[var(--accent-secondary-text)] mt-0.5">
              {formatDistance(allTimeStats.totalDistanceMeters, state.preferences.unitSystem)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Total Duration</p>
            <p className="text-xl font-bold font-mono tabular-nums text-[var(--accent-primary-text)] mt-0.5">
              {formatDurationHuman(allTimeStats.totalDurationSeconds)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Active Days</p>
            <p className="text-xl font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
              {allTimeStats.activeDaysCount}
            </p>
          </div>
        </div>
      </section>

      {savedMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] px-4 py-3 text-sm text-[var(--text-main)]">
          <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] px-4 py-3 text-sm text-[var(--danger-text)]">
          {errorMsg}
        </div>
      )}

      {/* Appearance & Theme Customization (Compact) */}
      <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
            <h2 className="text-sm font-display font-bold text-[var(--text-main)]">Appearance</h2>
            <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">
              · Click to preview
            </span>
          </div>

          <span className="text-xs font-mono text-[var(--accent-secondary-text)]">
            {THEME_META_MAP[savedTheme]?.name}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {PULSE_THEMES.map((themeOption) => {
            const isSelected = activeVisualTheme === themeOption.id;
            const isSaved = savedTheme === themeOption.id;
            return (
              <button
                key={themeOption.id}
                type="button"
                onClick={() => onPreviewTheme(themeOption.id === savedTheme ? null : themeOption.id)}
                title={themeOption.description}
                className={`text-left rounded-lg px-3 py-2.5 border transition-all ${
                  isSelected
                    ? 'border-[var(--accent-primary)] bg-[var(--bg-secondary)] ring-1 ring-[var(--accent-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 hover:border-[var(--accent-secondary)]'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-display font-bold text-[var(--text-main)] truncate">
                    {themeOption.name}
                  </span>
                  {isSaved && !isPreviewingOtherTheme && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0" aria-label="Applied" />
                  )}
                </div>

                {/* Compact Swatch Strip */}
                <div className="mt-2 flex items-center gap-1">
                  <span
                    className="h-2.5 flex-1 rounded-sm border"
                    style={{
                      backgroundColor: themeOption.swatches.primaryBg,
                      borderColor: themeOption.swatches.border,
                    }}
                  />
                  <span
                    className="h-2.5 flex-1 rounded-sm border"
                    style={{
                      backgroundColor: themeOption.swatches.cardBg,
                      borderColor: themeOption.swatches.border,
                    }}
                  />
                  <span
                    className="h-2.5 w-4 rounded-sm"
                    style={{ backgroundColor: themeOption.swatches.primaryAccent }}
                  />
                  <span
                    className="h-2.5 w-4 rounded-sm"
                    style={{ backgroundColor: themeOption.swatches.secondaryAccent }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {isPreviewingOtherTheme && previewTheme && (
          <div className="rounded-lg bg-[var(--accent-secondary-soft)] border border-[var(--accent-secondary-border)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
            <p className="text-xs text-[var(--text-main)]">
              Previewing <span className="font-semibold">{THEME_META_MAP[previewTheme].name}</span>
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onPreviewTheme(null)}
                className="h-8 px-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-main)] whitespace-nowrap"
              >
                Revert
              </button>
              <button
                type="button"
                disabled={applyingTheme}
                onClick={() => handleApplyThemeClick(previewTheme)}
                className="h-8 px-3.5 rounded-md bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-xs font-bold whitespace-nowrap"
              >
                {applyingTheme ? 'Applying...' : 'Apply Theme'}
              </button>
            </div>
          </div>
        )}
      </section>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identity & Preferences */}
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5">
          <h2 className="text-base font-display font-bold text-[var(--text-main)]">
            Identity &amp; Measurement Preferences
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prof-name" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                Username / Display Name
              </label>
              <input
                id="prof-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)]"
              />
            </div>

            <div>
              <label htmlFor="prof-act" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                Primary Activity
              </label>
              <select
                id="prof-act"
                value={preferredActivity}
                onChange={(e) => setPreferredActivity(e.target.value as ActivityType)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)]"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="prof-bio" className="block text-xs text-[var(--text-secondary)] mb-1.5">
              Bio / Athletic Focus
            </label>
            <input
              id="prof-bio"
              type="text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)]"
            />
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--text-secondary)] mb-2">Measurement Units</p>
            <div className="inline-flex p-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setUnitSystem('metric')}
                className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  unitSystem === 'metric'
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
              >
                Metric (km, m, ml)
              </button>
              <button
                type="button"
                onClick={() => setUnitSystem('imperial')}
                className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  unitSystem === 'imperial'
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
              >
                Imperial (mi, ft, fl oz)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="goal-steps" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                Daily Step Goal
              </label>
              <input
                id="goal-steps"
                type="number"
                min="500"
                max="100000"
                value={dailyStepGoal}
                onChange={(e) => setDailyStepGoal(e.target.value)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
              />
            </div>

            <div>
              <label htmlFor="goal-water" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                Daily Hydration Goal (ml)
              </label>
              <input
                id="goal-water"
                type="number"
                min="500"
                max="10000"
                step="50"
                value={dailyHydrationGoalMl}
                onChange={(e) => setDailyHydrationGoalMl(e.target.value)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
              />
            </div>

            <div>
              <label htmlFor="goal-weekly" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                Weekly Activity Goal (min)
              </label>
              <input
                id="goal-weekly"
                type="number"
                min="15"
                max="5000"
                value={weeklyDurationGoalMinutes}
                onChange={(e) => setWeeklyDurationGoalMinutes(e.target.value)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
              />
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <Bell className="w-4 h-4 text-[var(--accent-secondary-text)] mt-0.5 shrink-0" />
              <div>
                <h2 className="text-base font-display font-bold text-[var(--text-main)]">Notifications</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Gentle reminders for regular meals and hydration. Configure snack times, hydration intervals, and browser permissions in Reminder Settings.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenReminderSettings}
                className="h-10 px-3.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent-secondary)] flex items-center gap-1.5 whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent-secondary-text)]" />
                Reminder Settings
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={mealRemindersEnabled}
                onClick={() => setMealRemindersEnabled((v) => !v)}
                className={`h-10 px-4 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                  mealRemindersEnabled
                    ? 'bg-[var(--accent-secondary-soft)] text-[var(--accent-secondary-text)] border-[var(--accent-secondary-border)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                {mealRemindersEnabled ? 'Reminders On' : 'Reminders Off'}
              </button>
            </div>
          </div>

          {mealRemindersEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label htmlFor="rem-b" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Breakfast
                </label>
                <input
                  id="rem-b"
                  type="time"
                  value={breakfastTime}
                  onChange={(e) => setBreakfastTime(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
              <div>
                <label htmlFor="rem-l" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Lunch
                </label>
                <input
                  id="rem-l"
                  type="time"
                  value={lunchTime}
                  onChange={(e) => setLunchTime(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
              <div>
                <label htmlFor="rem-d" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Dinner
                </label>
                <input
                  id="rem-d"
                  type="time"
                  value={dinnerTime}
                  onChange={(e) => setDinnerTime(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
            </div>
          )}
        </section>

        {/* Privacy Controls */}
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--accent-primary-text)]" />
            <h2 className="text-base font-display font-bold text-[var(--text-main)]">Privacy Settings</h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            All workouts and GPS coordinates remain strictly private by default. Location data is never shared publicly without your permission.
          </p>

          <div className="divide-y divide-[var(--border-subtle)]">
            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--text-main)]">Optional Activity Sharing</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Allow sharing activity summary cards when you opt in.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={shareActivitiesPublicly}
                onClick={() => setShareActivitiesPublicly((v) => !v)}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                  shareActivitiesPublicly
                    ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                {shareActivitiesPublicly ? 'Enabled' : 'Private'}
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--text-main)]">Share Location Routes</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Include GPS route coordinates when exporting or sharing.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={shareLocationRoutes}
                onClick={() => setShareLocationRoutes((v) => !v)}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                  shareLocationRoutes
                    ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                {shareLocationRoutes ? 'Enabled' : 'Private'}
              </button>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {savedMsg && (
            <span className="text-xs text-[var(--accent-primary-text)] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {savedMsg}
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="h-11 px-6 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-sm font-bold disabled:opacity-50 transition-colors active:scale-[0.98] whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Export Data & Account Settings */}
      <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-display font-bold text-[var(--text-main)]">
            Export Data &amp; Account Settings
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Download a complete copy of your records or reset your account.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExportJson}
            className="h-11 px-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent-secondary)] flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[var(--accent-secondary-text)]" />
            Export All Data (JSON)
          </button>
          <button
            type="button"
            onClick={onExportActivitiesCsv}
            className="h-11 px-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent-primary)] flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[var(--accent-primary-text)]" />
            Export Activities (CSV)
          </button>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--danger-text)]">Delete Account &amp; All Data</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Permanently wipe all saved workouts, GPS coordinates, meals, hydration, sleep, and profile settings.
            </p>
          </div>

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="h-11 px-4 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] text-xs font-semibold text-[var(--danger-text)] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account &amp; Data
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] p-3">
              <AlertTriangle className="w-4 h-4 text-[var(--danger-text)] shrink-0" />
              <span className="text-xs text-[var(--danger-text)]">Erase everything permanently?</span>
              <button
                type="button"
                onClick={handleConfirmDeleteAccount}
                disabled={deleting}
                className="h-9 px-3.5 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-9 px-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>

      {/* About PULSE */}
      <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[var(--accent-secondary-text)] mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-display font-bold text-[var(--text-main)]">About PULSE</h2>
              <p className="text-xs text-[var(--accent-secondary-text)] mt-0.5">
                Find your rhythm. Move with purpose.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-[var(--text-secondary)] shrink-0">PULSE NEO</span>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          PULSE is a personal fitness and daily wellness tracker built around honest, recorded metrics and
          supportive everyday habits. Log outdoor workouts with live GPS routing, indoor sessions, and
          strength work alongside steady nourishment, hydration, and sleep recovery without restrictive rules
          or fabricated numbers.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-3">
            <p className="text-xs font-semibold text-[var(--text-main)]">Real Activity Telemetry</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Pace, speed, distance, and elevation are computed strictly from recorded session time, GPS coordinates, and user inputs.
            </p>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-3">
            <p className="text-xs font-semibold text-[var(--text-main)]">Balanced Wellness</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Meal check-ins, hydration goals, and rest logs focus on consistency and recovery rather than calorie restriction.
            </p>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-3">
            <p className="text-xs font-semibold text-[var(--text-main)]">Private by Default</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Your movement routes, meals, and preferences stay in your personal workspace with full export and reset control.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
