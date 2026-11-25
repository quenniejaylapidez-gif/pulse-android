import { useMemo, useState } from 'react';
import { Award, Calendar, TrendingUp, ArrowUpRight } from 'lucide-react';
import type { ActivityRecord, ActivityType, UnitSystem } from '../types/pulse';
import {
  ACTIVITY_META_MAP,
  ACTIVITY_TYPES,
  AnalyticsRange,
  computeAnalytics,
  distanceValue,
  formatDisplayDate,
  formatDistance,
  formatDurationHuman,
  formatElevation,
  formatPace,
  toLocalDateKey,
} from '../utils/metrics';
import { AreaTrendChart, BarTrendChart } from './Charts';

interface ProgressViewProps {
  activities: ActivityRecord[];
  unitSystem: UnitSystem;
  onSelectActivity: (activity: ActivityRecord) => void;
}

export function ProgressView({ activities, unitSystem, onSelectActivity }: ProgressViewProps) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return toLocalDateKey(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toLocalDateKey(new Date()));
  const [activityType, setActivityType] = useState<ActivityType | 'all'>('all');

  const analytics = useMemo(
    () =>
      computeAnalytics(activities, {
        range,
        startDate: customStart,
        endDate: customEnd,
        activityType,
      }),
    [activities, range, customStart, customEnd, activityType]
  );

  const weeklyDurationData = useMemo(
    () =>
      analytics.weeklySeries.map((item) => ({
        label: item.label,
        value: item.durationMinutes,
        secondaryLabel: `${item.count} ${item.count === 1 ? 'session' : 'sessions'}`,
      })),
    [analytics.weeklySeries]
  );

  const monthlyDurationData = useMemo(
    () =>
      analytics.monthlySeries.map((item) => ({
        label: item.label,
        value: item.durationMinutes,
        secondaryLabel: `${item.count} ${item.count === 1 ? 'session' : 'sessions'}`,
      })),
    [analytics.monthlySeries]
  );

  const distanceTrendData = useMemo(
    () =>
      analytics.dailySeries.map((item) => ({
        label: item.label,
        value: Number(distanceValue(item.distanceMeters, unitSystem).toFixed(2)),
        secondaryLabel: `${item.count} ${item.count === 1 ? 'session' : 'sessions'}`,
      })),
    [analytics.dailySeries, unitSystem]
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-secondary-text)]">
            Sports Analytics
          </p>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-[var(--text-main)] mt-1">
            Progress &amp; Trends
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Every total, trendline, and milestone calculated accurately from your saved records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
            {(
              [
                { id: '7d', label: '7D' },
                { id: '30d', label: '30D' },
                { id: '90d', label: '90D' },
                { id: 'all', label: 'All' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  range === opt.id
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value as ActivityType | 'all')}
            aria-label="Filter analytics by activity type"
            className="h-10 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 text-xs font-medium text-[var(--text-main)]"
          >
            <option value="all">All Activities</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4">
          <Calendar className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
          <div className="flex items-center gap-2">
            <label htmlFor="prog-start" className="text-xs text-[var(--text-secondary)]">
              From
            </label>
            <input
              id="prog-start"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-9 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 text-xs font-mono tabular-nums text-[var(--text-main)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="prog-end" className="text-xs text-[var(--text-secondary)]">
              To
            </label>
            <input
              id="prog-end"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-9 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-2.5 text-xs font-mono tabular-nums text-[var(--text-main)]"
            />
          </div>
        </div>
      )}

      {/* Compact Hairline KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] divide-y lg:divide-y-0 divide-x divide-[var(--border-subtle)]">
        <div className="p-5">
          <p className="text-xs text-[var(--text-secondary)]">Exercise Duration</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--accent-primary-text)] mt-1.5">
            {formatDurationHuman(analytics.totalDurationSeconds)}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[var(--text-secondary)]">Total Distance</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--text-main)] mt-1.5">
            {formatDistance(analytics.totalDistanceMeters, unitSystem)}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[var(--text-secondary)]">Sessions</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--accent-secondary-text)] mt-1.5">
            {analytics.activityCount}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[var(--text-secondary)]">Active Days</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--text-main)] mt-1.5">
            {analytics.activeDaysCount}
          </p>
        </div>
      </div>

      {/* Weekly + Monthly Activity Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-display font-bold text-[var(--text-main)]">Weekly Activity Graph</h2>
              <p className="text-xs text-[var(--text-secondary)]">Minutes per week</p>
            </div>
            <TrendingUp className="w-4 h-4 text-[var(--accent-primary-text)]" />
          </div>
          <BarTrendChart
            data={weeklyDurationData}
            unitSuffix="min"
            emptyText="No weekly activity data for this filter."
            height={175}
            accentColor="var(--accent-primary)"
          />
        </section>

        <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-display font-bold text-[var(--text-main)]">Monthly Activity Graph</h2>
              <p className="text-xs text-[var(--text-secondary)]">Minutes per month</p>
            </div>
            <TrendingUp className="w-4 h-4 text-[var(--accent-secondary-text)]" />
          </div>
          <BarTrendChart
            data={monthlyDurationData}
            unitSuffix="min"
            emptyText="No monthly activity data for this filter."
            height={175}
            accentColor="var(--accent-secondary)"
          />
        </section>
      </div>

      {/* Distance Trends Area Chart */}
      <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-display font-bold text-[var(--text-main)]">Distance Trends</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Daily recorded distance ({unitSystem === 'imperial' ? 'mi' : 'km'})
            </p>
          </div>
        </div>
        <AreaTrendChart
          data={distanceTrendData}
          unitSuffix={unitSystem === 'imperial' ? 'mi' : 'km'}
          emptyText="No distance-based activities recorded in this timeframe."
          height={180}
          strokeColor="var(--accent-secondary)"
        />
      </section>

      {/* Type Breakdown + Personal Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
          <h2 className="text-base font-display font-bold text-[var(--text-main)] mb-4">
            Activity Type Breakdown
          </h2>
          {analytics.typeBreakdown.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No activity sessions in this timeframe.</p>
          ) : (
            <div className="space-y-4">
              {analytics.typeBreakdown.map((item, idx) => (
                <div key={item.type}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-[var(--text-main)]">
                      {item.label}{' '}
                      <span className="font-normal text-[var(--text-secondary)]">
                        · {item.count} {item.count === 1 ? 'session' : 'sessions'}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                      {formatDurationHuman(item.durationSeconds)} · {formatDistance(item.distanceMeters, unitSystem)} ({item.sharePct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, item.sharePct)}%`,
                        backgroundColor: idx % 2 === 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-[var(--accent-primary-text)]" />
            <h2 className="text-base font-display font-bold text-[var(--text-main)]">Personal Milestones</h2>
          </div>

          {analytics.activityCount === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Milestones will populate automatically as soon as activities are saved.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4">
                <p className="text-xs text-[var(--text-secondary)]">Longest Distance</p>
                {analytics.milestones.longestDistance && (analytics.milestones.longestDistance.distanceMeters ?? 0) > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectActivity(analytics.milestones.longestDistance!)}
                    className="text-left mt-1 group"
                  >
                    <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] group-hover:text-[var(--accent-primary-text)]">
                      {formatDistance(analytics.milestones.longestDistance.distanceMeters, unitSystem)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                      {analytics.milestones.longestDistance.title}
                    </p>
                  </button>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Not recorded yet</p>
                )}
              </div>

              <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4">
                <p className="text-xs text-[var(--text-secondary)]">Longest Duration</p>
                {analytics.milestones.longestDuration ? (
                  <button
                    type="button"
                    onClick={() => onSelectActivity(analytics.milestones.longestDuration!)}
                    className="text-left mt-1 group"
                  >
                    <p className="text-lg font-bold font-mono tabular-nums text-[var(--accent-primary-text)] group-hover:underline">
                      {formatDurationHuman(analytics.milestones.longestDuration.durationSeconds)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                      {analytics.milestones.longestDuration.title}
                    </p>
                  </button>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Not recorded yet</p>
                )}
              </div>

              <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4">
                <p className="text-xs text-[var(--text-secondary)]">Fastest Pace (500m+)</p>
                {analytics.milestones.fastestPace ? (
                  <button
                    type="button"
                    onClick={() => onSelectActivity(analytics.milestones.fastestPace!.activity)}
                    className="text-left mt-1 group"
                  >
                    <p className="text-lg font-bold font-mono tabular-nums text-[var(--accent-secondary-text)] group-hover:underline">
                      {formatPace(analytics.milestones.fastestPace.secPerKm, unitSystem)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                      {analytics.milestones.fastestPace.activity.title}
                    </p>
                  </button>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Not recorded yet</p>
                )}
              </div>

              <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4">
                <p className="text-xs text-[var(--text-secondary)]">Highest Elevation Gain</p>
                {analytics.milestones.highestElevation ? (
                  <button
                    type="button"
                    onClick={() => onSelectActivity(analytics.milestones.highestElevation!)}
                    className="text-left mt-1 group"
                  >
                    <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] group-hover:text-[var(--accent-primary-text)]">
                      {formatElevation(analytics.milestones.highestElevation.elevationGainMeters, unitSystem)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                      {analytics.milestones.highestElevation.title}
                    </p>
                  </button>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Not recorded yet</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Filtered Activity History Table */}
      <section className="pt-2 border-t border-[var(--border-subtle)]">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-display font-bold text-[var(--text-main)]">Filtered Activity History</h2>
          <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            {analytics.filteredActivities.length} {analytics.filteredActivities.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>

        {analytics.filteredActivities.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No sessions match your active filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                  <th className="py-3 px-4 font-medium">Session</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium text-right">Duration</th>
                  <th className="py-3 px-4 font-medium text-right">Distance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {analytics.filteredActivities.slice(0, 20).map((act) => (
                  <tr
                    key={act.id}
                    onClick={() => onSelectActivity(act)}
                    className="hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-[var(--text-main)] flex items-center gap-1.5">
                      <span className="truncate max-w-[200px]">{act.title}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--accent-primary-text)] font-medium">
                      {ACTIVITY_META_MAP[act.type]?.label ?? act.type}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                      {formatDisplayDate(act.startedAt)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[var(--text-main)]">
                      {formatDurationHuman(act.durationSeconds)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[var(--accent-secondary-text)]">
                      {act.distanceMeters != null ? formatDistance(act.distanceMeters, unitSystem) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
