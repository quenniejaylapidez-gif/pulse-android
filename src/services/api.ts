import type {
  ActivityRecord,
  DailyWellnessRecord,
  HydrationRecord,
  MealRecord,
  PulseAppState,
  UserPreferences,
  UserProfile,
} from '../types/pulse';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const pulseApi = {
  getPublicConfig: () => requestJson<{ googleMapsApiKey: string }>('/api/public-config'),
  getState: () => requestJson<PulseAppState>('/api/state'),

  updateProfile: (payload: { profile?: Partial<UserProfile>; preferences?: Partial<UserPreferences> }) =>
    requestJson<{ profile: UserProfile; preferences: UserPreferences }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  createActivity: (activity: ActivityRecord) =>
    requestJson<{ activity: ActivityRecord; deduplicated: boolean }>('/api/activities', {
      method: 'POST',
      body: JSON.stringify(activity),
    }),

  updateActivity: (id: string, patch: Partial<ActivityRecord>) =>
    requestJson<{ activity: ActivityRecord }>(`/api/activities/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  deleteActivity: (id: string) =>
    requestJson<{ deletedId: string }>(`/api/activities/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createMeal: (meal: Omit<MealRecord, 'createdAt'>) =>
    requestJson<{ meal: MealRecord }>('/api/meals', {
      method: 'POST',
      body: JSON.stringify(meal),
    }),

  updateMeal: (id: string, patch: Partial<MealRecord>) =>
    requestJson<{ meal: MealRecord }>(`/api/meals/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  deleteMeal: (id: string) =>
    requestJson<{ deletedId: string }>(`/api/meals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createHydration: (entry: HydrationRecord) =>
    requestJson<{ hydration: HydrationRecord }>('/api/hydration', {
      method: 'POST',
      body: JSON.stringify(entry),
    }),

  deleteHydration: (id: string) =>
    requestJson<{ deletedId: string }>(`/api/hydration/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  upsertWellness: (record: Omit<DailyWellnessRecord, 'updatedAt'>) =>
    requestJson<{ wellness: DailyWellnessRecord }>('/api/wellness', {
      method: 'POST',
      body: JSON.stringify(record),
    }),

  exportData: () => requestJson<Record<string, unknown>>('/api/export'),

  deleteAccount: () =>
    requestJson<{ reset: boolean; state: PulseAppState }>('/api/account', {
      method: 'DELETE',
    }),
};
