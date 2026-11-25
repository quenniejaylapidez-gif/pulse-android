import type {
  ActivityRecord,
  ActivityType,
  DailyWellnessRecord,
  HydrationRecord,
  MealCategory,
  MealRecord,
  PulseAppState,
  RoutePoint,
  UnitSystem,
} from '../types/pulse';

export interface ActivityTypeMeta {
  id: ActivityType;
  label: string;
  isOutdoorDefault: boolean;
  supportsDistance: boolean;
  accentHex: string;
}

export const ACTIVITY_TYPES: ActivityTypeMeta[] = [
  { id: 'running', label: 'Running', isOutdoorDefault: true, supportsDistance: true, accentHex: '#B7F34C' },
  { id: 'walking', label: 'Walking', isOutdoorDefault: true, supportsDistance: true, accentHex: '#7CE38B' },
  { id: 'cycling', label: 'Cycling', isOutdoorDefault: true, supportsDistance: true, accentHex: '#4ADE80' },
  { id: 'hiking', label: 'Hiking', isOutdoorDefault: true, supportsDistance: true, accentHex: '#A3E635' },
  { id: 'swimming', label: 'Swimming', isOutdoorDefault: false, supportsDistance: true, accentHex: '#38BDF8' },
  { id: 'indoor', label: 'Indoor Workouts', isOutdoorDefault: false, supportsDistance: false, accentHex: '#34D399' },
  { id: 'strength', label: 'Strength Training', isOutdoorDefault: false, supportsDistance: false, accentHex: '#FBBF24' },
  { id: 'other', label: 'Other Activities', isOutdoorDefault: false, supportsDistance: true, accentHex: '#94A3B8' },
];

export const ACTIVITY_META_MAP: Record<ActivityType, ActivityTypeMeta> = ACTIVITY_TYPES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<ActivityType, ActivityTypeMeta>
);

export const MEAL_CATEGORIES: { id: MealCategory; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
];

const METERS_PER_MILE = 1609.344;
const KM_TO_MILES = 0.621371192;
const METERS_TO_FEET = 3.280839895;
const ML_TO_FL_OZ = 0.0338140227;

export function toLocalDateKey(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toLocalTimeInput(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '08:00';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function combineLocalDateAndTime(dateKey: string, timeStr: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return dt.toISOString();
}

export function formatDisplayDate(input: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat(undefined, options ?? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

export function formatDisplayTime(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
}

/**
 * Calculates active elapsed milliseconds accurately across pause/resume intervals.
 */
export function calculateActiveElapsedMs(
  startedAtMs: number,
  nowMs: number,
  pausedAtMs: number | null,
  accumulatedPausedMs: number
): number {
  if (startedAtMs <= 0 || nowMs <= startedAtMs) return 0;
  const activePauseMs = pausedAtMs != null && nowMs > pausedAtMs ? nowMs - pausedAtMs : 0;
  return Math.max(0, nowMs - startedAtMs - Math.max(0, accumulatedPausedMs) - activePauseMs);
}

/**
 * Great-circle Haversine distance in meters between two WGS84 coordinates.
 */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return R * c;
}

export function calculateRouteDistanceMeters(points: RoutePoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Computes positive elevation gain in meters from real recorded altitude values.
 * Returns null when device altitude is unavailable (fewer than 2 points with altitude).
 */
export function calculateElevationGainMeters(points: RoutePoint[]): number | null {
  const altPoints = points.filter((p) => typeof p.altitude === 'number' && Number.isFinite(p.altitude));
  if (altPoints.length < 2) return null;

  let gain = 0;
  let anchorAlt = altPoints[0].altitude as number;
  for (let i = 1; i < altPoints.length; i++) {
    const current = altPoints[i].altitude as number;
    const diff = current - anchorAlt;
    if (diff >= 2) {
      gain += diff;
      anchorAlt = current;
    } else if (diff <= -2) {
      anchorAlt = current;
    }
  }
  return Math.round(gain * 10) / 10;
}

export function calculateAverageSpeedKmh(
  distanceMeters: number | null,
  durationSeconds: number
): number | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return (distanceMeters / 1000) / (durationSeconds / 3600);
}

export function calculateAveragePaceSecPerKm(
  distanceMeters: number | null,
  durationSeconds: number
): number | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return durationSeconds / (distanceMeters / 1000);
}

export function formatClockTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDurationHuman(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  if (safe === 0) return '0m';
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  if (mins > 0) {
    return secs > 0 && mins < 10 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

export function formatDistance(meters: number | null, unit: UnitSystem, decimals = 2): string {
  if (meters == null || !Number.isFinite(meters)) return 'Not available';
  if (unit === 'imperial') {
    return `${(meters / METERS_PER_MILE).toFixed(decimals)} mi`;
  }
  return `${(meters / 1000).toFixed(decimals)} km`;
}

export function distanceValue(meters: number, unit: UnitSystem): number {
  return unit === 'imperial' ? meters / METERS_PER_MILE : meters / 1000;
}

export function distanceInputToMeters(val: number, unit: UnitSystem): number {
  return unit === 'imperial' ? val * METERS_PER_MILE : val * 1000;
}

export function elevationInputToMeters(val: number, unit: UnitSystem): number {
  return unit === 'imperial' ? val / METERS_TO_FEET : val;
}

export function formatSpeed(kmh: number | null, unit: UnitSystem): string {
  if (kmh == null || !Number.isFinite(kmh) || kmh <= 0) return 'Not available';
  if (unit === 'imperial') {
    return `${(kmh * KM_TO_MILES).toFixed(1)} mph`;
  }
  return `${kmh.toFixed(1)} km/h`;
}

export function formatPace(secPerKm: number | null, unit: UnitSystem): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return 'Not available';
  const secPerUnit = unit === 'imperial' ? secPerKm / KM_TO_MILES : secPerKm;
  const rounded = Math.round(secPerUnit);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${String(secs).padStart(2, '0')} /${unit === 'imperial' ? 'mi' : 'km'}`;
}

export function formatElevation(meters: number | null, unit: UnitSystem): string {
  if (meters == null || !Number.isFinite(meters)) return 'Not available';
  if (unit === 'imperial') {
    return `${Math.round(meters * METERS_TO_FEET)} ft`;
  }
  return `${Math.round(meters)} m`;
}

export function formatHydration(ml: number, unit: UnitSystem): string {
  if (unit === 'imperial') {
    return `${(ml * ML_TO_FL_OZ).toFixed(1)} fl oz`;
  }
  return `${Math.round(ml).toLocaleString()} ml`;
}

export function formatSleepMinutes(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return 'Not logged';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export interface DailySummary {
  dateKey: string;
  steps: number;
  stepsSource: 'daily_log' | 'activities' | 'none';
  exerciseDurationSeconds: number;
  distanceMeters: number;
  activityCount: number;
  hydrationMl: number;
  mealCount: number;
  todayMeals: MealRecord[];
  sleepMinutes: number | null;
  wellnessLog: DailyWellnessRecord | null;
}

export function computeDailySummary(state: PulseAppState, dateKey: string): DailySummary {
  const dayActivities = state.activities.filter((a) => toLocalDateKey(a.startedAt) === dateKey);
  const dayMeals = state.meals
    .filter((m) => toLocalDateKey(m.timestamp) === dateKey)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const dayHydration = state.hydrationLogs.filter((h) => toLocalDateKey(h.timestamp) === dateKey);
  const wellnessLog = state.wellnessLogs.find((w) => w.dateKey === dateKey) ?? null;

  const activitySteps = dayActivities.reduce((sum, a) => sum + (a.steps ?? 0), 0);
  let steps = 0;
  let stepsSource: DailySummary['stepsSource'] = 'none';
  if (wellnessLog?.steps != null && wellnessLog.steps >= 0) {
    steps = wellnessLog.steps;
    stepsSource = 'daily_log';
  } else if (activitySteps > 0) {
    steps = activitySteps;
    stepsSource = 'activities';
  }

  return {
    dateKey,
    steps,
    stepsSource,
    exerciseDurationSeconds: dayActivities.reduce((sum, a) => sum + a.durationSeconds, 0),
    distanceMeters: dayActivities.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0),
    activityCount: dayActivities.length,
    hydrationMl: dayHydration.reduce((sum, h) => sum + h.amountMl, 0),
    mealCount: dayMeals.length,
    todayMeals: dayMeals,
    sleepMinutes: wellnessLog?.sleepMinutes ?? null,
    wellnessLog,
  };
}

export interface WeeklyDayBucket {
  dateKey: string;
  shortDay: string;
  durationSeconds: number;
  distanceMeters: number;
  count: number;
}

export function computeWeeklyOverview(
  activities: ActivityRecord[],
  referenceDate = new Date()
): WeeklyDayBucket[] {
  // Monday-start 7-day window containing referenceDate
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const dayOfWeek = ref.getDay(); // 0 = Sun, 1 = Mon...
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMon);

  const buckets: WeeklyDayBucket[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = toLocalDateKey(d);
    const matching = activities.filter((a) => toLocalDateKey(a.startedAt) === key);
    buckets.push({
      dateKey: key,
      shortDay: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d),
      durationSeconds: matching.reduce((s, a) => s + a.durationSeconds, 0),
      distanceMeters: matching.reduce((s, a) => s + (a.distanceMeters ?? 0), 0),
      count: matching.length,
    });
  }
  return buckets;
}

export type AnalyticsRange = '7d' | '30d' | '90d' | 'all' | 'custom';

export interface AnalyticsFilter {
  range: AnalyticsRange;
  startDate?: string;
  endDate?: string;
  activityType: ActivityType | 'all';
}

export interface AnalyticsSnapshot {
  filteredActivities: ActivityRecord[];
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  activityCount: number;
  activeDaysCount: number;
  dailySeries: { dateKey: string; label: string; durationMinutes: number; distanceMeters: number; count: number }[];
  weeklySeries: { weekKey: string; label: string; durationMinutes: number; distanceMeters: number; count: number }[];
  monthlySeries: { monthKey: string; label: string; durationMinutes: number; distanceMeters: number; count: number }[];
  typeBreakdown: { type: ActivityType; label: string; count: number; durationSeconds: number; distanceMeters: number; sharePct: number }[];
  milestones: {
    longestDistance: ActivityRecord | null;
    longestDuration: ActivityRecord | null;
    fastestPace: { activity: ActivityRecord; secPerKm: number } | null;
    highestElevation: ActivityRecord | null;
  };
}

export function computeAnalytics(
  activities: ActivityRecord[],
  filter: AnalyticsFilter,
  now = new Date()
): AnalyticsSnapshot {
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let minTime = 0;
  let maxTime = Number.POSITIVE_INFINITY;

  if (filter.range === '7d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    minTime = start.getTime();
    maxTime = todayEnd.getTime();
  } else if (filter.range === '30d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    minTime = start.getTime();
    maxTime = todayEnd.getTime();
  } else if (filter.range === '90d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
    minTime = start.getTime();
    maxTime = todayEnd.getTime();
  } else if (filter.range === 'custom') {
    if (filter.startDate) {
      const [y, m, d] = filter.startDate.split('-').map(Number);
      minTime = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).getTime();
    }
    if (filter.endDate) {
      const [y, m, d] = filter.endDate.split('-').map(Number);
      maxTime = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999).getTime();
    }
  }

  const filtered = activities
    .filter((a) => {
      if (filter.activityType !== 'all' && a.type !== filter.activityType) return false;
      const t = new Date(a.startedAt).getTime();
      return t >= minTime && t <= maxTime;
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const totalDurationSeconds = filtered.reduce((s, a) => s + a.durationSeconds, 0);
  const totalDistanceMeters = filtered.reduce((s, a) => s + (a.distanceMeters ?? 0), 0);

  const uniqueDays = new Set(filtered.map((a) => toLocalDateKey(a.startedAt)));

  // Daily series (group by dateKey)
  const dayBuckets: Record<string, { durationMinutes: number; distanceMeters: number; count: number }> = {};
  for (const a of filtered) {
    const key = toLocalDateKey(a.startedAt);
    if (!dayBuckets[key]) dayBuckets[key] = { durationMinutes: 0, distanceMeters: 0, count: 0 };
    dayBuckets[key].durationMinutes += a.durationSeconds / 60;
    dayBuckets[key].distanceMeters += a.distanceMeters ?? 0;
    dayBuckets[key].count += 1;
  }

  const dailyKeys = Object.keys(dayBuckets).sort();
  const dailySeries = dailyKeys.map((dateKey) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return {
      dateKey,
      label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(dt),
      durationMinutes: Math.round(dayBuckets[dateKey].durationMinutes * 10) / 10,
      distanceMeters: Math.round(dayBuckets[dateKey].distanceMeters),
      count: dayBuckets[dateKey].count,
    };
  });

  // Weekly series (group by Monday of week)
  const weekBuckets: Record<string, { durationMinutes: number; distanceMeters: number; count: number }> = {};
  for (const a of filtered) {
    const dt = new Date(a.startedAt);
    const localDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const dow = localDay.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    localDay.setDate(localDay.getDate() + diff);
    const weekKey = toLocalDateKey(localDay);
    if (!weekBuckets[weekKey]) weekBuckets[weekKey] = { durationMinutes: 0, distanceMeters: 0, count: 0 };
    weekBuckets[weekKey].durationMinutes += a.durationSeconds / 60;
    weekBuckets[weekKey].distanceMeters += a.distanceMeters ?? 0;
    weekBuckets[weekKey].count += 1;
  }

  const weeklySeries = Object.keys(weekBuckets)
    .sort()
    .map((weekKey) => {
      const [y, m, d] = weekKey.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return {
        weekKey,
        label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(dt),
        durationMinutes: Math.round(weekBuckets[weekKey].durationMinutes * 10) / 10,
        distanceMeters: Math.round(weekBuckets[weekKey].distanceMeters),
        count: weekBuckets[weekKey].count,
      };
    });

  // Monthly series
  const monthBuckets: Record<string, { durationMinutes: number; distanceMeters: number; count: number }> = {};
  for (const a of filtered) {
    const dt = new Date(a.startedAt);
    const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (!monthBuckets[monthKey]) monthBuckets[monthKey] = { durationMinutes: 0, distanceMeters: 0, count: 0 };
    monthBuckets[monthKey].durationMinutes += a.durationSeconds / 60;
    monthBuckets[monthKey].distanceMeters += a.distanceMeters ?? 0;
    monthBuckets[monthKey].count += 1;
  }

  const monthlySeries = Object.keys(monthBuckets)
    .sort()
    .map((monthKey) => {
      const [y, m] = monthKey.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, 1);
      return {
        monthKey,
        label: new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(dt),
        durationMinutes: Math.round(monthBuckets[monthKey].durationMinutes * 10) / 10,
        distanceMeters: Math.round(monthBuckets[monthKey].distanceMeters),
        count: monthBuckets[monthKey].count,
      };
    });

  // Type breakdown
  const typeMap: Record<string, { count: number; durationSeconds: number; distanceMeters: number }> = {};
  for (const a of filtered) {
    if (!typeMap[a.type]) typeMap[a.type] = { count: 0, durationSeconds: 0, distanceMeters: 0 };
    typeMap[a.type].count += 1;
    typeMap[a.type].durationSeconds += a.durationSeconds;
    typeMap[a.type].distanceMeters += a.distanceMeters ?? 0;
  }

  const typeBreakdown = Object.entries(typeMap)
    .map(([type, stats]) => ({
      type: type as ActivityType,
      label: ACTIVITY_META_MAP[type as ActivityType]?.label ?? type,
      count: stats.count,
      durationSeconds: stats.durationSeconds,
      distanceMeters: stats.distanceMeters,
      sharePct: totalDurationSeconds > 0 ? Math.round((stats.durationSeconds / totalDurationSeconds) * 100) : 0,
    }))
    .sort((a, b) => b.durationSeconds - a.durationSeconds);

  // Milestones from filtered records
  let longestDistance: ActivityRecord | null = null;
  let longestDuration: ActivityRecord | null = null;
  let fastestPace: { activity: ActivityRecord; secPerKm: number } | null = null;
  let highestElevation: ActivityRecord | null = null;

  for (const a of filtered) {
    if ((a.distanceMeters ?? 0) > (longestDistance?.distanceMeters ?? 0)) {
      longestDistance = a;
    }
    if (a.durationSeconds > (longestDuration?.durationSeconds ?? 0)) {
      longestDuration = a;
    }
    if (a.elevationGainMeters != null && a.elevationGainMeters > (highestElevation?.elevationGainMeters ?? -1)) {
      highestElevation = a;
    }
    if ((a.distanceMeters ?? 0) >= 500 && a.durationSeconds > 0) {
      const pace = calculateAveragePaceSecPerKm(a.distanceMeters, a.durationSeconds);
      if (pace != null && (fastestPace == null || pace < fastestPace.secPerKm)) {
        fastestPace = { activity: a, secPerKm: pace };
      }
    }
  }

  return {
    filteredActivities: filtered,
    totalDurationSeconds,
    totalDistanceMeters,
    activityCount: filtered.length,
    activeDaysCount: uniqueDays.size,
    dailySeries,
    weeklySeries,
    monthlySeries,
    typeBreakdown,
    milestones: {
      longestDistance,
      longestDuration,
      fastestPace,
      highestElevation,
    },
  };
}

export interface OvernightMealGap {
  dateKey: string;
  eveningMealTime: string;
  morningMealTime: string;
  gapMinutes: number;
}

/**
 * Informational overnight gap between last meal of Day D-1 (>= 12:00) and first meal of Day D (< 14:00).
 * Purely observational; no fasting targets or restrictions.
 */
export function computeOvernightMealGaps(meals: MealRecord[]): OvernightMealGap[] {
  const byDay: Record<string, MealRecord[]> = {};
  for (const m of meals) {
    const k = toLocalDateKey(m.timestamp);
    if (!byDay[k]) byDay[k] = [];
    byDay[k].push(m);
  }
  const sortedDays = Object.keys(byDay).sort();
  const gaps: OvernightMealGap[] = [];

  for (let i = 1; i < sortedDays.length; i++) {
    const prevKey = sortedDays[i - 1];
    const currKey = sortedDays[i];
    const [py, pm, pd] = prevKey.split('-').map(Number);
    const [cy, cm, cd] = currKey.split('-').map(Number);
    const prevDate = new Date(py, pm - 1, pd);
    const currDate = new Date(cy, cm - 1, cd);
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / 86400000);
    if (diffDays !== 1) continue;

    const prevMeals = byDay[prevKey]
      .filter((m) => new Date(m.timestamp).getHours() >= 12)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const currMeals = byDay[currKey]
      .filter((m) => new Date(m.timestamp).getHours() < 14)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (prevMeals.length === 0 || currMeals.length === 0) continue;
    const lastEvening = prevMeals[prevMeals.length - 1];
    const firstMorning = currMeals[0];
    const gapMs = new Date(firstMorning.timestamp).getTime() - new Date(lastEvening.timestamp).getTime();
    if (gapMs > 0) {
      gaps.push({
        dateKey: currKey,
        eveningMealTime: lastEvening.timestamp,
        morningMealTime: firstMorning.timestamp,
        gapMinutes: Math.round(gapMs / 60000),
      });
    }
  }

  return gaps.reverse();
}
