import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

/**
 * Four-state system status banner.
 * Responsive: stacks comfortably on mobile (<640px), horizontal on tablet & desktop.
 *
 * Visual distinction guide:
 *   normal  → solid green,  steady -  "all clear"
 *   warning → amber,        steady -  "pay attention"
 *   leak    → orange-600,   steady -  "action needed"
 *   fault   → red-700,      pulsing - "critical failure"
 *
 * @param {{ systemStatus: 'normal'|'warning'|'leak'|'fault' }} props
 */

const STATUS_CONFIG = {
  fault: {
    bg:       'bg-red-700 animate-pulse',
    text:     'text-white',
    badgeBg:  'bg-red-900/60 text-red-100',
    Icon:     ShieldAlert,
    label:    'SENSOR FAULT',
    desc:     'A flow sensor is reading near-zero - possible sensor failure or full blockage. Manual inspection required immediately.',
  },
  leak: {
    bg:       'bg-orange-600',
    text:     'text-white',
    badgeBg:  'bg-orange-900/50 text-orange-100',
    Icon:     AlertTriangle,
    label:    'LEAK DETECTED',
    desc:     'A flow sensor is reading well below the one before it - leak confirmed. Check the alerts for the section and inspect that pipe.',
  },
  warning: {
    bg:       'bg-amber-500',
    text:     'text-slate-900',
    badgeBg:  'bg-amber-700/30 text-slate-900',
    Icon:     AlertTriangle,
    label:    'SYSTEM WARNING',
    desc:     'Something needs attention, such as a flow difference being verified or a pump or water-level issue. See the alerts for details.',
  },
  normal: {
    bg:       'bg-green-500',
    text:     'text-white',
    badgeBg:  'bg-green-700/40 text-green-100',
    Icon:     CheckCircle2,
    label:    'SYSTEM NORMAL',
    desc:     'All flow sensors within expected range. No divergence detected.',
  },
};

export default function SystemStatusBanner({ systemStatus }) {
  const cfg = STATUS_CONFIG[systemStatus] ?? STATUS_CONFIG.normal;
  const { bg, text, Icon, label, desc, badgeBg } = cfg;

  return (
    <div
      className={`rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-5 shadow-md transition-colors duration-500 ${bg} ${text}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1">
        <Icon className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 mt-0.5 sm:mt-0" />
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-wide leading-tight">{label}</h2>
          <p className="opacity-90 text-xs sm:text-sm mt-1 leading-snug">{desc}</p>
        </div>
      </div>
      <div className={`self-start sm:self-center flex-shrink-0 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold tracking-wide ${badgeBg}`}>
        {(systemStatus ?? 'loading').toUpperCase()}
      </div>
    </div>
  );
}
