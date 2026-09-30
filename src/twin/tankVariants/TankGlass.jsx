import React, { useId } from 'react';

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/**
 * Tank C: a capsule-shaped gauge with tick marks and a moving diagonal shine,
 * closer to a physical sight-glass than the other variants: more "instrument",
 * less "cartoon water".
 */
export function TankGlassFragment({ percent, showLabel = true, w = 76, h = 150 }) {
  const id = useId();
  const pct = clamp(percent);
  const fillH = (pct / 100) * (h - 6);
  const fillY = h - 3 - fillH;
  const radius = Math.min(w, h) / 2 - 1;

  return (
    <>
      <defs>
        <clipPath id={`${id}-body`}>
          <rect x="1" y="1" width={w - 2} height={h - 2} rx={radius} />
        </clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
      </defs>

      <rect x="1" y="1" width={w - 2} height={h - 2} rx={radius}
        className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />

      <g clipPath={`url(#${id}-body)`}>
        <rect x="1" y={fillY} width={w - 2} height={fillH} fill={`url(#${id}-fill)`}
          style={{ transition: 'y 1s ease, height 1s ease' }} />
        {/* diagonal glass shine sweeping across */}
        <rect x={-w} y="0" width={w / 3} height={h} fill="white" opacity="0.25"
          transform="skewX(-18)" className="tg-shine" />
      </g>

      {[25, 50, 75].map((m) => {
        const y = h - 3 - (m / 100) * (h - 6);
        return <line key={m} x1={w - 14} y1={y} x2={w - 4} y2={y} className="stroke-slate-400 dark:stroke-slate-600" strokeWidth="1.5" />;
      })}

      <rect x="1" y="1" width={w - 2} height={h - 2} rx={radius} fill="none"
        className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />

      {showLabel && (
        <text x={w / 2 - Math.max(4, w * 0.08)} y={h / 2 + 5} textAnchor="middle" fontSize={Math.max(9, w * 0.19)} fontWeight="700"
          className="fill-slate-800 dark:fill-slate-100 font-mono" style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3, strokeOpacity: 0.5 }}>
          {Math.round(pct)}%
        </text>
      )}
    </>
  );
}

/** Standalone, labelled version for previews outside the schematic. */
export default function TankGlass({ percent, label, w = 76, h = 150 }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label ?? 'Tank'} ${Math.round(clamp(percent))}% full`}>
        <TankGlassFragment percent={percent} w={w} h={h} />
      </svg>
      {label && <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>}
    </div>
  );
}
