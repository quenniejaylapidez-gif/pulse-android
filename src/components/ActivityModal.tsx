import { useEffect, useState } from 'react';
import { X, Trash2, Edit3, Check, AlertCircle } from 'lucide-react';
import type { ActivityRecord, ActivityType, ThemeId, UnitSystem } from '../types/pulse';
import {
  ACTIVITY_META_MAP,
  ACTIVITY_TYPES,
  calculateAveragePaceSecPerKm,
  calculateAverageSpeedKmh,
  combineLocalDateAndTime,
  distanceInputToMeters,
  distanceValue,
  elevationInputToMeters,
  formatDisplayDate,
  formatDisplayTime,
  formatDistance,
  formatDurationHuman,
  formatElevation,
  formatPace,
  formatSpeed,
  toLocalDateKey,
  toLocalTimeInput,
} from '../utils/metrics';
import { RouteMap } from './RouteMap';

interface ActivityFormModalProps {
  initialActivity?: ActivityRecord | null;
  defaultType?: ActivityType;
  unitSystem: UnitSystem;
  onClose: () => void;
  onSave: (activity: ActivityRecord, isEdit: boolean) => Promise<void>;
}

export function ActivityFormModal({
  initialActivity,
  defaultType = 'running',
  unitSystem,
  onClose,
  onSave,
}: ActivityFormModalProps) {
  const isEdit = Boolean(initialActivity);
  const now = new Date();

  const [type, setType] = useState<ActivityType>(initialActivity?.type ?? defaultType);
  const [title, setTitle] = useState<string>(
    initialActivity?.title ?? `${ACTIVITY_META_MAP[defaultType]?.label ?? 'Workout'} Session`
  );
  const [dateKey, setDateKey] = useState<string>(
    initialActivity ? toLocalDateKey(initialActivity.startedAt) : toLocalDateKey(now)
  );
  const [startTime, setStartTime] = useState<string>(
    initialActivity ? toLocalTimeInput(initialActivity.startedAt) : toLocalTimeInput(now)
  );
  const [durationMinutes, setDurationMinutes] = useState<string>(
    initialActivity ? String(Math.max(1, Math.round(initialActivity.durationSeconds / 60))) : '30'
  );
  const [distanceInput, setDistanceInput] = useState<string>(() => {
    if (initialActivity?.distanceMeters == null) return '';
    return distanceValue(initialActivity.distanceMeters, unitSystem).toFixed(2);
  });
  const [elevationInput, setElevationInput] = useState<string>(() => {
    if (initialActivity?.elevationGainMeters == null) return '';
    const val =
      unitSystem === 'imperial'
        ? Math.round(initialActivity.elevationGainMeters * 3.28084)
        : Math.round(initialActivity.elevationGainMeters);
    return String(val);
  });
  const [heartRateInput, setHeartRateInput] = useState<string>(
    initialActivity?.avgHeartRateBpm != null ? String(initialActivity.avgHeartRateBpm) : ''
  );
  const [stepsInput, setStepsInput] = useState<string>(
    initialActivity?.steps != null ? String(initialActivity.steps) : ''
  );
  const [notes, setNotes] = useState<string>(initialActivity?.notes ?? '');
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) {
      setTitle(`${ACTIVITY_META_MAP[type]?.label ?? 'Activity'} Session`);
    }
  }, [type, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Please enter an activity title.');
      return;
    }

    const mins = Number(durationMinutes);
    if (!Number.isFinite(mins) || mins <= 0 || mins > 10080) {
      setError('Duration must be between 1 and 10,080 minutes.');
      return;
    }

    let distanceMeters: number | null = null;
    if (distanceInput.trim() !== '') {
      const distVal = Number(distanceInput);
      if (!Number.isFinite(distVal) || distVal < 0) {
        setError('Distance must be a valid non-negative number.');
        return;
      }
      distanceMeters = distanceInputToMeters(distVal, unitSystem);
    }

    let elevationGainMeters: number | null = null;
    if (elevationInput.trim() !== '') {
      const elevVal = Number(elevationInput);
      if (!Number.isFinite(elevVal) || elevVal < 0) {
        setError('Elevation gain must be a valid non-negative number.');
        return;
      }
      elevationGainMeters = elevationInputToMeters(elevVal, unitSystem);
    }

    let avgHeartRateBpm: number | null = null;
    if (heartRateInput.trim() !== '') {
      const hrVal = Math.round(Number(heartRateInput));
      if (!Number.isFinite(hrVal) || hrVal < 25 || hrVal > 250) {
        setError('Average heart rate must be between 25 and 250 bpm.');
        return;
      }
      avgHeartRateBpm = hrVal;
    }

    let steps: number | null = null;
    if (stepsInput.trim() !== '') {
      const stVal = Math.round(Number(stepsInput));
      if (!Number.isFinite(stVal) || stVal < 0) {
        setError('Steps must be a non-negative whole number.');
        return;
      }
      steps = stVal;
    }

    const startedAtIso = combineLocalDateAndTime(dateKey, startTime);
    const durationSeconds = Math.round(mins * 60);
    const endedAtIso = new Date(new Date(startedAtIso).getTime() + durationSeconds * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const record: ActivityRecord = {
      id: initialActivity?.id ?? crypto.randomUUID(),
      type,
      title: trimmedTitle,
      source: initialActivity?.source ?? 'manual',
      startedAt: startedAtIso,
      endedAt: endedAtIso,
      durationSeconds,
      pausedSeconds: initialActivity?.pausedSeconds ?? 0,
      distanceMeters,
      elevationGainMeters,
      avgHeartRateBpm,
      steps,
      notes: notes.trim(),
      routePoints: initialActivity?.routePoints ?? [],
      gpsPermissionState: initialActivity?.gpsPermissionState ?? 'not_requested',
      createdAt: initialActivity?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    try {
      setSubmitting(true);
      await onSave(record, isEdit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save activity.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-form-title"
    >
      <div className="w-full max-w-xl rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <div>
            <h2 id="activity-form-title" className="text-lg font-display font-bold text-[var(--text-main)]">
              {isEdit ? 'Edit Activity' : 'Log Manual Activity'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {initialActivity?.source === 'recorded'
                ? 'Recorded session · adjust title, notes, or supplemental metrics'
                : 'Manual entry · labeled distinctly from GPS-recorded workouts'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] px-3.5 py-2.5 text-sm text-[var(--danger-text)]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="act-type" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Activity Type
              </label>
              <select
                id="act-type"
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)]"
              >
                {ACTIVITY_TYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="act-title" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Session Title
              </label>
              <input
                id="act-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="act-date" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Date
              </label>
              <input
                id="act-date"
                type="date"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                required
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="act-time" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Start Time
              </label>
              <input
                id="act-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="act-dur" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Duration (min)
              </label>
              <input
                id="act-dur"
                type="number"
                min="1"
                max="10080"
                step="1"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                required
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="act-dist" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Distance ({unitSystem === 'imperial' ? 'mi' : 'km'}, optional)
              </label>
              <input
                id="act-dist"
                type="number"
                min="0"
                step="0.01"
                placeholder="Leave blank if not applicable"
                value={distanceInput}
                onChange={(e) => setDistanceInput(e.target.value)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70 font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="act-elev" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Elevation Gain ({unitSystem === 'imperial' ? 'ft' : 'm'}, optional)
              </label>
              <input
                id="act-elev"
                type="number"
                min="0"
                step="1"
                placeholder="Not available"
                value={elevationInput}
                onChange={(e) => setElevationInput(e.target.value)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70 font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="act-hr" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Avg Heart Rate (bpm, optional)
              </label>
              <input
                id="act-hr"
                type="number"
                min="25"
                max="250"
                step="1"
                placeholder="Not available"
                value={heartRateInput}
                onChange={(e) => setHeartRateInput(e.target.value)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70 font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="act-steps" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Steps (optional)
              </label>
              <input
                id="act-steps"
                type="number"
                min="0"
                step="1"
                placeholder="Optional"
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70 font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <label htmlFor="act-notes" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Notes (optional)
            </label>
            <textarea
              id="act-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              placeholder="How did the session feel, terrain, weather, or splits..."
              className="w-full rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-11 px-6 rounded-lg text-sm font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ActivityDetailModalProps {
  activity: ActivityRecord;
  unitSystem: UnitSystem;
  themeId: ThemeId;
  mapsApiKey: string;
  quotaExceeded: boolean;
  onClose: () => void;
  onEdit: (activity: ActivityRecord) => void;
  onDelete: (id: string) => Promise<void>;
}

export function ActivityDetailModal({
  activity,
  unitSystem,
  themeId,
  mapsApiKey,
  quotaExceeded,
  onClose,
  onEdit,
  onDelete,
}: ActivityDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const meta = ACTIVITY_META_MAP[activity.type];
  const speedKmh = calculateAverageSpeedKmh(activity.distanceMeters, activity.durationSeconds);
  const paceSecPerKm = calculateAveragePaceSecPerKm(activity.distanceMeters, activity.durationSeconds);

  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      await onDelete(activity.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-detail-title"
    >
      <div className="w-full max-w-2xl rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden my-auto">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--accent-primary-text)]">{meta?.label ?? activity.type}</span>
              <span aria-hidden="true">·</span>
              <span>{activity.source === 'recorded' ? 'GPS / Live Recorded' : 'Manual Entry'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {formatDisplayDate(activity.startedAt)} at {formatDisplayTime(activity.startedAt)}
              </span>
            </div>
            <h2 id="activity-detail-title" className="text-xl font-display font-bold text-[var(--text-main)] mt-1 truncate">
              {activity.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors shrink-0"
            aria-label="Close activity details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-secondary)] divide-y sm:divide-y-0 divide-x divide-[var(--border-subtle)]">
            <div className="p-4">
              <p className="text-xs text-[var(--text-secondary)]">Duration</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] mt-1">
                {formatDurationHuman(activity.durationSeconds)}
              </p>
              {activity.pausedSeconds > 0 && (
                <p className="text-[11px] text-[var(--text-secondary)] font-mono tabular-nums mt-0.5">
                  Paused {formatDurationHuman(activity.pausedSeconds)}
                </p>
              )}
            </div>

            <div className="p-4">
              <p className="text-xs text-[var(--text-secondary)]">Distance</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] mt-1">
                {formatDistance(activity.distanceMeters, unitSystem)}
              </p>
            </div>

            <div className="p-4">
              <p className="text-xs text-[var(--text-secondary)]">Average Pace</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[var(--accent-secondary-text)] mt-1">
                {formatPace(paceSecPerKm, unitSystem)}
              </p>
            </div>

            <div className="p-4 border-t border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-secondary)]">Average Speed</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] mt-1">
                {formatSpeed(speedKmh, unitSystem)}
              </p>
            </div>

            <div className="p-4 border-t border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-secondary)]">Elevation Gain</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] mt-1">
                {formatElevation(activity.elevationGainMeters, unitSystem)}
              </p>
            </div>

            <div className="p-4 border-t border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-secondary)]">Heart Rate</p>
              <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] mt-1">
                {activity.avgHeartRateBpm != null ? `${activity.avgHeartRateBpm} bpm` : 'Not available'}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-display font-bold text-[var(--text-main)]">Route Map</h3>
              {activity.routePoints.length > 0 && (
                <span className="text-xs font-mono tabular-nums text-[var(--accent-secondary-text)]">
                  {activity.routePoints.length} GPS waypoints
                </span>
              )}
            </div>
            <RouteMap
              points={activity.routePoints}
              apiKey={mapsApiKey}
              themeId={themeId}
              heightClass="h-64"
              interactive={true}
              quotaExceeded={quotaExceeded}
            />
          </div>

          {activity.notes && (
            <div className="border-t border-[var(--border-subtle)] pt-4">
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">Session Notes</p>
              <p className="text-sm text-[var(--text-main)] whitespace-pre-wrap">{activity.notes}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="h-11 px-4 rounded-lg text-sm font-medium text-[var(--danger-text)] hover:bg-[var(--danger-bg)] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                Delete Activity
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--danger-text)]">Delete permanently?</span>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="h-10 px-3.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  {deleting ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-10 px-3 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => onEdit(activity)}
              className="h-11 px-5 rounded-lg text-sm font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-4 h-4" />
              Edit Activity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
