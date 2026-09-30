import React from 'react';
import { WaterLevelIndicator } from './WaterLevelIndicator';
import { getTankFragment } from '../twin/tankVariants/index.js';
import { DASHBOARD_TANK_STYLES } from './tankStyle';

// Drawing size for the twin's tanks; the same 4:7 shape as the classic gauge (w-16 h-28)
const W = 64;
const H = 112;

/**
 * Water-level gauge in the chosen style.
 * @param {{ percent: number, style: string, active?: boolean, className?: string }} props
 *   active: pump running (some styles animate more while water flows in)
 */
export default function TankGauge({ percent, style, active = false, className = 'w-16 h-28' }) {
  if (style === 'classic') return <WaterLevelIndicator percent={percent} className={className} />;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${className} flex-shrink-0`} role="img" aria-label={`Tank ${Math.round(percent)}% full`}>
      {React.createElement(getTankFragment(style), { percent, active, w: W, h: H })}
    </svg>
  );
}

/** Row of buttons to pick the dashboard tank style. */
export function TankStylePicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tank style">
      {DASHBOARD_TANK_STYLES.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg transition-colors cursor-pointer ${
            value === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
