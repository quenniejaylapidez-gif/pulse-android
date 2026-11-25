import { useEffect, useMemo } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import type { RoutePoint, ThemeId } from '../types/pulse';
import { THEME_META_MAP } from '../utils/themes';

function RoutePolylineAndBounds({
  points,
  strokeColor,
}: {
  points: RoutePoint[];
  strokeColor: string;
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const coreLib = useMapsLibrary('core');

  useEffect(() => {
    if (!map || !mapsLib || points.length === 0) return;

    const path = points.map((p) => ({ lat: p.lat, lng: p.lng }));
    const polyline = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor,
      strokeOpacity: 0.95,
      strokeWeight: 4,
      map,
    });

    if (coreLib && points.length >= 2) {
      const bounds = new coreLib.LatLngBounds();
      for (const pt of path) {
        bounds.extend(pt);
      }
      map.fitBounds(bounds, 44);
    } else if (points.length === 1) {
      map.setCenter(path[0]);
      map.setZoom(16);
    }

    return () => {
      polyline.setMap(null);
    };
  }, [map, mapsLib, coreLib, points, strokeColor]);

  return null;
}

export function RouteMiniPath({ points, className = '' }: { points: RoutePoint[]; className?: string }) {
  const svgData = useMemo(() => {
    if (points.length < 2) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const latSpan = Math.max(maxLat - minLat, 0.0002);
    const lngSpan = Math.max(maxLng - minLng, 0.0002);
    const pad = 12;
    const width = 200;
    const height = 84;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    const coords = points.map((p) => {
      const x = pad + ((p.lng - minLng) / lngSpan) * innerW;
      const y = height - pad - ((p.lat - minLat) / latSpan) * innerH;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });
    const d = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
    return { d, start: coords[0], end: coords[coords.length - 1], width, height };
  }, [points]);

  if (!svgData) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] ${className}`}
      >
        <span>{points.length === 1 ? 'Single GPS waypoint recorded' : 'No GPS route recorded'}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] ${className}`}
    >
      <svg
        viewBox={`0 0 ${svgData.width} ${svgData.height}`}
        className="w-full h-full"
        role="img"
        aria-label="Recorded GPS route preview"
      >
        <defs>
          <pattern id="neo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--chart-grid)" strokeWidth="0.75" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#neo-grid)" />
        <path
          d={svgData.d}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={svgData.start.x}
          cy={svgData.start.y}
          r="3.5"
          fill="var(--accent-secondary)"
          stroke="var(--bg-primary)"
          strokeWidth="1.5"
        />
        <circle
          cx={svgData.end.x}
          cy={svgData.end.y}
          r="4"
          fill="var(--accent-primary)"
          stroke="var(--bg-primary)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

interface RouteMapProps {
  points: RoutePoint[];
  apiKey: string;
  themeId?: ThemeId;
  heightClass?: string;
  interactive?: boolean;
  quotaExceeded?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export function RouteMap({
  points,
  apiKey,
  themeId = 'midnight-mint',
  heightClass = 'h-64',
  interactive = true,
  quotaExceeded = false,
  emptyTitle = 'No GPS route available',
  emptySubtitle = 'GPS coordinates are recorded only when location tracking is enabled during an outdoor session.',
}: RouteMapProps) {
  const themeMeta = THEME_META_MAP[themeId] ?? THEME_META_MAP['midnight-mint'];

  const center = useMemo(() => {
    if (points.length === 0) return null;
    const mid = points[Math.floor(points.length / 2)];
    return { lat: mid.lat, lng: mid.lng };
  }, [points]);

  if (points.length === 0 || !center) {
    return (
      <div
        className={`${heightClass} w-full rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-col items-center justify-center text-center px-6 relative overflow-hidden`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--chart-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--chart-grid) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="relative z-10 flex flex-col items-center max-w-sm">
          <div className="w-10 h-10 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-center mb-3">
            <MapPin className="w-4 h-4 text-[var(--accent-secondary-text)]" />
          </div>
          <p className="text-sm font-medium text-[var(--text-main)]">{emptyTitle}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{emptySubtitle}</p>
        </div>
      </div>
    );
  }

  if (!apiKey || quotaExceeded) {
    return (
      <div
        className={`${heightClass} w-full rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col justify-between p-4`}
      >
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>GPS Coordinate Path ({points.length} points)</span>
          <span className="font-mono tabular-nums text-[var(--accent-secondary-text)]">
            {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
          </span>
        </div>
        <RouteMiniPath points={points} className="flex-1 my-2" />
        <p className="text-xs text-[var(--text-secondary)]">
          {quotaExceeded
            ? 'Interactive map tiles paused due to Google Maps quota limit; vector path shown from recorded coordinates.'
            : 'Interactive map tiles will render once a Google Maps API key is active.'}
        </p>
      </div>
    );
  }

  const start = points[0];
  const end = points[points.length - 1];

  return (
    <div className={`${heightClass} w-full rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-card)]`}>
      <APIProvider apiKey={apiKey} libraries={['marker', 'maps']}>
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={center}
          defaultZoom={15}
          gestureHandling={interactive ? 'greedy' : 'none'}
          disableDefaultUI={!interactive}
          colorScheme={themeMeta.isDark ? 'DARK' : 'LIGHT'}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <RoutePolylineAndBounds points={points} strokeColor={themeMeta.swatches.primaryAccent} />
          <AdvancedMarker position={{ lat: start.lat, lng: start.lng }} title="Start">
            <div
              className="w-3.5 h-3.5 rounded-full border-2 shadow"
              style={{
                backgroundColor: themeMeta.swatches.secondaryAccent,
                borderColor: themeMeta.swatches.primaryBg,
              }}
            />
          </AdvancedMarker>
          {points.length > 1 && (
            <AdvancedMarker position={{ lat: end.lat, lng: end.lng }} title="Finish">
              <div
                className="w-4 h-4 rounded-full border-2 shadow"
                style={{
                  backgroundColor: themeMeta.swatches.primaryAccent,
                  borderColor: themeMeta.swatches.primaryBg,
                }}
              />
            </AdvancedMarker>
          )}
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
