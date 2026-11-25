import { useMemo, useState } from 'react';
import { Plus, Search, ArrowUpRight } from 'lucide-react';
import type { ActivityRecord, ActivityType, ThemeId, UnitSystem } from '../types/pulse';
import {
  ACTIVITY_META_MAP,
  ACTIVITY_TYPES,
  calculateAveragePaceSecPerKm,
  calculateAverageSpeedKmh,
  formatDisplayDate,
  formatDisplayTime,
  formatDistance,
  formatDurationHuman,
  formatPace,
  formatSpeed,
} from '../utils/metrics';
import { LiveTracker } from './LiveTracker';
import { RouteMiniPath } from './RouteMap';

interface ActivitiesViewProps {
  activities: ActivityRecord[];
  defaultType: ActivityType;
  unitSystem: UnitSystem;
  themeId: ThemeId;
  mapsApiKey: string;
  quotaExceeded: boolean;
  onSaveActivity: (activity: ActivityRecord) => Promise<void>;
  onOpenManualModal: () => void;
  onSelectActivity: (activity: ActivityRecord) => void;
}

export function ActivitiesView({
  activities,
  defaultType,
  unitSystem,
  themeId,
  mapsApiKey,
  quotaExceeded,
  onSaveActivity,
  onOpenManualModal,
  onSelectActivity,
}: ActivitiesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'recorded' | 'manual'>('all');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...activities]
      .filter((act) => {
        if (typeFilter !== 'all' && act.type !== typeFilter) return false;
        if (sourceFilter !== 'all' && act.source !== sourceFilter) return false;
        if (q) {
          const typeLabel = (ACTIVITY_META_MAP[act.type]?.label ?? act.type).toLowerCase();
          return (
            act.title.toLowerCase().includes(q) ||
            typeLabel.includes(q) ||
            act.notes.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [activities, searchQuery, typeFilter, sourceFilter]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-secondary-text)]">
            Activity Studio
          </p>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-[var(--text-main)] mt-1">
            Track &amp; Record
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Live GPS routing, accurate elapsed timing, or manual workout logging.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenManualModal}
          className="h-11 px-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-main)] hover:border-[var(--accent-primary)] flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 text-[var(--accent-primary-text)]" />
          Add Manual Entry
        </button>
      </header>

      <LiveTracker
        defaultType={defaultType}
        unitSystem={unitSystem}
        themeId={themeId}
        mapsApiKey={mapsApiKey}
        quotaExceeded={quotaExceeded}
        onSaveActivity={onSaveActivity}
      />

      <section className="pt-4 border-t border-[var(--border-subtle)] space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-display font-bold text-[var(--text-main)]">Activity History Timeline</h2>
            <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
              {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-48 sm:flex-none">
              <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                aria-label="Search activities"
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ActivityType | 'all')}
              aria-label="Filter by activity type"
              className="h-10 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 text-xs font-medium text-[var(--text-main)]"
            >
              <option value="all">All Types</option>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              {(['all', 'recorded', 'manual'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                    sourceFilter === src
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-8 text-center">
            <p className="text-base font-medium text-[var(--text-main)]">
              {activities.length === 0 ? 'No activities recorded yet' : 'No matching activities found'}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
              {activities.length === 0
                ? 'Start a live workout above or add a completed session manually.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[9px] before:top-3 before:bottom-3 before:w-px before:bg-[var(--border-subtle)]">
            {filtered.map((act) => {
              const meta = ACTIVITY_META_MAP[act.type];
              const pace = calculateAveragePaceSecPerKm(act.distanceMeters, act.durationSeconds);
              const speed = calculateAverageSpeedKmh(act.distanceMeters, act.durationSeconds);
              const hasRoute = act.routePoints.length >= 2;

              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => onSelectActivity(act)}
                  className="relative group w-full text-left rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] p-5 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <span
                    aria-hidden="true"
                    className="absolute -left-[20px] top-6 w-2.5 h-2.5 rounded-full ring-4 ring-[var(--bg-primary)]"
                    style={{
                      backgroundColor:
                        act.source === 'recorded' ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                    }}
                  />

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--accent-primary-text)]">{meta?.label ?? act.type}</span>
                      <span aria-hidden="true">·</span>
                      <span>{act.source === 'recorded' ? 'GPS / Live Recorded' : 'Manual Entry'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatDisplayDate(act.startedAt)} · {formatDisplayTime(act.startedAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-display font-bold text-[var(--text-main)] truncate group-hover:text-[var(--accent-primary-text)] transition-colors">
                        {act.title}
                      </h3>
                      <ArrowUpRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--accent-primary-text)] shrink-0" />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs font-mono tabular-nums pt-1">
                      <div>
                        <span className="text-[var(--text-secondary)] mr-1.5">Time</span>
                        <span className="text-[var(--text-main)] font-semibold">
                          {formatDurationHuman(act.durationSeconds)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)] mr-1.5">Dist</span>
                        <span className="text-[var(--text-main)] font-semibold">
                          {act.distanceMeters != null ? formatDistance(act.distanceMeters, unitSystem) : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)] mr-1.5">
                          {act.type === 'cycling' ? 'Speed' : 'Pace'}
                        </span>
                        <span className="text-[var(--accent-secondary-text)] font-semibold">
                          {act.type === 'cycling'
                            ? speed != null
                              ? formatSpeed(speed, unitSystem)
                              : '—'
                            : pace != null
                              ? formatPace(pace, unitSystem)
                              : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {hasRoute && (
                    <div className="w-full md:w-44 shrink-0">
                      <RouteMiniPath points={act.routePoints} className="h-20 w-full" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
