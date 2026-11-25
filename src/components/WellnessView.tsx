import { useMemo, useState } from 'react';
import {
  Bell,
  Droplets,
  Moon,
  Plus,
  Trash2,
  Edit3,
  Utensils,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
  X,
  RotateCcw,
} from 'lucide-react';
import type {
  DailyWellnessRecord,
  HydrationRecord,
  MealCategory,
  MealRecord,
  PulseAppState,
  UserPreferences,
} from '../types/pulse';
import {
  MEAL_CATEGORIES,
  combineLocalDateAndTime,
  computeOvernightMealGaps,
  formatDisplayDate,
  formatDisplayTime,
  formatHydration,
  formatSleepMinutes,
  toLocalDateKey,
  toLocalTimeInput,
} from '../utils/metrics';
import { computeTodayReminders, getLocalTimezoneName, type ReminderSlotId } from '../utils/reminders';
import { ProgressRing } from './Charts';
import { MealFormModal } from './MealFormModal';
import { ReminderSettingsView } from './ReminderSettingsView';

interface WellnessViewProps {
  state: PulseAppState;
  initialSubView?: 'journal' | 'reminder-settings';
  onSubViewHandled?: () => void;
  onCreateMeal: (meal: Omit<MealRecord, 'createdAt'>) => Promise<void>;
  onUpdateMeal: (id: string, patch: Partial<MealRecord>) => Promise<void>;
  onDeleteMeal: (id: string) => Promise<void>;
  onAddHydration: (amountMl: number, note?: string) => Promise<void>;
  onDeleteHydration: (id: string) => Promise<void>;
  onUpsertWellness: (record: Omit<DailyWellnessRecord, 'updatedAt'>) => Promise<void>;
  onUpdatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

export function WellnessView({
  state,
  initialSubView = 'journal',
  onSubViewHandled,
  onCreateMeal,
  onUpdateMeal,
  onDeleteMeal,
  onAddHydration,
  onDeleteHydration,
  onUpsertWellness,
  onUpdatePreferences,
}: WellnessViewProps) {
  const unitSystem = state.preferences.unitSystem;
  const [subView, setSubView] = useState<'journal' | 'reminder-settings'>(initialSubView);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(toLocalDateKey(new Date()));

  // Modal state for clicking reminder buttons or quick logging
  const [modalMealCategory, setModalMealCategory] = useState<MealCategory | null>(null);
  const [modalEditMeal, setModalEditMeal] = useState<MealRecord | null>(null);

  // Inline meal journal form state
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealCategory, setMealCategory] = useState<MealCategory>('breakfast');
  const [mealTitle, setMealTitle] = useState('');
  const [mealTime, setMealTime] = useState(toLocalTimeInput(new Date()));
  const [mealNotes, setMealNotes] = useState('');
  const [mealError, setMealError] = useState('');
  const [savingMeal, setSavingMeal] = useState(false);

  const [customMl, setCustomMl] = useState('350');

  const dayWellness = state.wellnessLogs.find((w) => w.dateKey === selectedDateKey) ?? null;
  const [sleepHours, setSleepHours] = useState<string>(
    dayWellness?.sleepMinutes != null ? (dayWellness.sleepMinutes / 60).toFixed(1) : ''
  );
  const [bedtime, setBedtime] = useState<string>(dayWellness?.bedtime ?? '22:30');
  const [wakeTime, setWakeTime] = useState<string>(dayWellness?.wakeTime ?? '06:30');
  const [sleepQuality, setSleepQuality] = useState<'rested' | 'moderate' | 'tired'>(
    dayWellness?.sleepQuality ?? 'rested'
  );
  const [dailySteps, setDailySteps] = useState<string>(
    dayWellness?.steps != null ? String(dayWellness.steps) : ''
  );
  const [recoveryNotes, setRecoveryNotes] = useState<string>(dayWellness?.recoveryNotes ?? '');
  const [savingWellness, setSavingWellness] = useState(false);
  const [wellnessSavedMsg, setWellnessSavedMsg] = useState('');

  if (initialSubView === 'reminder-settings' && subView !== 'reminder-settings') {
    setSubView('reminder-settings');
    onSubViewHandled?.();
  }

  const handleDateChange = (nextKey: string) => {
    setSelectedDateKey(nextKey);
    const w = state.wellnessLogs.find((item) => item.dateKey === nextKey);
    setSleepHours(w?.sleepMinutes != null ? (w.sleepMinutes / 60).toFixed(1) : '');
    setBedtime(w?.bedtime ?? '22:30');
    setWakeTime(w?.wakeTime ?? '06:30');
    setSleepQuality(w?.sleepQuality ?? 'rested');
    setDailySteps(w?.steps != null ? String(w.steps) : '');
    setRecoveryNotes(w?.recoveryNotes ?? '');
    setWellnessSavedMsg('');
  };

  const dayMeals = useMemo(
    () =>
      state.meals
        .filter((m) => toLocalDateKey(m.timestamp) === selectedDateKey)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [state.meals, selectedDateKey]
  );

  const dayHydration = useMemo(
    () =>
      state.hydrationLogs
        .filter((h) => toLocalDateKey(h.timestamp) === selectedDateKey)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [state.hydrationLogs, selectedDateKey]
  );

  const totalDayHydrationMl = dayHydration.reduce((s, h) => s + h.amountMl, 0);

  const sevenDayNourishment = useMemo(() => {
    const [y, m, d] = selectedDateKey.split('-').map(Number);
    const base = new Date(y, (m || 1) - 1, d || 1);
    const rows: {
      dateKey: string;
      label: string;
      breakfast: boolean;
      lunch: boolean;
      dinner: boolean;
      snackCount: number;
      total: number;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(base);
      dt.setDate(base.getDate() - i);
      const key = toLocalDateKey(dt);
      const meals = state.meals.filter((item) => toLocalDateKey(item.timestamp) === key);
      rows.push({
        dateKey: key,
        label: new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' }).format(dt),
        breakfast: meals.some((item) => item.category === 'breakfast'),
        lunch: meals.some((item) => item.category === 'lunch'),
        dinner: meals.some((item) => item.category === 'dinner'),
        snackCount: meals.filter((item) => item.category === 'snack').length,
        total: meals.length,
      });
    }
    return rows;
  }, [state.meals, selectedDateKey]);

  const reminderState = useMemo(
    () => computeTodayReminders(state.preferences, state.meals, state.hydrationLogs),
    [state.preferences, state.meals, state.hydrationLogs]
  );

  const overnightGaps = useMemo(
    () => (state.preferences.showOvernightMealGap ? computeOvernightMealGaps(state.meals).slice(0, 7) : []),
    [state.meals, state.preferences.showOvernightMealGap]
  );

  const handleDismissReminder = async (slotId: ReminderSlotId) => {
    const todayKey = toLocalDateKey(new Date());
    const currentMap = state.preferences.dismissedReminders ?? {};
    const existingForDay = currentMap[todayKey] ?? [];
    if (existingForDay.includes(slotId)) return;
    await onUpdatePreferences({
      dismissedReminders: {
        ...currentMap,
        [todayKey]: [...existingForDay, slotId],
      },
    });
  };

  const handleRestoreDismissedToday = async () => {
    const todayKey = toLocalDateKey(new Date());
    const nextMap = { ...(state.preferences.dismissedReminders ?? {}) };
    delete nextMap[todayKey];
    await onUpdatePreferences({ dismissedReminders: nextMap });
  };

  const handleModalSaveMeal = async (meal: Omit<MealRecord, 'createdAt'>, existingId?: string) => {
    if (existingId) {
      await onUpdateMeal(existingId, meal);
    } else {
      await onCreateMeal(meal);
    }
    setSelectedDateKey(toLocalDateKey(meal.timestamp));
  };

  const handleMealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMealError('');
    const title = mealTitle.trim();
    if (!title) {
      setMealError('Please enter what you ate for this meal.');
      return;
    }

    const timestamp = combineLocalDateAndTime(selectedDateKey, mealTime);
    setSavingMeal(true);
    try {
      if (editingMealId) {
        await onUpdateMeal(editingMealId, {
          category: mealCategory,
          title,
          timestamp,
          notes: mealNotes.trim(),
        });
        setEditingMealId(null);
      } else {
        await onCreateMeal({
          id: crypto.randomUUID(),
          category: mealCategory,
          title,
          timestamp,
          notes: mealNotes.trim(),
        });
      }
      setMealTitle('');
      setMealNotes('');
    } catch (err) {
      setMealError(err instanceof Error ? err.message : 'Unable to save meal.');
    } finally {
      setSavingMeal(false);
    }
  };

  const handleEditMeal = (meal: MealRecord) => {
    setEditingMealId(meal.id);
    setMealCategory(meal.category);
    setMealTitle(meal.title);
    setMealTime(toLocalTimeInput(meal.timestamp));
    setMealNotes(meal.notes);
  };

  const handleCustomHydration = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = Number(customMl);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const ml = unitSystem === 'imperial' ? Math.round(raw / 0.0338140227) : Math.round(raw);
    await onAddHydration(Math.min(5000, Math.max(1, ml)));
  };

  const handleSaveWellness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWellness(true);
    setWellnessSavedMsg('');
    try {
      const parsedSleep =
        sleepHours.trim() !== '' && Number.isFinite(Number(sleepHours))
          ? Math.max(0, Math.min(1440, Math.round(Number(sleepHours) * 60)))
          : null;
      const parsedSteps =
        dailySteps.trim() !== '' && Number.isFinite(Number(dailySteps))
          ? Math.max(0, Math.round(Number(dailySteps)))
          : null;
      await onUpsertWellness({
        dateKey: selectedDateKey,
        steps: parsedSteps,
        sleepMinutes: parsedSleep,
        bedtime: bedtime || null,
        wakeTime: wakeTime || null,
        sleepQuality,
        recoveryNotes: recoveryNotes.trim(),
      });
      setWellnessSavedMsg('Sleep & recovery entry saved.');
    } finally {
      setSavingWellness(false);
    }
  };

  if (subView === 'reminder-settings') {
    return (
      <ReminderSettingsView
        preferences={state.preferences}
        onBack={() => setSubView('journal')}
        onSavePreferences={onUpdatePreferences}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-secondary-text)]">
            Lifestyle &amp; Recovery
          </p>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-[var(--text-main)] mt-1">
            Nourishment &amp; Rhythm
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Supportive, regular fueling, hydration, and restorative sleep without restrictive targets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setSubView('reminder-settings')}
            className="h-10 px-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent-secondary)] flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent-secondary-text)]" />
            Reminder Settings
          </button>

          <div className="flex items-center gap-2">
            <label htmlFor="wellness-date" className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
              Journal Date
            </label>
            <input
              id="wellness-date"
              type="date"
              value={selectedDateKey}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-10 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
            />
          </div>
        </div>
      </header>

      {/* Functional Gentle Meal Rhythm Reminder Section */}
      <section
        aria-label="Gentle Meal Rhythm Reminder"
        className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Bell className="w-4 h-4 text-[var(--accent-secondary-text)] mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-display font-bold text-[var(--text-main)]">
                Gentle Meal Rhythm Reminder
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {state.preferences.mealRemindersEnabled
                  ? `Local schedule (${getLocalTimezoneName()}) · Completed meals automatically clear for today.`
                  : 'Reminders are currently paused. Enable them in Reminder Settings to receive rhythm prompts.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {reminderState.dismissedCountToday > 0 && (
              <button
                type="button"
                onClick={handleRestoreDismissedToday}
                className="h-9 px-3 rounded-lg text-xs font-medium text-[var(--accent-secondary-text)] hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore Dismissed ({reminderState.dismissedCountToday})
              </button>
            )}
            <button
              type="button"
              onClick={() => setSubView('reminder-settings')}
              className="h-9 px-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-main)] hover:border-[var(--accent-secondary)] whitespace-nowrap"
            >
              Edit Preferences
            </button>
          </div>
        </div>

        {state.preferences.mealRemindersEnabled && reminderState.dueReminders.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reminderState.dueReminders.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (item.kind === 'meal' && item.category) {
                    setSelectedDateKey(toLocalDateKey(new Date()));
                    setModalEditMeal(null);
                    setModalMealCategory(item.category);
                  } else if (item.kind === 'hydration') {
                    onAddHydration(250, 'Hydration reminder check-in');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (item.kind === 'meal' && item.category) {
                      setSelectedDateKey(toLocalDateKey(new Date()));
                      setModalEditMeal(null);
                      setModalMealCategory(item.category);
                    } else if (item.kind === 'hydration') {
                      onAddHydration(250, 'Hydration reminder check-in');
                    }
                  }
                }}
                className="rounded-xl bg-[var(--bg-card)] border border-[var(--accent-secondary-border)] p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-[var(--accent-primary)] transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--accent-secondary-text)]">{item.label}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{item.scheduledTime}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{item.description}</p>
                </div>

                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.kind === 'meal' && item.category ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDateKey(toLocalDateKey(new Date()));
                        setModalEditMeal(null);
                        setModalMealCategory(item.category!);
                      }}
                      className="h-9 px-3.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-xs font-semibold whitespace-nowrap"
                    >
                      Log {item.label}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAddHydration(250, 'Hydration reminder check-in')}
                      className="h-9 px-3.5 rounded-lg bg-[var(--accent-secondary)] text-[var(--accent-secondary-ink)] text-xs font-semibold whitespace-nowrap"
                    >
                      + {formatHydration(250, unitSystem)}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDismissReminder(item.id)}
                    aria-label={`Dismiss ${item.label} reminder`}
                    title="Dismiss for today"
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Today's Meal Rhythm Quick-Log Strip (Always actionable for Breakfast, Lunch, Dinner, Snack) */}
        {state.preferences.mealRemindersEnabled && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-secondary)] mr-1">Today&apos;s rhythm:</span>
            {MEAL_CATEGORIES.map((cat) => {
              const slot = reminderState.allSlots.find((s) => s.id === cat.id);
              const isLogged = state.meals.some(
                (m) => toLocalDateKey(m.timestamp) === toLocalDateKey(new Date()) && m.category === cat.id
              );
              const timeStr = state.preferences.mealReminderTimes[cat.id];
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedDateKey(toLocalDateKey(new Date()));
                    setModalEditMeal(null);
                    setModalMealCategory(cat.id);
                  }}
                  className={`h-9 px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    isLogged
                      ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]'
                      : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-main)] hover:border-[var(--accent-primary)]'
                  }`}
                >
                  {isLogged && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                  <span>{isLogged ? `${cat.label} logged` : `Log ${cat.label}`}</span>
                  {slot && !isLogged && (
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">· {timeStr}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Top Split: Hydration Tracker & Sleep/Recovery Journal (Icy Blue accents) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-[var(--accent-secondary-text)]" />
            <h2 className="text-base font-display font-bold text-[var(--text-main)]">Hydration Tracker</h2>
          </div>

          <div className="flex items-center gap-5">
            <ProgressRing
              progress={
                state.preferences.dailyHydrationGoalMl > 0
                  ? totalDayHydrationMl / state.preferences.dailyHydrationGoalMl
                  : 0
              }
              size={84}
              strokeColor="var(--accent-secondary)"
              label="Hydration progress"
            />
            <div>
              <p className="text-2xl font-bold font-mono tabular-nums text-[var(--text-main)]">
                {formatHydration(totalDayHydrationMl, unitSystem)}
              </p>
              <p className="text-xs text-[var(--text-secondary)] font-mono tabular-nums mt-0.5">
                Daily goal {formatHydration(state.preferences.dailyHydrationGoalMl, unitSystem)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[250, 500, 750].map((ml) => (
              <button
                key={ml}
                type="button"
                onClick={() => onAddHydration(ml)}
                className="h-10 px-3.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-main)] hover:border-[var(--accent-secondary)] transition-colors active:scale-[0.98] whitespace-nowrap"
              >
                + {formatHydration(ml, unitSystem)}
              </button>
            ))}
          </div>

          <form onSubmit={handleCustomHydration} className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="5000"
              step="1"
              value={customMl}
              onChange={(e) => setCustomMl(e.target.value)}
              aria-label="Custom hydration amount"
              className="flex-1 h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
            />
            <button
              type="submit"
              className="h-10 px-4 rounded-lg bg-[var(--accent-secondary)] text-[var(--accent-secondary-ink)] text-xs font-semibold hover:opacity-90 whitespace-nowrap"
            >
              Add {unitSystem === 'imperial' ? 'fl oz' : 'ml'}
            </button>
          </form>

          {dayHydration.length > 0 && (
            <div className="divide-y divide-[var(--border-subtle)] pt-3 border-t border-[var(--border-subtle)] max-h-40 overflow-y-auto">
              {dayHydration.map((h: HydrationRecord) => (
                <div key={h.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="font-mono tabular-nums text-[var(--text-main)]">
                    {formatHydration(h.amountMl, unitSystem)} ·{' '}
                    <span className="text-[var(--text-secondary)]">{formatDisplayTime(h.timestamp)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteHydration(h.id)}
                    className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--danger-text)]"
                    aria-label="Remove hydration entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sleep & Recovery Journal */}
        <section className="lg:col-span-7 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Moon className="w-4 h-4 text-[var(--accent-secondary-text)]" />
            <h2 className="text-base font-display font-bold text-[var(--text-main)]">
              Sleep &amp; Recovery Journal
            </h2>
          </div>

          <form onSubmit={handleSaveWellness} className="space-y-4">
            {wellnessSavedMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] px-3 py-2 text-xs text-[var(--text-main)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
                <span>{wellnessSavedMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="w-sleep" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Sleep (hours)
                </label>
                <input
                  id="w-sleep"
                  type="number"
                  min="0"
                  max="24"
                  step="0.1"
                  placeholder="7.5"
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
              <div>
                <label htmlFor="w-steps" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Daily Steps
                </label>
                <input
                  id="w-steps"
                  type="number"
                  min="0"
                  max="200000"
                  step="1"
                  placeholder="8000"
                  value={dailySteps}
                  onChange={(e) => setDailySteps(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
              <div>
                <label htmlFor="w-bed" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Bedtime
                </label>
                <input
                  id="w-bed"
                  type="time"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
              <div>
                <label htmlFor="w-wake" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Wake Time
                </label>
                <input
                  id="w-wake"
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="w-qual" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Recovery Check-In
                </label>
                <select
                  id="w-qual"
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(e.target.value as 'rested' | 'moderate' | 'tired')}
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)]"
                >
                  <option value="rested">Rested &amp; ready</option>
                  <option value="moderate">Moderate energy</option>
                  <option value="tired">Tired — prioritize rest</option>
                </select>
              </div>
              <div>
                <label htmlFor="w-notes" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Recovery Notes
                </label>
                <input
                  id="w-notes"
                  type="text"
                  value={recoveryNotes}
                  onChange={(e) => setRecoveryNotes(e.target.value)}
                  placeholder="Mobility, soreness, energy..."
                  className="w-full h-10 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingWellness}
                className="h-10 px-5 rounded-lg bg-[var(--accent-secondary)] text-[var(--accent-secondary-ink)] hover:opacity-90 text-xs font-bold transition-opacity active:scale-[0.98] whitespace-nowrap"
              >
                {savingWellness ? 'Saving...' : 'Save Recovery Entry'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Meal Journal & Weekly Nourishment Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4 border-t border-[var(--border-subtle)] items-start">
        <section className="lg:col-span-7 space-y-6">
          <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Utensils className="w-4 h-4 text-[var(--accent-primary-text)]" />
              <h2 className="text-base font-display font-bold text-[var(--text-main)]">
                {editingMealId ? 'Edit Meal Entry' : 'Meal Journal'}
              </h2>
            </div>

            <form onSubmit={handleMealSubmit} className="space-y-4">
              {mealError && (
                <div className="rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] px-3 py-2 text-xs text-[var(--danger-text)]">
                  {mealError}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MEAL_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setMealCategory(cat.id)}
                    className={`h-10 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                      mealCategory === cat.id
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] border-[var(--accent-primary)] font-semibold'
                        : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="meal-title" className="block text-xs text-[var(--text-secondary)] mb-1">
                    What did you enjoy?
                  </label>
                  <input
                    id="meal-title"
                    type="text"
                    value={mealTitle}
                    onChange={(e) => setMealTitle(e.target.value)}
                    placeholder="e.g. Grilled salmon, quinoa, roasted greens"
                    maxLength={120}
                    required
                    className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70"
                  />
                </div>
                <div>
                  <label htmlFor="meal-time" className="block text-xs text-[var(--text-secondary)] mb-1">
                    Timestamp
                  </label>
                  <input
                    id="meal-time"
                    type="time"
                    value={mealTime}
                    onChange={(e) => setMealTime(e.target.value)}
                    required
                    className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="meal-notes" className="block text-xs text-[var(--text-secondary)] mb-1">
                  Reflections (energy, satisfaction — optional)
                </label>
                <input
                  id="meal-notes"
                  type="text"
                  value={mealNotes}
                  onChange={(e) => setMealNotes(e.target.value)}
                  placeholder="Optional notes..."
                  maxLength={1000}
                  className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                {editingMealId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMealId(null);
                      setMealTitle('');
                      setMealNotes('');
                    }}
                    className="h-10 px-4 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingMeal}
                  className="h-11 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-sm font-semibold flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  {savingMeal ? 'Saving...' : editingMealId ? 'Update Meal' : 'Log Meal'}
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-display font-bold text-[var(--text-main)]">
                Meals · {formatDisplayDate(combineLocalDateAndTime(selectedDateKey, '12:00'))}
              </h3>
              <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                {dayMeals.length} {dayMeals.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {dayMeals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 text-center">
                <p className="text-sm text-[var(--text-main)]">No meals logged for this date yet</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Honor your appetite and log meals to notice supportive daily rhythms.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                {dayMeals.map((meal) => (
                  <div key={meal.id} className="py-3.5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--accent-primary-text)] capitalize">
                          {meal.category}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatDisplayTime(meal.timestamp)}</span>
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-main)] mt-0.5">{meal.title}</p>
                      {meal.notes && <p className="text-xs text-[var(--text-secondary)] mt-1">{meal.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditMeal(meal)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                        aria-label={`Edit ${meal.title}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteMeal(meal.id)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--danger-text)]"
                        aria-label={`Delete ${meal.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Weekly Nourishment Patterns + Optional Informational Gap History */}
        <section className="lg:col-span-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-display font-bold text-[var(--text-main)]">
              Weekly Nourishment Patterns
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Consistency across breakfast, lunch, dinner, and snacks.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="py-2 pr-2 font-medium">Day</th>
                  <th className="py-2 px-2 font-medium text-center">B</th>
                  <th className="py-2 px-2 font-medium text-center">L</th>
                  <th className="py-2 px-2 font-medium text-center">D</th>
                  <th className="py-2 px-2 font-medium text-right">Snacks</th>
                  <th className="py-2 pl-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sevenDayNourishment.map((row) => (
                  <tr key={row.dateKey}>
                    <td className="py-2.5 pr-2 font-mono tabular-nums text-[var(--text-main)]">{row.label}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: row.breakfast ? 'var(--accent-primary)' : 'var(--chart-track)',
                        }}
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: row.lunch ? 'var(--accent-primary)' : 'var(--chart-track)',
                        }}
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: row.dinner ? 'var(--accent-primary)' : 'var(--chart-track)',
                        }}
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[var(--accent-secondary-text)]">
                      {row.snackCount}
                    </td>
                    <td className="py-2.5 pl-2 text-right font-mono tabular-nums font-semibold text-[var(--text-main)]">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-[var(--accent-secondary-text)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-main)]">Overnight Meal-Gap History</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Informational only — shows natural overnight intervals between evening and morning meals with zero targets.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state.preferences.showOvernightMealGap}
                onClick={() =>
                  onUpdatePreferences({ showOvernightMealGap: !state.preferences.showOvernightMealGap })
                }
                className={`h-9 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 border ${
                  state.preferences.showOvernightMealGap
                    ? 'bg-[var(--accent-secondary-soft)] text-[var(--accent-secondary-text)] border-[var(--accent-secondary-border)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                {state.preferences.showOvernightMealGap ? 'Shown' : 'Hidden'}
              </button>
            </div>

            {state.preferences.showOvernightMealGap && (
              <div className="mt-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-3">
                {overnightGaps.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Log evening and morning meals on consecutive days to view your natural overnight rhythm.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {overnightGaps.map((gap) => (
                      <div key={gap.dateKey} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)] font-mono tabular-nums">
                          {gap.dateKey} · {formatDisplayTime(gap.eveningMealTime)} → {formatDisplayTime(gap.morningMealTime)}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-[var(--text-main)]">
                          {formatSleepMinutes(gap.gapMinutes)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {modalMealCategory && (
        <MealFormModal
          initialCategory={modalMealCategory}
          initialDateKey={toLocalDateKey(new Date())}
          initialMeal={modalEditMeal}
          onClose={() => {
            setModalMealCategory(null);
            setModalEditMeal(null);
          }}
          onSave={handleModalSaveMeal}
        />
      )}
    </div>
  );
}
