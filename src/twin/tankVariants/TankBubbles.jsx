import React, { useId, useMemo } from 'react';

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/**
 * Tank B: flat gradient fill (smooth height transition) with small bubbles that
 * continuously rise and fade. Bubble count/speed reacts to `active` (e.g. the
 * pump running), so an idle tank looks calm and a filling one looks busy.
 */
export function TankBubblesFragment({ percent, showLabel = true, active = true, w = 96, h = 140 }) {
  const id = useId();
  const pct = clamp(percent);
  const fillH = (pct / 100) * (h - 4);
  const fillY = h - 2 - fillH;

  const bubbles = useMemo(() => Array.from({ length: 7 }, (_, i) => ({
    x: 12 + ((i * 37) % (w - 24)),
    r: 1.5 + ((i * 13) % 3),
    delay: (i * 0.55) % 3,
    dur: 2.4 + (i % 3) * 0.6,
  })), [w]);

  return (
    <>
      <defs>
        {/* Matches the body outline exactly (same rx), so the fill and bubbles can never
            paint outside the border - independent of how rx gets clamped at small sizes. */}
        <clipPath id={`${id}-body`}>
          <rect x="2" y="2" width={w - 4} height={h - 4} rx="14" />
        </clipPath>
        <clipPath id={`${id}-fill-clip`}>
          <rect x="2" y={fillY} width={w - 4} height={fillH} rx="6" style={{ transition: 'y 1s ease, height 1s ease' }} />
        </clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width={w - 4} height={h - 4} rx="14"
        className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700" strokeWidth="2" />

      <g clipPath={`url(#${id}-body)`}>
        <rect x="2" y={fillY} width={w - 4} height={fillH} rx="6"
          fill={`url(#${id}-fill)`} style={{ transition: 'y 1s ease, height 1s ease' }} />

        <g clipPath={`url(#${id}-fill-clip)`}>
          {active && bubbles.map((b, i) => (
            <circle key={i} cx={b.x} cy={h - 4} r={b.r} fill="white" opacity="0.6"
              className="tb-bubble" style={{ animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, ['--rise']: `${h}px` }} />
          ))}
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
export default function TankBubbles({ percent, label, active = true, w = 96, h = 140 }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label ?? 'Tank'} ${Math.round(clamp(percent))}% full`}>
        <TankBubblesFragment percent={percent} active={active} w={w} h={h} />
      </svg>
      {label && <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>}
    </div>
  );
}
