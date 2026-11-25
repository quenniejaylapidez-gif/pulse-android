import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import type {
  ActivityRecord,
  ActivityType,
  DailyWellnessRecord,
  HydrationRecord,
  MealCategory,
  MealRecord,
  PulseAppState,
  UserPreferences,
  UserProfile,
} from './src/types/pulse';

dotenv.config();

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.pulse_data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULT_AVATAR = '/src/assets/images/athlete_profile_avatar_1795607428880.jpg';

const VALID_ACTIVITY_TYPES: ActivityType[] = [
  'walking',
  'running',
  'cycling',
  'hiking',
  'swimming',
  'indoor',
  'strength',
  'other',
];

const VALID_MEAL_CATEGORIES: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function createEmptyState(): PulseAppState {
  return {
    profile: {
      name: 'Athlete',
      bio: 'Moving with intention and consistency.',
      photoUrl: DEFAULT_AVATAR,
      preferredActivity: 'running',
    },
    preferences: {
      theme: 'midnight-mint',
      unitSystem: 'metric',
      dailyStepGoal: 8000,
      dailyHydrationGoalMl: 2250,
      weeklyDurationGoalMinutes: 150,
      mealRemindersEnabled: true,
      mealReminderEnabledMap: {
        breakfast: true,
        lunch: true,
        dinner: true,
        snack: false,
      },
      mealReminderTimes: {
        breakfast: '08:00',
        lunch: '12:30',
        dinner: '18:30',
        snack: '15:30',
      },
      hydrationRemindersEnabled: false,
      hydrationReminderIntervalMinutes: 120,
      hydrationReminderStartTime: '09:00',
      hydrationReminderEndTime: '20:00',
      browserNotificationsEnabled: false,
      dismissedReminders: {},
      showOvernightMealGap: false,
      shareActivitiesPublicly: false,
      shareLocationRoutes: false,
    },
    activities: [],
    meals: [],
    hydrationLogs: [],
    wellnessLogs: [],
  };
}

function ensureStore(): PulseAppState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    const initial = createEmptyState();
    writeStoreAtomic(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PulseAppState>;
    const empty = createEmptyState();
    return {
      profile: { ...empty.profile, ...(parsed.profile ?? {}) },
      preferences: {
        ...empty.preferences,
        ...(parsed.preferences ?? {}),
        mealReminderEnabledMap: {
          ...empty.preferences.mealReminderEnabledMap,
          ...(parsed.preferences?.mealReminderEnabledMap ?? {}),
        },
        mealReminderTimes: {
          ...empty.preferences.mealReminderTimes,
          ...(parsed.preferences?.mealReminderTimes ?? {}),
        },
        dismissedReminders:
          parsed.preferences?.dismissedReminders && typeof parsed.preferences.dismissedReminders === 'object'
            ? parsed.preferences.dismissedReminders
            : empty.preferences.dismissedReminders,
      },
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      meals: Array.isArray(parsed.meals) ? parsed.meals : [],
      hydrationLogs: Array.isArray(parsed.hydrationLogs) ? parsed.hydrationLogs : [],
      wellnessLogs: Array.isArray(parsed.wellnessLogs) ? parsed.wellnessLogs : [],
    };
  } catch {
    const fallback = createEmptyState();
    writeStoreAtomic(fallback);
    return fallback;
  }
}

function writeStoreAtomic(state: PulseAppState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${STORE_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STORE_FILE);
}

let dbState: PulseAppState = ensureStore();

function isIsoDate(val: unknown): val is string {
  if (typeof val !== 'string' || !val.trim()) return false;
  return !Number.isNaN(new Date(val).getTime());
}

function sanitizeActivity(input: unknown): { ok: true; value: ActivityRecord } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid activity payload.' };
  }
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim().slice(0, 128) : '';
  if (!id) return { ok: false, error: 'Activity ID is required.' };

  const type = raw.type as ActivityType;
  if (!VALID_ACTIVITY_TYPES.includes(type)) {
    return { ok: false, error: 'Unsupported activity type.' };
  }

  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '';
  if (!title) return { ok: false, error: 'Activity title is required.' };

  const source = raw.source === 'recorded' || raw.source === 'manual' ? raw.source : null;
  if (!source) return { ok: false, error: 'Activity source must be recorded or manual.' };

  if (!isIsoDate(raw.startedAt) || !isIsoDate(raw.endedAt)) {
    return { ok: false, error: 'Valid start and end timestamps are required.' };
  }

  const durationSeconds = Number(raw.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 86400 * 7) {
    return { ok: false, error: 'Duration must be greater than 0 seconds.' };
  }

  const pausedSeconds = raw.pausedSeconds != null ? Math.max(0, Number(raw.pausedSeconds) || 0) : 0;

  let distanceMeters: number | null = null;
  if (raw.distanceMeters !== null && raw.distanceMeters !== undefined && raw.distanceMeters !== '') {
    const dist = Number(raw.distanceMeters);
    if (!Number.isFinite(dist) || dist < 0 || dist > 1000000) {
      return { ok: false, error: 'Distance must be a valid non-negative number.' };
    }
    distanceMeters = Math.round(dist * 100) / 100;
  }

  let elevationGainMeters: number | null = null;
  if (raw.elevationGainMeters !== null && raw.elevationGainMeters !== undefined && raw.elevationGainMeters !== '') {
    const elev = Number(raw.elevationGainMeters);
    if (!Number.isFinite(elev) || elev < 0 || elev > 30000) {
      return { ok: false, error: 'Elevation gain must be a valid non-negative number.' };
    }
    elevationGainMeters = Math.round(elev * 10) / 10;
  }

  let avgHeartRateBpm: number | null = null;
  if (raw.avgHeartRateBpm !== null && raw.avgHeartRateBpm !== undefined && raw.avgHeartRateBpm !== '') {
    const hr = Math.round(Number(raw.avgHeartRateBpm));
    if (!Number.isFinite(hr) || hr < 25 || hr > 250) {
      return { ok: false, error: 'Heart rate must be between 25 and 250 bpm.' };
    }
    avgHeartRateBpm = hr;
  }

  let steps: number | null = null;
  if (raw.steps !== null && raw.steps !== undefined && raw.steps !== '') {
    const st = Math.round(Number(raw.steps));
    if (!Number.isFinite(st) || st < 0 || st > 500000) {
      return { ok: false, error: 'Steps must be a non-negative integer.' };
    }
    steps = st;
  }

  const routePoints = Array.isArray(raw.routePoints)
    ? raw.routePoints
        .filter(
          (pt): pt is { lat: number; lng: number; altitude?: number | null; timestamp: number; accuracy?: number | null } =>
            Boolean(pt) &&
            typeof pt === 'object' &&
            Number.isFinite((pt as { lat?: unknown }).lat) &&
            Number.isFinite((pt as { lng?: unknown }).lng) &&
            Number.isFinite((pt as { timestamp?: unknown }).timestamp)
        )
        .slice(0, 15000)
        .map((pt) => ({
          lat: pt.lat,
          lng: pt.lng,
          altitude: typeof pt.altitude === 'number' && Number.isFinite(pt.altitude) ? pt.altitude : null,
          timestamp: pt.timestamp,
          accuracy: typeof pt.accuracy === 'number' && Number.isFinite(pt.accuracy) ? pt.accuracy : null,
        }))
    : [];

  const nowIso = new Date().toISOString();

  return {
    ok: true,
    value: {
      id,
      type,
      title,
      source,
      startedAt: new Date(raw.startedAt).toISOString(),
      endedAt: new Date(raw.endedAt).toISOString(),
      durationSeconds: Math.round(durationSeconds),
      pausedSeconds: Math.round(pausedSeconds),
      distanceMeters,
      elevationGainMeters,
      avgHeartRateBpm,
      steps,
      notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 2000) : '',
      routePoints,
      gpsPermissionState:
        raw.gpsPermissionState === 'granted' ||
        raw.gpsPermissionState === 'denied' ||
        raw.gpsPermissionState === 'unavailable' ||
        raw.gpsPermissionState === 'not_requested'
          ? raw.gpsPermissionState
          : 'not_requested',
      createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : nowIso,
      updatedAt: nowIso,
    },
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/public-config', (_req, res) => {
    const googleMapsApiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({ googleMapsApiKey });
  });

  app.get('/api/state', (_req, res) => {
    res.json(dbState);
  });

  app.put('/api/profile', (req, res) => {
    const body = req.body as { profile?: Partial<UserProfile>; preferences?: Partial<UserPreferences> };
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid profile payload.' });
      return;
    }

    if (body.profile) {
      const nextName = typeof body.profile.name === 'string' ? body.profile.name.trim().slice(0, 80) : dbState.profile.name;
      if (!nextName) {
        res.status(400).json({ error: 'Display name cannot be empty.' });
        return;
      }
      const nextBio = typeof body.profile.bio === 'string' ? body.profile.bio.trim().slice(0, 280) : dbState.profile.bio;
      const nextPhoto = typeof body.profile.photoUrl === 'string' ? body.profile.photoUrl.slice(0, 1_500_000) : dbState.profile.photoUrl;
      const nextPrefActivity =
        body.profile.preferredActivity && VALID_ACTIVITY_TYPES.includes(body.profile.preferredActivity)
          ? body.profile.preferredActivity
          : dbState.profile.preferredActivity;
      dbState.profile = {
        name: nextName,
        bio: nextBio,
        photoUrl: nextPhoto,
        preferredActivity: nextPrefActivity,
      };
    }

    if (body.preferences) {
      const p = body.preferences;
      const validThemes = ['midnight-mint', 'ocean-blue', 'forest-green', 'light'] as const;
      const nextTheme =
        p.theme && (validThemes as readonly string[]).includes(p.theme) ? p.theme : dbState.preferences.theme;

      const sanitizeTime = (val: unknown, fallback: string) =>
        typeof val === 'string' && /^\d{2}:\d{2}$/.test(val.trim()) ? val.trim() : fallback;

      let nextDismissed = dbState.preferences.dismissedReminders;
      if (p.dismissedReminders && typeof p.dismissedReminders === 'object') {
        const cleaned: Record<string, string[]> = {};
        const entries = Object.entries(p.dismissedReminders).slice(-14);
        for (const [dateKey, ids] of entries) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && Array.isArray(ids)) {
            cleaned[dateKey] = ids
              .filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 32)
              .slice(0, 10);
          }
        }
        nextDismissed = cleaned;
      }

      dbState.preferences = {
        theme: nextTheme,
        unitSystem: p.unitSystem === 'imperial' || p.unitSystem === 'metric' ? p.unitSystem : dbState.preferences.unitSystem,
        dailyStepGoal:
          p.dailyStepGoal != null && Number.isFinite(Number(p.dailyStepGoal))
            ? Math.max(500, Math.min(100000, Math.round(Number(p.dailyStepGoal))))
            : dbState.preferences.dailyStepGoal,
        dailyHydrationGoalMl:
          p.dailyHydrationGoalMl != null && Number.isFinite(Number(p.dailyHydrationGoalMl))
            ? Math.max(500, Math.min(10000, Math.round(Number(p.dailyHydrationGoalMl))))
            : dbState.preferences.dailyHydrationGoalMl,
        weeklyDurationGoalMinutes:
          p.weeklyDurationGoalMinutes != null && Number.isFinite(Number(p.weeklyDurationGoalMinutes))
            ? Math.max(15, Math.min(5000, Math.round(Number(p.weeklyDurationGoalMinutes))))
            : dbState.preferences.weeklyDurationGoalMinutes,
        mealRemindersEnabled:
          typeof p.mealRemindersEnabled === 'boolean' ? p.mealRemindersEnabled : dbState.preferences.mealRemindersEnabled,
        mealReminderEnabledMap: p.mealReminderEnabledMap
          ? {
              breakfast:
                typeof p.mealReminderEnabledMap.breakfast === 'boolean'
                  ? p.mealReminderEnabledMap.breakfast
                  : dbState.preferences.mealReminderEnabledMap.breakfast,
              lunch:
                typeof p.mealReminderEnabledMap.lunch === 'boolean'
                  ? p.mealReminderEnabledMap.lunch
                  : dbState.preferences.mealReminderEnabledMap.lunch,
              dinner:
                typeof p.mealReminderEnabledMap.dinner === 'boolean'
                  ? p.mealReminderEnabledMap.dinner
                  : dbState.preferences.mealReminderEnabledMap.dinner,
              snack:
                typeof p.mealReminderEnabledMap.snack === 'boolean'
                  ? p.mealReminderEnabledMap.snack
                  : dbState.preferences.mealReminderEnabledMap.snack,
            }
          : dbState.preferences.mealReminderEnabledMap,
        mealReminderTimes: p.mealReminderTimes
          ? {
              breakfast: sanitizeTime(p.mealReminderTimes.breakfast, dbState.preferences.mealReminderTimes.breakfast),
              lunch: sanitizeTime(p.mealReminderTimes.lunch, dbState.preferences.mealReminderTimes.lunch),
              dinner: sanitizeTime(p.mealReminderTimes.dinner, dbState.preferences.mealReminderTimes.dinner),
              snack: sanitizeTime(p.mealReminderTimes.snack, dbState.preferences.mealReminderTimes.snack),
            }
          : dbState.preferences.mealReminderTimes,
        hydrationRemindersEnabled:
          typeof p.hydrationRemindersEnabled === 'boolean'
            ? p.hydrationRemindersEnabled
            : dbState.preferences.hydrationRemindersEnabled,
        hydrationReminderIntervalMinutes:
          p.hydrationReminderIntervalMinutes != null && Number.isFinite(Number(p.hydrationReminderIntervalMinutes))
            ? Math.max(30, Math.min(480, Math.round(Number(p.hydrationReminderIntervalMinutes))))
            : dbState.preferences.hydrationReminderIntervalMinutes,
        hydrationReminderStartTime: sanitizeTime(
          p.hydrationReminderStartTime,
          dbState.preferences.hydrationReminderStartTime
        ),
        hydrationReminderEndTime: sanitizeTime(
          p.hydrationReminderEndTime,
          dbState.preferences.hydrationReminderEndTime
        ),
        browserNotificationsEnabled:
          typeof p.browserNotificationsEnabled === 'boolean'
            ? p.browserNotificationsEnabled
            : dbState.preferences.browserNotificationsEnabled,
        dismissedReminders: nextDismissed,
        showOvernightMealGap:
          typeof p.showOvernightMealGap === 'boolean' ? p.showOvernightMealGap : dbState.preferences.showOvernightMealGap,
        shareActivitiesPublicly:
          typeof p.shareActivitiesPublicly === 'boolean'
            ? p.shareActivitiesPublicly
            : dbState.preferences.shareActivitiesPublicly,
        shareLocationRoutes:
          typeof p.shareLocationRoutes === 'boolean' ? p.shareLocationRoutes : dbState.preferences.shareLocationRoutes,
      };
    }

    writeStoreAtomic(dbState);
    res.json({ profile: dbState.profile, preferences: dbState.preferences });
  });

  app.post('/api/activities', (req, res) => {
    const parsed = sanitizeActivity(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    // Prevent duplicate activity records by id or identical start+title+duration within 10s
    const existing = dbState.activities.find(
      (a) =>
        a.id === parsed.value.id ||
        (a.startedAt === parsed.value.startedAt &&
          a.type === parsed.value.type &&
          a.durationSeconds === parsed.value.durationSeconds &&
          a.title === parsed.value.title)
    );
    if (existing) {
      res.status(200).json({ activity: existing, deduplicated: true });
      return;
    }

    dbState.activities = [parsed.value, ...dbState.activities];
    writeStoreAtomic(dbState);
    res.status(201).json({ activity: parsed.value, deduplicated: false });
  });

  app.put('/api/activities/:id', (req, res) => {
    const id = req.params.id;
    const idx = dbState.activities.findIndex((a) => a.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Activity not found.' });
      return;
    }
    const existing = dbState.activities[idx];
    const parsed = sanitizeActivity({
      ...existing,
      ...req.body,
      id,
      createdAt: existing.createdAt,
    });
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    dbState.activities[idx] = parsed.value;
    writeStoreAtomic(dbState);
    res.json({ activity: parsed.value });
  });

  app.delete('/api/activities/:id', (req, res) => {
    const id = req.params.id;
    const before = dbState.activities.length;
    dbState.activities = dbState.activities.filter((a) => a.id !== id);
    if (dbState.activities.length === before) {
      res.status(404).json({ error: 'Activity not found.' });
      return;
    }
    writeStoreAtomic(dbState);
    res.json({ deletedId: id });
  });

  app.post('/api/meals', (req, res) => {
    const body = req.body as Partial<MealRecord>;
    const id = typeof body?.id === 'string' && body.id.trim() ? body.id.trim().slice(0, 128) : '';
    if (!id || !body.category || !VALID_MEAL_CATEGORIES.includes(body.category)) {
      res.status(400).json({ error: 'Valid meal ID and category are required.' });
      return;
    }
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    if (!title) {
      res.status(400).json({ error: 'Meal description is required.' });
      return;
    }
    if (!isIsoDate(body.timestamp)) {
      res.status(400).json({ error: 'Valid meal timestamp is required.' });
      return;
    }

    const existing = dbState.meals.find((m) => m.id === id);
    if (existing) {
      res.status(200).json({ meal: existing, deduplicated: true });
      return;
    }

    const meal: MealRecord = {
      id,
      category: body.category,
      title,
      timestamp: new Date(body.timestamp).toISOString(),
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '',
      createdAt: new Date().toISOString(),
    };
    dbState.meals = [meal, ...dbState.meals];
    writeStoreAtomic(dbState);
    res.status(201).json({ meal });
  });

  app.put('/api/meals/:id', (req, res) => {
    const id = req.params.id;
    const idx = dbState.meals.findIndex((m) => m.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Meal not found.' });
      return;
    }
    const existing = dbState.meals[idx];
    const body = req.body as Partial<MealRecord>;
    const category = body.category && VALID_MEAL_CATEGORIES.includes(body.category) ? body.category : existing.category;
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : existing.title;
    if (!title) {
      res.status(400).json({ error: 'Meal description is required.' });
      return;
    }
    const timestamp = isIsoDate(body.timestamp) ? new Date(body.timestamp).toISOString() : existing.timestamp;
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : existing.notes;
    const updated: MealRecord = { ...existing, category, title, timestamp, notes };
    dbState.meals[idx] = updated;
    writeStoreAtomic(dbState);
    res.json({ meal: updated });
  });

  app.delete('/api/meals/:id', (req, res) => {
    const id = req.params.id;
    const before = dbState.meals.length;
    dbState.meals = dbState.meals.filter((m) => m.id !== id);
    if (dbState.meals.length === before) {
      res.status(404).json({ error: 'Meal not found.' });
      return;
    }
    writeStoreAtomic(dbState);
    res.json({ deletedId: id });
  });

  app.post('/api/hydration', (req, res) => {
    const body = req.body as Partial<HydrationRecord>;
    const id = typeof body?.id === 'string' && body.id.trim() ? body.id.trim().slice(0, 128) : '';
    const amountMl = Number(body?.amountMl);
    if (!id || !Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 5000) {
      res.status(400).json({ error: 'Valid hydration ID and amount (1-5000 ml) are required.' });
      return;
    }
    const existing = dbState.hydrationLogs.find((h) => h.id === id);
    if (existing) {
      res.status(200).json({ hydration: existing, deduplicated: true });
      return;
    }
    const entry: HydrationRecord = {
      id,
      amountMl: Math.round(amountMl),
      timestamp: isIsoDate(body.timestamp) ? new Date(body.timestamp).toISOString() : new Date().toISOString(),
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '',
    };
    dbState.hydrationLogs = [entry, ...dbState.hydrationLogs];
    writeStoreAtomic(dbState);
    res.status(201).json({ hydration: entry });
  });

  app.delete('/api/hydration/:id', (req, res) => {
    const id = req.params.id;
    const before = dbState.hydrationLogs.length;
    dbState.hydrationLogs = dbState.hydrationLogs.filter((h) => h.id !== id);
    if (dbState.hydrationLogs.length === before) {
      res.status(404).json({ error: 'Hydration entry not found.' });
      return;
    }
    writeStoreAtomic(dbState);
    res.json({ deletedId: id });
  });

  app.post('/api/wellness', (req, res) => {
    const body = req.body as Partial<DailyWellnessRecord>;
    const dateKey = typeof body?.dateKey === 'string' ? body.dateKey.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      res.status(400).json({ error: 'Valid YYYY-MM-DD dateKey is required.' });
      return;
    }

    let steps: number | null = null;
    if (body.steps !== null && body.steps !== undefined && String(body.steps) !== '') {
      const s = Math.round(Number(body.steps));
      if (!Number.isFinite(s) || s < 0 || s > 200000) {
        res.status(400).json({ error: 'Steps must be between 0 and 200,000.' });
        return;
      }
      steps = s;
    }

    let sleepMinutes: number | null = null;
    if (body.sleepMinutes !== null && body.sleepMinutes !== undefined && String(body.sleepMinutes) !== '') {
      const sl = Math.round(Number(body.sleepMinutes));
      if (!Number.isFinite(sl) || sl < 0 || sl > 1440) {
        res.status(400).json({ error: 'Sleep duration must be between 0 and 1440 minutes.' });
        return;
      }
      sleepMinutes = sl;
    }

    const record: DailyWellnessRecord = {
      dateKey,
      steps,
      sleepMinutes,
      bedtime: typeof body.bedtime === 'string' && body.bedtime.trim() ? body.bedtime.trim().slice(0, 5) : null,
      wakeTime: typeof body.wakeTime === 'string' && body.wakeTime.trim() ? body.wakeTime.trim().slice(0, 5) : null,
      sleepQuality:
        body.sleepQuality === 'rested' || body.sleepQuality === 'moderate' || body.sleepQuality === 'tired'
          ? body.sleepQuality
          : null,
      recoveryNotes: typeof body.recoveryNotes === 'string' ? body.recoveryNotes.trim().slice(0, 1000) : '',
      updatedAt: new Date().toISOString(),
    };

    const idx = dbState.wellnessLogs.findIndex((w) => w.dateKey === dateKey);
    if (idx >= 0) {
      dbState.wellnessLogs[idx] = record;
    } else {
      dbState.wellnessLogs = [record, ...dbState.wellnessLogs];
    }
    writeStoreAtomic(dbState);
    res.json({ wellness: record });
  });

  app.get('/api/export', (_req, res) => {
    res.json({
      app: 'PULSE',
      exportedAt: new Date().toISOString(),
      ...dbState,
    });
  });

  app.delete('/api/account', (_req, res) => {
    dbState = createEmptyState();
    writeStoreAtomic(dbState);
    res.json({ reset: true, state: dbState });
  });

  // Serve frontend (Vite middleware in dev, dist/ in production)
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PULSE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PULSE server:', err);
  process.exit(1);
});
