import React, { useState } from 'react';
import { SlidersHorizontal, RotateCcw, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import PumpControlCard from '../components/dashboard/PumpControlCard';
import { DEFAULT_CONFIG, SEGMENTS, reliableLeakOpening } from './config.js';
import { DEMO_PRESETS } from './presets.js';

const STOP_TEXT = {
  leak: 'Pump interlocked by leak protection. Close both valves and reset.',
  'source-empty': 'Pump interlocked: Source tank depleted.',
  'delivery-full': 'Pump standby: Delivery tank full.',
};

/**
 * Modern Minimalist Operator Control Panel
 */
export default function ControlPanel({ twin }) {
  const {
    sim,
    config,
    notice,
    setValve,
    setMode,
    setManualCommand,
    acknowledgeReset,
    refillSource,
    emptyDelivery,
    updateConfig,
    resetConfig,
    restart,
  } = twin;

  const [calOpen, setCalOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Leak Valves & Scenarios */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <CardHeader
          title="Leak Simulation"
          icon={SlidersHorizontal}
          iconColorClass="text-slate-500 dark:text-slate-400"
        />

        {/* Minimal Preset Pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {DEMO_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => p.apply(twin)}
              className="px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {p.title}
            </button>
          ))}
        </div>

        {/* Valve Sliders (one per monitored segment) */}
        <div className="space-y-3">
          {Object.entries(SEGMENTS).map(([id, seg]) => {
            const val = sim.valves[id];
            return (
              <div key={id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Valve {id} <span className="text-slate-400">({seg.from}→{seg.to})</span>
                  </span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {val}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={val}
                  onChange={(e) => setValve(id, Number(e.target.value))}
                  className="twin-range"
                  style={{ '--pct': `${val}%`, '--fill': '#d97706' }}
                  aria-label={`Valve ${id} opening percentage`}
                />
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
          Leaks are flagged when a segment loses more than {config.tolerancePct}% of its flow (F2 below F1,
          or F3 below F2). That takes a valve opening of about {reliableLeakOpening(config)}% or more;
          smaller openings stay within tolerance and are not reported.
        </p>

        {/* Reset Action */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
          <button
            onClick={acknowledgeReset}
            disabled={!sim.latched}
            className={`w-full py-3 min-h-[44px] px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              sim.latched
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Acknowledge &amp; Reset
          </button>

          {notice && (
            <p className={`text-xs text-center ${notice.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
              {notice.text}
            </p>
          )}
        </div>
      </Card>

      {/* Pump Control Card */}
      <div>
        <PumpControlCard
          pumpStatus={sim.pumpOn ? 'on' : 'off'}
          controlMode={sim.mode}
          onToggleMode={() => setMode(sim.mode === 'auto' ? 'manual' : 'auto')}
          onPumpCommand={setManualCommand}
        />
        {sim.stopReason && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 px-1">
            {STOP_TEXT[sim.stopReason]}
          </p>
        )}
      </div>

      {/* Reservoirs & Calibration */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Reservoirs</span>
          <div className="flex items-center gap-2">
            <button
              onClick={refillSource}
              className="px-3 py-2 min-h-[40px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Refill Source
            </button>
            <button
              onClick={emptyDelivery}
              disabled={sim.measuredDelivery !== null}
              title={sim.measuredDelivery !== null ? 'The level comes from the real tank while hardware is linked' : undefined}
              className="px-3 py-2 min-h-[40px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              Empty Delivery
            </button>
          </div>
        </div>

        {/* Collapsible Calibration */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            className="w-full min-h-[44px] flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <span>Algorithm Thresholds</span>
            {calOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {calOpen && (
            <div className="mt-3 space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400 mb-1">
                  <span>Tolerance: {config.tolerancePct}%</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="30"
                  value={config.tolerancePct}
                  onChange={(e) => updateConfig({ tolerancePct: Number(e.target.value) })}
                  className="twin-range"
                  style={{ '--pct': `${((config.tolerancePct - 2) / (30 - 2)) * 100}%` }}
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400 mb-1">
                  <span>Persistence: {config.persistSec}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={config.persistSec}
                  onChange={(e) => updateConfig({ persistSec: Number(e.target.value) })}
                  className="twin-range"
                  style={{ '--pct': `${((config.persistSec - 1) / (10 - 1)) * 100}%` }}
                />
              </div>

              <div className="flex justify-between items-center pt-1">
                <button
                  onClick={resetConfig}
                  disabled={config.tolerancePct === DEFAULT_CONFIG.tolerancePct && config.persistSec === DEFAULT_CONFIG.persistSec}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40"
                >
                  Reset Defaults
                </button>
                <button
                  onClick={restart}
                  className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Restart Simulation
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
