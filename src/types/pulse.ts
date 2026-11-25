export type ActivityType =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'hiking'
  | 'swimming'
  | 'indoor'
  | 'strength'
  | 'other';

export type ActivitySource = 'recorded' | 'manual';

export type UnitSystem = 'metric' | 'imperial';

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type NavTab = 'home' | 'activities' | 'wellness' | 'progress' | 'profile';

export type ThemeId = 'midnight-mint' | 'ocean-blue' | 'forest-green' | 'light';

export interface RoutePoint {
  lat: number;
  lng: number;
  altitude: number | null;
  timestamp: number;
  accuracy?: number | null;
}

export interface ActivityRecord {
  id: string;
  type: ActivityType;
  title: string;
  source: ActivitySource;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  pausedSeconds: number;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  avgHeartRateBpm: number | null;
  steps: number | null;
  notes: string;
  routePoints: RoutePoint[];
  gpsPermissionState?: 'granted' | 'denied' | 'unavailable' | 'not_requested';
  createdAt: string;
  updatedAt: string;
}

export interface MealRecord {
  id: string;
  category: MealCategory;
  title: string;
  timestamp: string;
  notes: string;
  createdAt: string;
}

export interface HydrationRecord {
  id: string;
  amountMl: number;
  timestamp: string;
  note: string;
}

export interface DailyWellnessRecord {
  dateKey: string;
  steps: number | null;
  sleepMinutes: number | null;
  bedtime: string | null;
  wakeTime: string | null;
  sleepQuality: 'rested' | 'moderate' | 'tired' | null;
  recoveryNotes: string;
  updatedAt: string;
}

export interface UserProfile {
  name: string;
  bio: string;
  photoUrl: string;
  preferredActivity: ActivityType;
}

export interface MealReminderEnabledMap {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  snack: boolean;
}

export interface MealReminderTimes {
  breakfast: string;
  lunch: string;
  dinner: string;
  snack: string;
}

export interface UserPreferences {
  theme: ThemeId;
  unitSystem: UnitSystem;
  dailyStepGoal: number;
  dailyHydrationGoalMl: number;
  weeklyDurationGoalMinutes: number;
  mealRemindersEnabled: boolean;
  mealReminderEnabledMap: MealReminderEnabledMap;
  mealReminderTimes: MealReminderTimes;
  hydrationRemindersEnabled: boolean;
  hydrationReminderIntervalMinutes: number;
  hydrationReminderStartTime: string;
  hydrationReminderEndTime: string;
  browserNotificationsEnabled: boolean;
  dismissedReminders: Record<string, string[]>;
  showOvernightMealGap: boolean;
  shareActivitiesPublicly: boolean;
  shareLocationRoutes: boolean;
}

export interface PulseAppState {
  profile: UserProfile;
  preferences: UserPreferences;
  activities: ActivityRecord[];
  meals: MealRecord[];
  hydrationLogs: HydrationRecord[];
  wellnessLogs: DailyWellnessRecord[];
}
