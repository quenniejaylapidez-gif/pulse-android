import { useState } from 'react';
import { motion } from 'motion/react';

export interface BarChartDatum {
  label: string;
  value: number;
  secondaryLabel?: string;
}

export function BarTrendChart({
  data,
  unitSuffix,
  emptyText,
  height = 176,
  accentColor = 'var(--accent-primary)',
}: {
  data: BarChartDatum[];
  unitSuffix: string;
  emptyText: string;
  height?: number;
  accentColor?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0 || maxVal <= 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex flex-col items-center justify-center border-y border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 text-center rounded-lg"
      >
        <p className="text-sm text-[var(--text-secondary)]">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="w-full select-none">
      <div
        className="relative flex items-end gap-1.5 sm:gap-2.5 pt-7 pb-1 border-b border-[var(--border-subtle)]"
        style={{ height }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-7 bottom-1 flex flex-col justify-between">
          <div className="border-t border-dashed border-[var(--chart-grid)]" />
          <div className="border-t border-dashed border-[var(--chart-grid)]" />
          <div />
        </div>

        {data.map((item, idx) => {
          const pct = maxVal > 0 ? Math.max((item.value / maxVal) * 100, item.value > 0 ? 5 : 0) : 0;
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={`${item.label}-${idx}`}
              className="relative flex-1 h-full flex flex-col items-center justify-end z-10"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <div className="absolute -top-6 z-20 whitespace-nowrap rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-mono tabular-nums text-[var(--text-main)] shadow-lg pointer-events-none">
                  {Number.isInteger(item.value) ? item.value : item.value.toFixed(1)} {unitSuffix}
                  {item.secondaryLabel ? ` · ${item.secondaryLabel}` : ''}
                </div>
              )}
              <div className="w-full flex-1 flex items-end justify-center">
                {item.value > 0 ? (
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.25, delay: Math.min(idx * 0.02, 0.2) }}
                    style={{
                      height: `${pct}%`,
                      backgroundColor: accentColor,
                      opacity: hoveredIdx === null || isHovered ? 1 : 0.55,
                      transformOrigin: 'bottom',
                    }}
                    className="w-full max-w-[28px] rounded-t-sm transition-opacity duration-150"
                  />
                ) : (
                  <div
                    className="w-full max-w-[28px] h-[3px] rounded-t-sm"
                    style={{ backgroundColor: 'var(--chart-track)' }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 pt-2">
        {data.map((item, idx) => (
          <div key={`lbl-${item.label}-${idx}`} className="flex-1 text-center overflow-hidden">
            <span className="text-[11px] text-[var(--text-secondary)] truncate block font-mono tabular-nums">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AreaTrendChart({
  data,
  unitSuffix,
  emptyText,
  height = 176,
  strokeColor = 'var(--accent-secondary)',
}: {
  data: BarChartDatum[];
  unitSuffix: string;
  emptyText: string;
  height?: number;
  strokeColor?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0 || maxVal <= 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex flex-col items-center justify-center border-y border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 text-center rounded-lg"
      >
        <p className="text-sm text-[var(--text-secondary)]">{emptyText}</p>
      </div>
    );
  }

  const width = 520;
  const svgH = 140;
  const padX = 16;
  const padY = 14;
  const innerW = width - padX * 2;
  const innerH = svgH - padY * 2;

  const coords = data.map((d, idx) => {
    const x = data.length === 1 ? width / 2 : padX + (idx / (data.length - 1)) * innerW;
    const y = padY + innerH - (d.value / maxVal) * innerH;
    return { x, y, item: d };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${svgH - padY} L ${coords[0].x.toFixed(1)} ${svgH - padY} Z`
      : '';

  const hovered = hoveredIdx !== null ? coords[hoveredIdx] : null;

  return (
    <div className="w-full select-none">
      <div className="relative" style={{ height: height - 24 }}>
        {hovered && (
          <div className="absolute top-1 right-1 z-10 rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-mono tabular-nums text-[var(--text-main)]">
            {hovered.item.label}: {Number.isInteger(hovered.item.value) ? hovered.item.value : hovered.item.value.toFixed(2)}{' '}
            {unitSuffix}
          </div>
        )}
        <svg viewBox={`0 0 ${width} ${svgH}`} className="w-full h-full overflow-visible" role="img" aria-label="Activity trend line chart">
          <defs>
            <linearGradient id="neo-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <line x1={padX} y1={svgH - padY} x2={width - padX} y2={svgH - padY} stroke="var(--chart-grid)" strokeWidth="1" />
          <line
            x1={padX}
            y1={padY}
            x2={width - padX}
            y2={padY}
            stroke="var(--chart-grid)"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          {areaPath && <path d={areaPath} fill="url(#neo-area-grad)" />}
          {coords.length > 1 && (
            <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {coords.map((c, idx) => (
            <g
              key={`pt-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <circle cx={c.x} cy={c.y} r="10" fill="transparent" />
              <circle
                cx={c.x}
                cy={c.y}
                r={hoveredIdx === idx ? 5 : 3.2}
                fill={hoveredIdx === idx ? 'var(--accent-primary)' : strokeColor}
                stroke="var(--bg-primary)"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </svg>
      </div>
      <div className="flex items-center justify-between pt-1.5 text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
        <span>{data[0]?.label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.label}</span>}
        {data.length > 1 && <span>{data[data.length - 1]?.label}</span>}
      </div>
    </div>
  );
}

export function ProgressRing({
  progress,
  size = 92,
  strokeWidth = 7,
  label,
  strokeColor = 'var(--accent-primary)',
  sublabel,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  strokeColor?: string;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - clamped * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={label}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--chart-track)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-sm font-mono tabular-nums font-semibold text-[var(--text-main)]">
          {Math.round(clamped * 100)}%
        </span>
        {sublabel && <span className="text-[10px] text-[var(--text-secondary)] leading-none mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}
