import React, { useMemo } from 'react';
import { Check, Lightbulb } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import { reliableLeakOpening } from './config.js';

/**
 * Modern Minimalist Demo Checklist
 */
export default function DemoGuide({ sim, config }) {
  const steps = useMemo(() => {
    const hasLeak = sim.status === 'leak';
    const isWatching = sim.status === 'warning' || sim.segments.A.abnormalFor > 0 || sim.segments.B.abnormalFor > 0;
    const isValveOpen = sim.valves.A > 0 || sim.valves.B > 0;
    const pumpRunning = sim.pumpOn;

    return [
      {
        id: 1,
        title: 'Auto Operation',
        desc: 'Water flows normally through sensors.',
        done: pumpRunning && !isValveOpen && !hasLeak,
      },
      {
        id: 2,
        title: 'Inject Leak',
        desc: `Open Valve A or B to ${reliableLeakOpening(config)}% or more.`,
        done: isValveOpen || hasLeak,
      },
      {
        id: 3,
        title: 'Persistence Filter',
        desc: 'Timer counts up to filter noise.',
        done: isWatching || hasLeak,
      },
      {
        id: 4,
        title: 'Pump Shutdown',
        desc: 'Relay trips, pump isolates.',
        done: hasLeak && !sim.pumpOn,
      },
      {
        id: 5,
        title: 'Isolate & Reset',
        desc: 'Close both valves and reset.',
        done: !hasLeak && !isValveOpen && sim.events.some((e) => e.message.includes('acknowledged')),
      },
    ];
  }, [sim, config]);

  return (
    <Card className="border border-slate-200/80 dark:border-slate-800 shadow-xs">
      <CardHeader
        title="Demo Workflow"
        icon={Lightbulb}
        iconColorClass="text-slate-500 dark:text-slate-400"
      />

      <div className="space-y-2">
        {steps.map((s) => (
          <div
            key={s.id}
            className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-xs transition-colors ${
              s.done
                ? 'bg-emerald-500/5 border-emerald-500/20 text-slate-700 dark:text-slate-300'
                : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-200/60 dark:border-slate-800 text-slate-500'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] ${
                s.done
                  ? 'bg-emerald-500 text-white'
                  : 'border border-slate-300 dark:border-slate-700 text-slate-400'
              }`}
            >
              {s.done ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : s.id}
            </span>
            <div className="min-w-0">
              <span className="font-medium">{s.title}:</span>{' '}
              <span className="text-slate-400 dark:text-slate-500">{s.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
