import React, { useId } from 'react';

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/**
 * Tank D: closest to the original schematic look, kept deliberately plain.
 * The only changes: the fill transitions smoothly instead of snapping, and a
 * thin animated line sits at the surface to read as "liquid" rather than "bar chart".
 */
export function TankRippleFragment({ percent, showLabel = true, low = false, full = false, w = 96, h = 140 }) {
  const id = useId();
  const pct = clamp(percent);
  const fillH = (pct / 100) * (h - 4);
  const fillY = h - 2 - fillH;
  const tone = low ? '#f87171' : full ? '#38bdf8' : '#38bdf8';

  return (
    <g className={low ? 'tr-pulse' : undefined}>
      <defs>
        {/* Matches the body outline exactly (same rx), so the fill can never paint outside
            the border - independent of how rx gets clamped at small sizes. */}
        <clipPath id={`${id}-body`}>
          <rect x="2" y="2" width={w - 4} height={h - 4} rx="12" />
        </clipPath>
      </defs>

      <rect x="2" y="2" width={w - 4} height={h - 4} rx="12"
        className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />

      <g clipPath={`url(#${id}-body)`}>
        <rect x="2" y={fillY} width={w - 4} height={Math.max(0, fillH - 2)} rx="4"
          fill={tone} opacity="0.28" style={{ transition: 'y 1s ease, height 1s ease' }} />

        {pct > 1 && (
          <line x1="4" x2={w - 4} y1={fillY} y2={fillY} stroke={tone} strokeWidth="2" strokeLinecap="round"
            strokeDasharray="5 4" className="tr-surface" style={{ transition: 'y1 1s ease, y2 1s ease' }} />
        )}
      </g>

      <rect x="2" y="2" width={w - 4} height={h - 4} rx="12" fill="none"
        className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />

      {showLabel && (
        <text x={w / 2} y={h / 2 + 5} textAnchor="middle" fontSize={Math.max(10, w * 0.17)} fontWeight="700"
          className="fill-slate-800 dark:fill-slate-100 font-mono">
          {Math.round(pct)}%
        </text>
      )}
    </g>
  );
}

/** Standalone, labelled version for previews outside the schematic. */
export default function TankRipple({ percent, label, low = false, full = false, w = 96, h = 140 }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label ?? 'Tank'} ${Math.round(clamp(percent))}% full`}>
        <TankRippleFragment percent={percent} low={low} full={full} w={w} h={h} />
      </svg>
      {label && <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>}
    </div>
  );
}
