import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  Square,
  Navigation,
  Heart,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  LocateFixed,
} from 'lucide-react';
import type { ActivityRecord, ActivityType, RoutePoint, ThemeId, UnitSystem } from '../types/pulse';
import {
  ACTIVITY_META_MAP,
  ACTIVITY_TYPES,
  calculateActiveElapsedMs,
  calculateAveragePaceSecPerKm,
  calculateAverageSpeedKmh,
  calculateElevationGainMeters,
  calculateRouteDistanceMeters,
  formatClockTimer,
  formatDistance,
  formatElevation,
  formatPace,
  formatSpeed,
  haversineDistanceMeters,
} from '../utils/metrics';
import { RouteMap } from './RouteMap';

interface LiveTrackerProps {
  defaultType: ActivityType;
  unitSystem: UnitSystem;
  themeId: ThemeId;
  mapsApiKey: string;
  quotaExceeded: boolean;
  onSaveActivity: (activity: ActivityRecord) => Promise<void>;
}

type TrackerPhase = 'idle' | 'running' | 'paused' | 'review';
type GpsState = 'not_requested' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export function LiveTracker({
  defaultType,
  unitSystem,
  themeId,
  mapsApiKey,
  quotaExceeded,
  onSaveActivity,
}: LiveTrackerProps) {
  const [activityType, setActivityType] = useState<ActivityType>(defaultType);
  const [phase, setPhase] = useState<TrackerPhase>('idle');
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(ACTIVITY_META_MAP[defaultType]?.isOutdoorDefault ?? true);
  const [gpsState, setGpsState] = useState<GpsState>('not_requested');
  const [gpsNotice, setGpsNotice] = useState<string>('');
  const [previewPoint, setPreviewPoint] = useState<RoutePoint | null>(null);

  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [pausedAtMs, setPausedAtMs] = useState<number | null>(null);
  const [accumulatedPausedMs, setAccumulatedPausedMs] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);

  // Optional real Web Bluetooth heart rate monitor
  const [hrConnected, setHrConnected] = useState(false);
  const [hrDeviceName, setHrDeviceName] = useState<string>('');
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const [hrSamples, setHrSamples] = useState<number[]>([]);
  const [hrError, setHrError] = useState<string>('');

  // Review / save state
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [manualDistanceOverride, setManualDistanceOverride] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [savedBanner, setSavedBanner] = useState<string>('');

  const watchIdRef = useRef<number | null>(null);
  const phaseRef = useRef<TrackerPhase>(phase);
  phaseRef.current = phase;

  const activeElapsedMs =
    startedAtMs != null
      ? calculateActiveElapsedMs(startedAtMs, nowMs, pausedAtMs, accumulatedPausedMs)
      : 0;
  const elapsedSeconds = Math.floor(activeElapsedMs / 1000);

  const gpsDistanceMeters = routePoints.length >= 2 ? calculateRouteDistanceMeters(routePoints) : null;
  const elevationGainMeters = calculateElevationGainMeters(routePoints);
  const avgHeartRateBpm =
    hrSamples.length > 0
      ? Math.round(hrSamples.reduce((s, v) => s + v, 0) / hrSamples.length)
      : null;

  const avgSpeedKmh = calculateAverageSpeedKmh(gpsDistanceMeters, elapsedSeconds);
  const avgPaceSecPerKm = calculateAveragePaceSecPerKm(gpsDistanceMeters, elapsedSeconds);

  useEffect(() => {
    if (phase !== 'running') return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);
    return () => window.clearInterval(id);
  }, [phase]);

  const stopGpsWatch = () => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopGpsWatch();
    };
  }, []);

  const handlePreviewLocation = () => {
    if (!('geolocation' in navigator)) {
      setGpsState('unavailable');
      setGpsNotice('Browser Geolocation API is not available on this device.');
      return;
    }
    setGpsState('requesting');
    setGpsNotice('Checking current GPS signal...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsState('granted');
        setGpsNotice('');
        setPreviewPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altitude: typeof pos.coords.altitude === 'number' ? pos.coords.altitude : null,
          timestamp: pos.timestamp || Date.now(),
          accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsState('denied');
          setGpsNotice('Location permission denied. You can still record time without GPS.');
        } else {
          setGpsState('unavailable');
          setGpsNotice('GPS signal unavailable right now.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const startGpsWatch = () => {
    if (!('geolocation' in navigator)) {
      setGpsState('unavailable');
      setGpsNotice('Browser Geolocation API is not available on this device.');
      return;
    }

    setGpsState('requesting');
    setGpsNotice('Requesting location permission from your browser...');
    stopGpsWatch();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsState('granted');
        setGpsNotice('');
        if (phaseRef.current !== 'running') return;

        const accuracy = typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null;
        const nextPt: RoutePoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altitude: typeof pos.coords.altitude === 'number' ? pos.coords.altitude : null,
          timestamp: pos.timestamp || Date.now(),
          accuracy,
        };

        setRoutePoints((prev) => {
          if (prev.length === 0) return [nextPt];
          const last = prev[prev.length - 1];
          const delta = haversineDistanceMeters(last, nextPt);
          if (accuracy !== null && accuracy > 65) return prev;
          if (delta < 2) return prev;
          return [...prev, nextPt];
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsState('denied');
          setGpsNotice('Location permission denied. Activity timing continues without GPS coordinates.');
          stopGpsWatch();
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsState('unavailable');
          setGpsNotice('GPS signal unavailable. Timing continues without fabricated coordinates.');
        } else {
          setGpsNotice('Acquiring GPS signal...');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      }
    );
  };

  const handleConnectHeartRate = async () => {
    setHrError('');
    const nav = navigator as Navigator & {
      bluetooth?: {
        requestDevice: (opts: { filters: { services: string[] }[] }) => Promise<{
          name?: string;
          gatt?: {
            connect: () => Promise<{
              getPrimaryService: (svc: string) => Promise<{
                getCharacteristic: (char: string) => Promise<{
                  startNotifications: () => Promise<void>;
                  addEventListener: (ev: string, cb: (e: Event) => void) => void;
                }>;
              }>;
            }>;
          };
        }>;
      };
    };

    if (!nav.bluetooth) {
      setHrError('Web Bluetooth heart rate sensors are not supported in this browser.');
      return;
    }

    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
      });
      const server = await device.gatt?.connect();
      if (!server) throw new Error('Unable to connect to heart rate sensor.');
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
        const target = event.target as unknown as { value?: DataView };
        const value = target?.value;
        if (!value) return;
        const flags = value.getUint8(0);
        const is16Bit = (flags & 0x01) !== 0;
        const bpm = is16Bit ? value.getUint16(1, true) : value.getUint8(1);
        if (bpm > 25 && bpm < 250) {
          setCurrentBpm(bpm);
          if (phaseRef.current === 'running') {
            setHrSamples((prev) => [...prev, bpm]);
          }
        }
      });
      setHrConnected(true);
      setHrDeviceName(device.name || 'Bluetooth HR Sensor');
    } catch (err) {
      setHrError(err instanceof Error ? err.message : 'Heart rate sensor connection cancelled.');
    }
  };

  const handleStart = () => {
    setSavedBanner('');
    setSaveError('');
    const now = Date.now();
    setStartedAtMs(now);
    setPausedAtMs(null);
    setAccumulatedPausedMs(0);
    setNowMs(now);
    setRoutePoints([]);
    setHrSamples(currentBpm != null ? [currentBpm] : []);
    setManualDistanceOverride('');
    setSessionTitle(`${ACTIVITY_META_MAP[activityType]?.label ?? 'Activity'} Session`);
    setSessionNotes('');
    setPhase('running');
    if (gpsEnabled) {
      startGpsWatch();
    } else {
      setGpsState('not_requested');
      setGpsNotice('');
    }
  };

  const handlePause = () => {
    if (phase !== 'running') return;
    const now = Date.now();
    setNowMs(now);
    setPausedAtMs(now);
    setPhase('paused');
  };

  const handleResume = () => {
    if (phase !== 'paused' || pausedAtMs == null) return;
    const now = Date.now();
    setAccumulatedPausedMs((prev) => prev + Math.max(0, now - pausedAtMs));
    setPausedAtMs(null);
    setNowMs(now);
    setPhase('running');
  };

  const handleEndSession = () => {
    const now = Date.now();
    if (phase === 'paused' && pausedAtMs != null) {
      setAccumulatedPausedMs((prev) => prev + Math.max(0, now - pausedAtMs));
      setPausedAtMs(null);
    }
    setNowMs(now);
    stopGpsWatch();
    setPhase('review');
  };

  const handleDiscard = () => {
    stopGpsWatch();
    setPhase('idle');
    setStartedAtMs(null);
    setPausedAtMs(null);
    setAccumulatedPausedMs(0);
    setRoutePoints([]);
    setHrSamples([]);
    setSaveError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startedAtMs) return;
    setSaveError('');

    const finalDurationSeconds = Math.max(1, elapsedSeconds);
    const finalPausedSeconds = Math.round(accumulatedPausedMs / 1000);
    const trimmedTitle = sessionTitle.trim() || `${ACTIVITY_META_MAP[activityType]?.label ?? 'Activity'} Session`;

    let finalDistanceMeters: number | null = gpsDistanceMeters;
    if (finalDistanceMeters == null && manualDistanceOverride.trim() !== '') {
      const val = Number(manualDistanceOverride);
      if (!Number.isFinite(val) || val < 0) {
        setSaveError('Optional distance must be a valid non-negative number.');
        return;
      }
      finalDistanceMeters = unitSystem === 'imperial' ? val * 1609.344 : val * 1000;
    }

    const nowIso = new Date().toISOString();
    const record: ActivityRecord = {
      id: crypto.randomUUID(),
      type: activityType,
      title: trimmedTitle,
      source: 'recorded',
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(nowMs).toISOString(),
      durationSeconds: finalDurationSeconds,
      pausedSeconds: finalPausedSeconds,
      distanceMeters: finalDistanceMeters,
      elevationGainMeters,
      avgHeartRateBpm,
      steps: null,
      notes: sessionNotes.trim(),
      routePoints,
      gpsPermissionState: gpsState === 'requesting' ? 'not_requested' : gpsState,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      setSaving(true);
      await onSaveActivity(record);
      setPhase('idle');
      setStartedAtMs(null);
      setPausedAtMs(null);
      setAccumulatedPausedMs(0);
      setRoutePoints([]);
      setSavedBanner(`Saved "${record.title}" to your activity timeline.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save workout.');
    } finally {
      setSaving(false);
    }
  };

  const handleTypeSelect = (nextType: ActivityType) => {
    setActivityType(nextType);
    if (phase === 'idle') {
      setGpsEnabled(ACTIVITY_META_MAP[nextType]?.isOutdoorDefault ?? false);
    }
  };

  const gpsStatusLabel =
    !gpsEnabled
      ? 'GPS Off'
      : gpsState === 'granted'
        ? `GPS Ready · ${routePoints.length} pts`
        : gpsState === 'requesting'
          ? 'Acquiring GPS...'
          : gpsState === 'denied'
            ? 'GPS Permission Denied'
            : gpsState === 'unavailable'
              ? 'GPS Signal Unavailable'
              : 'GPS Standby';

  const mapPoints = routePoints.length > 0 ? routePoints : previewPoint ? [previewPoint] : [];

  return (
    <section className="space-y-5">
      <AnimatePresence>
        {savedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-between gap-3 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] px-4 py-3 text-sm text-[var(--text-main)]"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
              <span>{savedBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setSavedBanner('')}
              className="text-xs font-semibold text-[var(--accent-primary-text)] hover:underline whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Large GPS Map Stage + Status Overlay */}
      <div className="relative rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <RouteMap
          points={mapPoints}
          apiKey={mapsApiKey}
          themeId={themeId}
          heightClass="h-64 sm:h-80"
          interactive={true}
          quotaExceeded={quotaExceeded}
          emptyTitle={gpsEnabled ? 'GPS Route Map Ready' : 'Indoor / Non-GPS Session Mode'}
          emptySubtitle={
            gpsEnabled
              ? 'Tap Locate Me to preview your position, or press Start Workout to begin recording real GPS coordinates.'
              : 'Timer and metrics will record without GPS coordinates. Toggle GPS on for outdoor tracking.'
          }
        />

        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-lg bg-[var(--bg-nav)] backdrop-blur-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-mono tabular-nums text-[var(--text-main)]">
            {phase === 'running' && gpsState === 'granted' && (
              <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" aria-hidden="true" />
            )}
            <Navigation
              className={`w-3.5 h-3.5 ${
                gpsState === 'granted' ? 'text-[var(--accent-primary-text)]' : 'text-[var(--accent-secondary-text)]'
              }`}
            />
            <span>{gpsStatusLabel}</span>
          </div>

          {phase === 'idle' && gpsEnabled && (
            <button
              type="button"
              onClick={handlePreviewLocation}
              className="pointer-events-auto h-8 px-3 rounded-lg bg-[var(--bg-nav)] backdrop-blur-md border border-[var(--border-subtle)] text-xs font-medium text-[var(--accent-secondary-text)] hover:text-[var(--text-main)] flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              Locate Me
            </button>
          )}
        </div>
      </div>

      {/* Live Telemetry & Controls Console */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5">
        {gpsNotice && (
          <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-3.5 py-2 text-xs text-[var(--text-secondary)]">
            {gpsNotice}
          </div>
        )}

        {hrError && (
          <div className="flex items-center gap-2 rounded-lg bg-[var(--warn-bg)] border border-[var(--warn-border)] px-3.5 py-2 text-xs text-[var(--warn-text)]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{hrError}</span>
          </div>
        )}

        {phase === 'idle' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {ACTIVITY_TYPES.map((item) => {
                  const active = activityType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTypeSelect(item.id)}
                      className={`h-10 px-3.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] border-[var(--accent-primary)] font-semibold'
                          : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={gpsEnabled}
                  onClick={() => setGpsEnabled((prev) => !prev)}
                  className={`h-10 px-3.5 rounded-lg text-xs font-medium border flex items-center gap-2 transition-colors whitespace-nowrap ${
                    gpsEnabled
                      ? 'bg-[var(--accent-secondary-soft)] text-[var(--accent-secondary-text)] border-[var(--accent-secondary-border)]'
                      : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  {gpsEnabled ? 'GPS Tracking On' : 'GPS Tracking Off'}
                </button>

                <button
                  type="button"
                  onClick={handleConnectHeartRate}
                  className="h-10 px-3.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Heart className={`w-3.5 h-3.5 ${hrConnected ? 'text-[var(--accent-primary-text)]' : ''}`} />
                  {hrConnected ? hrDeviceName : 'Pair HR Sensor'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleStart}
                className="h-12 px-8 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-sm font-bold flex items-center justify-center gap-2.5 shadow-lg transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                Start {ACTIVITY_META_MAP[activityType]?.label}
              </button>
            </div>
          </>
        )}

        {(phase === 'running' || phase === 'paused') && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  <span className="text-[var(--accent-primary-text)] font-semibold">
                    {ACTIVITY_META_MAP[activityType]?.label}
                  </span>
                  <span className="mx-2 opacity-30">·</span>
                  <span>{phase === 'paused' ? 'Paused' : 'Recording Live'}</span>
                </p>
                <p className="text-5xl sm:text-6xl font-bold font-mono tabular-nums tracking-tight text-[var(--text-main)] mt-1">
                  {formatClockTimer(elapsedSeconds)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {phase === 'running' ? (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="h-12 px-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-main)] hover:border-[var(--accent-primary)] flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleResume}
                    className="h-12 px-6 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-sm font-semibold flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Resume
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleEndSession}
                  className="h-12 px-6 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] text-sm font-semibold text-[var(--danger-text)] flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Finish
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-secondary)] divide-y sm:divide-y-0 divide-x divide-[var(--border-subtle)]">
              <div className="p-4">
                <p className="text-xs text-[var(--text-secondary)]">Distance</p>
                <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
                  {gpsDistanceMeters != null ? formatDistance(gpsDistanceMeters, unitSystem) : 'Not available'}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-[var(--text-secondary)]">Average Pace</p>
                <p className="text-lg font-bold font-mono tabular-nums text-[var(--accent-secondary-text)] mt-0.5">
                  {formatPace(avgPaceSecPerKm, unitSystem)}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-[var(--text-secondary)]">Elevation Gain</p>
                <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
                  {formatElevation(elevationGainMeters, unitSystem)}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-[var(--text-secondary)]">Heart Rate</p>
                <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
                  {currentBpm != null ? `${currentBpm} bpm` : 'Not available'}
                </p>
              </div>
            </div>
          </div>
        )}

        {phase === 'review' && (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-display font-bold text-[var(--text-main)]">Finish &amp; Save Workout</h3>
                <p className="text-xs text-[var(--text-secondary)] font-mono tabular-nums mt-0.5">
                  Elapsed {formatClockTimer(elapsedSeconds)} · Distance {formatDistance(gpsDistanceMeters, unitSystem)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDiscard}
                className="h-10 px-3.5 rounded-lg text-xs font-medium text-[var(--danger-text)] hover:bg-[var(--danger-bg)] flex items-center gap-1.5 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Discard
              </button>
            </div>

            {saveError && (
              <div className="rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] px-3.5 py-2 text-sm text-[var(--danger-text)]">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-secondary)] divide-y sm:divide-y-0 divide-x divide-[var(--border-subtle)]">
              <div className="p-3.5">
                <p className="text-xs text-[var(--text-secondary)]">Active Time</p>
                <p className="text-base font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
                  {formatClockTimer(elapsedSeconds)}
                </p>
              </div>
              <div className="p-3.5">
                <p className="text-xs text-[var(--text-secondary)]">Avg Speed</p>
                <p className="text-base font-bold font-mono tabular-nums text-[var(--accent-secondary-text)] mt-0.5">
                  {formatSpeed(avgSpeedKmh, unitSystem)}
                </p>
              </div>
              <div className="p-3.5">
                <p className="text-xs text-[var(--text-secondary)]">Elevation Gain</p>
                <p className="text-base font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
                  {formatElevation(elevationGainMeters, unitSystem)}
                </p>
              </div>
              <div className="p-3.5">
                <p className="text-xs text-[var(--text-secondary)]">Avg Heart Rate</p>
                <p className="text-base font-bold font-mono tabular-nums text-[var(--text-main)] mt-0.5">
                  {avgHeartRateBpm != null ? `${avgHeartRateBpm} bpm` : 'Not available'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="live-title" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Workout Title
                </label>
                <input
                  id="live-title"
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  maxLength={120}
                  required
                  className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)]"
                />
              </div>

              {gpsDistanceMeters == null && (
                <div>
                  <label htmlFor="live-dist" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Optional Distance ({unitSystem === 'imperial' ? 'mi' : 'km'})
                  </label>
                  <input
                    id="live-dist"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Optional (e.g. treadmill/pool)"
                    value={manualDistanceOverride}
                    onChange={(e) => setManualDistanceOverride(e.target.value)}
                    className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70 font-mono tabular-nums"
                  />
                </div>
              )}
            </div>

            <div>
              <label htmlFor="live-notes" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Notes (optional)
              </label>
              <textarea
                id="live-notes"
                rows={2}
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Effort, surface, or how you felt..."
                className="w-full rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="h-11 px-6 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-sm font-bold disabled:opacity-50 transition-colors active:scale-[0.98] whitespace-nowrap"
              >
                {saving ? 'Saving...' : 'Save Workout'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
