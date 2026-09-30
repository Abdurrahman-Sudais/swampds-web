import React, { useId } from 'react';

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/**
 * Tank A: liquid surface drawn as two overlapping sine waves that drift sideways
 * continuously, clipped to the fill height. The fill height itself transitions
 * smoothly (CSS) whenever `percent` changes, instead of snapping.
 *
 * `Fragment` renders just the SVG content (defs/rects/text, no outer <svg>), so
 * it can be embedded inside another SVG's coordinate space with a plain <g>.
 */
export function TankWaveFragment({ percent, showLabel = true, w = 96, h = 140 }) {
  const id = useId();
  const pct = clamp(percent);
  const fillY = h - (pct / 100) * h;

  return (
    <>
      <defs>
        <clipPath id={`${id}-body`}>
          <rect x="2" y="2" width={w - 4} height={h - 4} rx="14" />
        </clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width={w - 4} height={h - 4} rx="14"
        className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />

      <g clipPath={`url(#${id}-body)`}>
        <g style={{ transform: `translateY(${fillY}px)`, transition: 'transform 1s ease' }}>
          {/* Two waves, offset in phase and speed, tiled horizontally by repeating the same
              curve every `w` px. Each drifts by exactly one tile width (--wave-w), in pixels,
              not a %: a % resolves against this path's bounding box (~3w wide here), which
              isn't a whole number of tiles, so the loop would visibly jump on every repeat. */}
          <path
            d={`M -${w} 6 Q -${w * 0.75} 0 -${w * 0.5} 6 T 0 6 T ${w * 0.5} 6 T ${w} 6 T ${w * 1.5} 6 T ${w * 2} 6 V ${h * 2} H -${w} Z`}
            fill="#7dd3fc" opacity="0.55" className="tw-wave-a" style={{ '--wave-w': `${w}px` }}
          />
          <path
            d={`M -${w} 9 Q -${w * 0.75} 15 -${w * 0.5} 9 T 0 9 T ${w * 0.5} 9 T ${w} 9 T ${w * 1.5} 9 T ${w * 2} 9 V ${h * 2} H -${w} Z`}
            fill={`url(#${id}-fill)`} className="tw-wave-b" style={{ '--wave-w': `${w}px` }}
          />
        </g>
      </g>

      <rect x="2" y="2" width={w - 4} height={h - 4} rx="14" fill="none"
        className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />

      {showLabel && (
        <text x={w / 2} y={h / 2 + 5} textAnchor="middle" fontSize={Math.max(10, w * 0.17)} fontWeight="700"
          className="fill-slate-800 dark:fill-slate-100 font-mono" style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3, strokeOpacity: 0.5 }}>
          {Math.round(pct)}%
        </text>
      )}
    </>
  );
}

/** Standalone, labelled version for previews outside the schematic. */
export default function TankWave({ percent, label, w = 96, h = 140 }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label ?? 'Tank'} ${Math.round(clamp(percent))}% full`}>
        <TankWaveFragment percent={percent} w={w} h={h} />
      </svg>
      {label && <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>}
    </div>
  );
}
