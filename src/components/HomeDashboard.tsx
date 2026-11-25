import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Plus,
  Play,
  Droplets,
  Footprints,
  Moon,
  Utensils,
  ChevronRight,
  Undo2,
  ArrowUpRight,
} from 'lucide-react';
import type { ActivityRecord, DailyWellnessRecord, NavTab, PulseAppState } from '../types/pulse';
import {
  ACTIVITY_META_MAP,
  calculateAveragePaceSecPerKm,
  computeDailySummary,
  computeWeeklyOverview,
  distanceValue,
  formatDisplayDate,
  formatDisplayTime,
  formatDistance,
  formatDurationHuman,
  formatHydration,
  formatPace,
  formatSleepMinutes,
  toLocalDateKey,
} from '../utils/metrics';
import { BarTrendChart, ProgressRing } from './Charts';
import { RouteMiniPath } from './RouteMap';

interface HomeDashboardProps {
  state: PulseAppState;
  onNavigate: (tab: NavTab) => void;
  onStartQuickWorkout: () => void;
  onOpenManualActivity: () => void;
  onSelectActivity: (activity: ActivityRecord) => void;
  onAddHydration: (amountMl: number) => Promise<void>;
  onUndoLastHydration: () => Promise<void>;
  onUpsertWellness: (record: Omit<DailyWellnessRecord, 'updatedAt'>) => Promise<void>;
}

function getTimeGreeting(date: Date): string {
  const hr = date.getHours();
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeDashboard({
  state,
  onNavigate,
  onStartQuickWorkout,
  onOpenManualActivity,
  onSelectActivity,
  onAddHydration,
  onUndoLastHydration,
  onUpsertWellness,
}: HomeDashboardProps) {
  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const summary = computeDailySummary(state, todayKey);
  const weeklyBuckets = computeWeeklyOverview(state.activities, today);
  const unitSystem = state.preferences.unitSystem;

  const [weeklyMetric, setWeeklyMetric] = useState<'duration' | 'distance'>('duration');
  const [editingSteps, setEditingSteps] = useState(false);
  const [stepsInput, setStepsInput] = useState(String(summary.steps || ''));
  const [editingSleep, setEditingSleep] = useState(false);
  const [sleepHoursInput, setSleepHoursInput] = useState(
    summary.sleepMinutes != null ? (summary.sleepMinutes / 60).toFixed(1) : ''
  );
  const [sleepQualityInput, setSleepQualityInput] = useState<'rested' | 'moderate' | 'tired'>(
    summary.wellnessLog?.sleepQuality ?? 'rested'
  );
  const [savingQuick, setSavingQuick] = useState(false);

  const recentActivities = [...state.activities]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 4);

  const todayHydrationEntries = state.hydrationLogs.filter((h) => toLocalDateKey(h.timestamp) === todayKey);

  const weeklyTotalMinutes = Math.round(
    weeklyBuckets.reduce((sum, b) => sum + b.durationSeconds, 0) / 60
  );
  const weeklyTotalMeters = weeklyBuckets.reduce((sum, b) => sum + b.distanceMeters, 0);
  const weeklyGoalPct =
    state.preferences.weeklyDurationGoalMinutes > 0
      ? weeklyTotalMinutes / state.preferences.weeklyDurationGoalMinutes
      : 0;

  const todayActiveMinutes = Math.round(summary.exerciseDurationSeconds / 60);

  const weeklyChartData = weeklyBuckets.map((b) => ({
    label: b.shortDay,
    value:
      weeklyMetric === 'duration'
        ? Math.round((b.durationSeconds / 60) * 10) / 10
        : Number(distanceValue(b.distanceMeters, unitSystem).toFixed(2)),
    secondaryLabel: `${b.count} ${b.count === 1 ? 'session' : 'sessions'}`,
  }));

  const handleSaveSteps = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Math.max(0, Math.round(Number(stepsInput) || 0));
    setSavingQuick(true);
    try {
      await onUpsertWellness({
        dateKey: todayKey,
        steps: val,
        sleepMinutes: summary.wellnessLog?.sleepMinutes ?? null,
        bedtime: summary.wellnessLog?.bedtime ?? null,
        wakeTime: summary.wellnessLog?.wakeTime ?? null,
        sleepQuality: summary.wellnessLog?.sleepQuality ?? null,
        recoveryNotes: summary.wellnessLog?.recoveryNotes ?? '',
      });
      setEditingSteps(false);
    } finally {
      setSavingQuick(false);
    }
  };

  const handleSaveSleep = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Number(sleepHoursInput);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) return;
    setSavingQuick(true);
    try {
      await onUpsertWellness({
        dateKey: todayKey,
        steps: summary.wellnessLog?.steps ?? null,
        sleepMinutes: Math.round(hours * 60),
        bedtime: summary.wellnessLog?.bedtime ?? null,
        wakeTime: summary.wellnessLog?.wakeTime ?? null,
        sleepQuality: sleepQualityInput,
        recoveryNotes: summary.wellnessLog?.recoveryNotes ?? '',
      });
      setEditingSleep(false);
    } finally {
      setSavingQuick(false);
    }
  };

  const hydrationProgress =
    state.preferences.dailyHydrationGoalMl > 0
      ? Math.min(1, summary.hydrationMl / state.preferences.dailyHydrationGoalMl)
      : 0;

  return (
    <div className="space-y-8">
      {/* Editorial Masthead */}
      <header className="flex items-start justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div>
          <p className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            {formatDisplayDate(today, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            <span className="mx-2 opacity-40" aria-hidden="true">·</span>
            <span>{getTimeGreeting(today)}, {state.profile.name}</span>
          </p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-display font-bold tracking-tight text-[var(--text-main)] text-balance leading-[1.06]">
            Find your rhythm.
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Move with purpose.</p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('profile')}
          className="hidden sm:flex items-center gap-3 shrink-0 group text-right"
          aria-label="Open athlete profile"
        >
          <div>
            <p className="text-xs font-semibold text-[var(--text-main)] group-hover:text-[var(--accent-primary-text)] transition-colors">
              {state.profile.name}
            </p>
            <p className="text-xs text-[var(--text-secondary)] capitalize">
              {ACTIVITY_META_MAP[state.profile.preferredActivity]?.label ?? state.profile.preferredActivity}
            </p>
          </div>
          <div className="w-11 h-11 rounded-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-card)]">
            {state.profile.photoUrl ? (
              <img
                src={state.profile.photoUrl}
                alt={state.profile.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>
        </button>
      </header>

      {/* Hero Section: Today's Movement */}
      <section
        aria-label="Today's Movement"
        className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 sm:p-7"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Primary Readout + Metrics */}
          <div className="lg:col-span-8 space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wider uppercase text-[var(--accent-secondary-text)]">
                Today&apos;s Movement
              </h2>
              <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                {summary.activityCount} {summary.activityCount === 1 ? 'session' : 'sessions'} today
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-0 sm:divide-x sm:divide-[var(--border-subtle)]">
              {/* Total Distance */}
              <div className="sm:pr-6">
                <p className="text-xs text-[var(--text-secondary)]">Total Distance</p>
                <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-[var(--text-main)] mt-1 tracking-tight">
                  {formatDistance(summary.distanceMeters, unitSystem)}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {summary.distanceMeters > 0 ? 'Recorded today' : 'No distance logged yet'}
                </p>
              </div>

              {/* Active Minutes */}
              <div className="sm:px-6">
                <p className="text-xs text-[var(--text-secondary)]">Active Minutes</p>
                <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-[var(--accent-primary-text)] mt-1 tracking-tight">
                  {todayActiveMinutes} <span className="text-base font-medium text-[var(--text-secondary)]">min</span>
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 font-mono tabular-nums">
                  {formatDurationHuman(summary.exerciseDurationSeconds)} elapsed
                </p>
              </div>

              {/* Steps */}
              <div className="sm:pl-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <Footprints className="w-3.5 h-3.5 text-[var(--accent-secondary-text)]" />
                    Steps
                  </p>
                  {!editingSteps && (
                    <button
                      type="button"
                      onClick={() => {
                        setStepsInput(summary.steps > 0 ? String(summary.steps) : '');
                        setEditingSteps(true);
                      }}
                      className="text-xs font-medium text-[var(--accent-primary-text)] hover:underline whitespace-nowrap"
                    >
                      {summary.steps > 0 ? 'Update' : 'Log'}
                    </button>
                  )}
                </div>

                {!editingSteps ? (
                  <>
                    <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-[var(--text-main)] mt-1 tracking-tight">
                      {summary.steps.toLocaleString()}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 font-mono tabular-nums">
                      Goal {state.preferences.dailyStepGoal.toLocaleString()}
                    </p>
                  </>
                ) : (
                  <form onSubmit={handleSaveSteps} className="mt-2 space-y-2">
                    <input
                      type="number"
                      min="0"
                      max="200000"
                      placeholder="e.g. 7500"
                      value={stepsInput}
                      onChange={(e) => setStepsInput(e.target.value)}
                      className="w-full h-9 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 text-sm font-mono tabular-nums text-[var(--text-main)]"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={savingQuick}
                        className="h-8 px-3 rounded-md bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSteps(false)}
                        className="h-8 px-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Right: Animated Weekly Progress Ring + Primary CTAs */}
          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-5 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)] lg:pl-6">
            <div className="flex items-center gap-4">
              <ProgressRing
                progress={weeklyGoalPct}
                size={84}
                strokeWidth={7}
                label="Weekly active duration progress"
                strokeColor="var(--accent-primary)"
                sublabel="Week"
              />
              <div>
                <p className="text-xs text-[var(--text-secondary)]">Weekly Rhythm</p>
                <p className="text-base font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
                  {weeklyTotalMinutes} / {state.preferences.weeklyDurationGoalMinutes} min
                </p>
                <p className="text-xs text-[var(--accent-secondary-text)] font-mono tabular-nums mt-0.5">
                  {formatDistance(weeklyTotalMeters, unitSystem)} total
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto lg:w-full lg:justify-end">
              <button
                type="button"
                onClick={onStartQuickWorkout}
                className="h-11 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-sm font-semibold flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Workout
              </button>
              <button
                type="button"
                onClick={onOpenManualActivity}
                className="h-11 px-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-main)] hover:border-[var(--accent-primary)] flex items-center gap-1.5 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4 text-[var(--accent-primary-text)]" />
                Log Manual
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Asymmetric Two-Column Editorial Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Weekly Activity Chart + Recent Activity Timeline */}
        <div className="lg:col-span-7 space-y-8">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-display font-bold text-[var(--text-main)]">Weekly Activity</h2>
                <p className="text-xs text-[var(--text-secondary)] font-mono tabular-nums mt-0.5">
                  Mon–Sun · {weeklyTotalMinutes} min · {formatDistance(weeklyTotalMeters, unitSystem)}
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setWeeklyMetric('duration')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    weeklyMetric === 'duration'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                  }`}
                >
                  Minutes
                </button>
                <button
                  type="button"
                  onClick={() => setWeeklyMetric('distance')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    weeklyMetric === 'distance'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                  }`}
                >
                  Distance
                </button>
              </div>
            </div>

            <BarTrendChart
              data={weeklyChartData}
              unitSuffix={weeklyMetric === 'duration' ? 'min' : unitSystem === 'imperial' ? 'mi' : 'km'}
              emptyText="No workouts logged this week yet. Start a workout or add one manually to see your weekly pattern."
              height={165}
              accentColor="var(--accent-primary)"
            />
          </section>

          <section className="pt-6 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold text-[var(--text-main)]">Recent Activity Timeline</h2>
              <button
                type="button"
                onClick={() => onNavigate('activities')}
                className="text-xs font-semibold text-[var(--accent-primary-text)] hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                All Activities
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentActivities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 text-center">
                <p className="text-sm font-medium text-[var(--text-main)]">Your activity timeline is empty</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                  Record a live outdoor session with GPS or add an indoor workout to build your training log.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
                  <button
                    type="button"
                    onClick={onStartQuickWorkout}
                    className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold hover:bg-[var(--accent-primary-hover)] whitespace-nowrap"
                  >
                    Start Workout
                  </button>
                  <button
                    type="button"
                    onClick={onOpenManualActivity}
                    className="h-10 px-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-medium hover:border-[var(--accent-primary)] whitespace-nowrap"
                  >
                    Add Manually
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative pl-5 space-y-5 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-[var(--border-subtle)]">
                {recentActivities.map((act) => {
                  const pace = calculateAveragePaceSecPerKm(act.distanceMeters, act.durationSeconds);
                  const hasRoute = act.routePoints.length >= 2;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => onSelectActivity(act)}
                      className="relative w-full text-left group block rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] p-4 transition-colors"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -left-[18px] top-5 w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)] ring-4 ring-[var(--bg-primary)]"
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                            <span className="font-semibold text-[var(--accent-primary-text)]">
                              {ACTIVITY_META_MAP[act.type]?.label ?? act.type}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{act.source === 'recorded' ? 'GPS Recorded' : 'Manual'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{formatDisplayDate(act.startedAt)}</span>
                          </div>
                          <p className="text-base font-display font-bold text-[var(--text-main)] mt-1 truncate group-hover:text-[var(--accent-primary-text)] transition-colors">
                            {act.title}
                          </p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--accent-primary-text)] shrink-0 mt-0.5" />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-mono tabular-nums text-[var(--text-main)]">
                        <span>{formatDurationHuman(act.durationSeconds)}</span>
                        {act.distanceMeters != null && <span>{formatDistance(act.distanceMeters, unitSystem)}</span>}
                        {pace != null && <span className="text-[var(--accent-secondary-text)]">{formatPace(pace, unitSystem)}</span>}
                      </div>

                      {hasRoute && <RouteMiniPath points={act.routePoints} className="mt-3 h-16 w-full" />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column (5 cols): Daily Wellness Section */}
        <aside className="lg:col-span-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {/* Hydration Summary */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-[var(--accent-secondary-text)]" />
                <h2 className="text-sm font-display font-bold text-[var(--text-main)]">Hydration</h2>
              </div>
              {todayHydrationEntries.length > 0 && (
                <button
                  type="button"
                  onClick={onUndoLastHydration}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] flex items-center gap-1 whitespace-nowrap"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
              )}
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-2">
              <p className="text-2xl font-bold font-mono tabular-nums text-[var(--text-main)]">
                {formatHydration(summary.hydrationMl, unitSystem)}
              </p>
              <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                Goal {formatHydration(state.preferences.dailyHydrationGoalMl, unitSystem)}
              </span>
            </div>

            <div className="mt-2.5 h-2 w-full rounded-full bg-[var(--bg-secondary)] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[var(--accent-secondary)]"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(hydrationProgress * 100)}%` }}
                transition={{ duration: 0.35 }}
              />
            </div>

            <div className="flex flex-wrap gap-2 mt-3.5">
              <button
                type="button"
                onClick={() => onAddHydration(250)}
                className="h-9 px-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-main)] hover:border-[var(--accent-secondary)] transition-colors active:scale-[0.98] whitespace-nowrap"
              >
                + {unitSystem === 'imperial' ? '8.5 oz' : '250 ml'}
              </button>
              <button
                type="button"
                onClick={() => onAddHydration(500)}
                className="h-9 px-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-main)] hover:border-[var(--accent-secondary)] transition-colors active:scale-[0.98] whitespace-nowrap"
              >
                + {unitSystem === 'imperial' ? '16.9 oz' : '500 ml'}
              </button>
            </div>
          </div>

          {/* Sleep & Recovery Summary */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-[var(--accent-secondary-text)]" />
                <h2 className="text-sm font-display font-bold text-[var(--text-main)]">Sleep &amp; Recovery</h2>
              </div>
              {!editingSleep && (
                <button
                  type="button"
                  onClick={() => {
                    setSleepHoursInput(summary.sleepMinutes != null ? (summary.sleepMinutes / 60).toFixed(1) : '7.5');
                    setSleepQualityInput(summary.wellnessLog?.sleepQuality ?? 'rested');
                    setEditingSleep(true);
                  }}
                  className="text-xs font-medium text-[var(--accent-secondary-text)] hover:underline whitespace-nowrap"
                >
                  {summary.sleepMinutes != null ? 'Edit' : 'Log sleep'}
                </button>
              )}
            </div>

            {!editingSleep ? (
              summary.sleepMinutes != null ? (
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold font-mono tabular-nums text-[var(--text-main)]">
                      {formatSleepMinutes(summary.sleepMinutes)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] capitalize mt-0.5">
                      {summary.wellnessLog?.sleepQuality
                        ? `Morning state: ${summary.wellnessLog.sleepQuality}`
                        : 'Rest duration recorded'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('wellness')}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)] whitespace-nowrap"
                  >
                    Journal
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">
                  No sleep recorded for today yet. Log rest hours to track recovery trends.
                </p>
              )
            ) : (
              <form onSubmit={handleSaveSleep} className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="home-sleep-hrs" className="block text-xs text-[var(--text-secondary)] mb-1">
                      Hours
                    </label>
                    <input
                      id="home-sleep-hrs"
                      type="number"
                      min="0"
                      max="24"
                      step="0.1"
                      value={sleepHoursInput}
                      onChange={(e) => setSleepHoursInput(e.target.value)}
                      required
                      className="w-full h-9 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 text-sm font-mono tabular-nums text-[var(--text-main)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="home-sleep-qual" className="block text-xs text-[var(--text-secondary)] mb-1">
                      Recovery
                    </label>
                    <select
                      id="home-sleep-qual"
                      value={sleepQualityInput}
                      onChange={(e) => setSleepQualityInput(e.target.value as 'rested' | 'moderate' | 'tired')}
                      className="w-full h-9 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2 text-xs text-[var(--text-main)]"
                    >
                      <option value="rested">Rested</option>
                      <option value="moderate">Moderate</option>
                      <option value="tired">Tired</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSleep(false)}
                    className="h-8 px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingQuick}
                    className="h-8 px-3.5 rounded-lg bg-[var(--accent-secondary)] text-[var(--accent-secondary-ink)] text-xs font-semibold"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Daily Nourishment Summary */}
          <div className="p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-[var(--accent-primary-text)]" />
                <h2 className="text-sm font-display font-bold text-[var(--text-main)]">Daily Nourishment</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('wellness')}
                className="text-xs font-semibold text-[var(--accent-primary-text)] hover:underline whitespace-nowrap"
              >
                Open Journal
              </button>
            </div>

            {summary.todayMeals.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">
                No meals logged today yet. Regular check-ins support steady training energy.
              </p>
            ) : (
              <div className="space-y-2">
                {summary.todayMeals.slice(0, 3).map((meal) => (
                  <div key={meal.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-[var(--text-main)] truncate font-medium">{meal.title}</span>
                    <span className="text-[var(--text-secondary)] font-mono tabular-nums shrink-0 capitalize">
                      {meal.category} · {formatDisplayTime(meal.timestamp)}
                    </span>
                  </div>
                ))}
                {summary.todayMeals.length > 3 && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    + {summary.todayMeals.length - 3} more in journal
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
