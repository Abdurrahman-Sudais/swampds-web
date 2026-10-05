import React from 'react';

const TONE = {
  normal:  'bg-emerald-50/95 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-900',
  warning: 'bg-amber-50/95 dark:bg-amber-950/80 border-amber-200 dark:border-amber-900',
  leak:    'bg-rose-50/95 dark:bg-rose-950/80 border-rose-200 dark:border-rose-900',
};

function Cell({ label, value, unit, alert }) {
  return (
    <div className="text-center min-w-0">
      <div className="text-[11px] leading-none text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold leading-none ${alert ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
        {value}<span className="text-[11px] font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

/**
 * Live readings pinned under the header on small screens. The valve sliders sit far from
 * the schematic on a phone, so this keeps the effect of moving them in view.
 * Hidden on large screens, where everything fits at once.
 */
export default function LiveStrip({ sim }) {
  const { flows, tanks, segments, status } = sim;
  return (
    <div
      role="group"
      aria-label="Live readings"
      className={`lg:hidden sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 border-y backdrop-blur-md transition-colors ${TONE[status] ?? TONE.normal}`}
    >
      <div className="grid grid-cols-4 gap-2">
        <Cell label="F1 L/min" value={flows.f1.toFixed(2)} />
        <Cell label="F2 L/min" value={flows.f2.toFixed(2)} alert={segments.A.leak} />
        <Cell label="F3 L/min" value={flows.f3.toFixed(2)} alert={segments.B.leak} />
        <Cell label="Tank" value={Math.round(tanks.delivery)} unit="%" />
      </div>
    </div>
  );
}
