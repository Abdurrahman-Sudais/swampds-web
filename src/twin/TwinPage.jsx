import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplets,
  Workflow,
  FileText,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  ExternalLink,
  ShieldAlert,
  FlaskConical,
  Radio,
} from 'lucide-react';

import { Card, CardHeader } from '../components/Card';
import FlowChart from '../components/dashboard/FlowChart';

import { useTwin } from './useTwin.js';
import { useBuzzer } from './useBuzzer.js';
import { useMediaQuery } from './useMediaQuery.js';
import { useTankStyle } from './useTankStyle.js';
import { deriveOutputs } from './outputs.js';
import { LEAK_SOURCES } from './config.js';
import { TANK_STYLES } from './tankVariants/index.js';
import { formatElapsed } from './format.js';

import PipelineSchematic from './PipelineSchematic.jsx';
import ControlPanel from './ControlPanel.jsx';
import HardwarePanel from './HardwarePanel.jsx';
import DetectionPanel from './DetectionPanel.jsx';
import DemoGuide from './DemoGuide.jsx';
import EventLog from './EventLog.jsx';
import ReportModal from './ReportModal.jsx';
import BridgeModal from './BridgeModal.jsx';
import LiveStrip from './LiveStrip.jsx';
import { useFirebaseBridge } from './useFirebaseBridge.js';

// three.js is large, so the 3D view is only downloaded when someone switches to it.
const Twin3D = lazy(() => import('./Twin3D.jsx'));
const VIEWS = [{ id: '2d', name: '2D' }, { id: '3d', name: '3D' }];

const LINK_LABEL = {
  off: 'Dashboard link', loading: 'Connecting…', connecting: 'Connecting…', signin: 'Sign in',
  live: 'Dashboard: live', locked: 'Dashboard: busy', displaced: 'Dashboard: stopped', error: 'Dashboard: error',
};
const LINK_DOT = {
  off: 'bg-slate-400', live: 'bg-emerald-500', error: 'bg-rose-500',
  loading: 'bg-blue-400 animate-pulse', connecting: 'bg-blue-400 animate-pulse',
  signin: 'bg-amber-400', locked: 'bg-amber-400', displaced: 'bg-amber-400',
};

const STATUS_LABEL = {
  normal:  { short: 'Normal',    long: 'Operational' },
  warning: { short: 'Verifying', long: 'Verifying' },
  leak:    { short: 'Leak',      long: 'Leak Detected' },
};

const THEME_KEY = 'swampds_theme';

/** Saved choice if any, otherwise the OS preference. Storage may be blocked, so never throw. */
function readInitialDark() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved === 'dark';
  } catch { /* storage unavailable */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function saveTheme(dark) {
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* ignore */ }
}

/**
 * Modern Minimalist Digital Twin Simulation Page
 * Dark mode is scoped to this page (a `.dark` class on its root), so it can never leak
 * into the operator dashboard.
 */
export default function TwinPage() {
  const twin = useTwin({ initialMode: 'manual' }); // it drives the real pump: never start it unasked
  const { sim, config, startedAt, setValve, setManualCommand } = twin;

  // Link to the operator dashboard (Firebase). Connects on load when this browser is signed in
  // as an admin, taking over from the dashboard's background twin; otherwise waits to be asked.
  const bridge = useFirebaseBridge({
    sim,
    config,
    auto: false,
    actions: {
      setMode: twin.setMode, setManualCommand: twin.setManualCommand,
      updateConfig: twin.updateConfig, setHardware: twin.setHardware,
    },
  });
  const hardwareLinked = sim.measuredDelivery !== null;
  const [linkOpen, setLinkOpen] = useState(false);

  const [soundOn, setSoundOn] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(readInitialDark);
  const [tankStyle, setTankStyle] = useTankStyle();
  const [view, setView] = useTankStyle('swampds_twin_view', VIEWS, '2d');

  const wide = useMediaQuery('(min-width: 1024px)');
  const outputs = useMemo(() => deriveOutputs(sim), [sim]);
  useBuzzer(outputs.buzzer, soundOn);

  useEffect(() => { saveTheme(darkMode); }, [darkMode]);

  const togglePump = () => sim.mode === 'manual' && setManualCommand(sim.pumpOn ? 'off' : 'on');

  const chartData = useMemo(
    () =>
      sim.history.map((p) => ({
        time: formatElapsed(p.t),
        F1: p.F1,
        F2: p.F2,
      })),
    [sim.history],
  );

  useEffect(() => {
    const previous = document.title;
    document.title = 'SWAMPDS Digital Twin';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className={`twin-app ${darkMode ? 'dark' : ''} min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-150`}>
      {/* Modern Minimalist Navigation Bar */}
      <header className="border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo & Status */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white flex-shrink-0">
              <Droplets className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden min-[360px]:inline flex-shrink-0 font-semibold text-sm tracking-tight text-slate-900 dark:text-white">
                SWAMPDS
              </span>
              <span className="hidden sm:inline text-slate-400 dark:text-slate-600 text-xs">/</span>
              <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 truncate">
                Digital Twin
              </span>
            </div>

            {/* Subtle Live Status Pill */}
            <span
              className={`inline-flex flex-shrink-0 items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
                sim.status === 'leak'
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : sim.status === 'warning'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  sim.status === 'leak'
                    ? 'bg-rose-500'
                    : sim.status === 'warning'
                    ? 'bg-amber-400'
                    : 'bg-emerald-500'
                }`}
              />
              <span className="sm:hidden">{(STATUS_LABEL[sim.status] ?? STATUS_LABEL.normal).short}</span>
              <span className="hidden sm:inline">{(STATUS_LABEL[sim.status] ?? STATUS_LABEL.normal).long}</span>
            </span>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Audio Toggle */}
            <button
              onClick={() => setSoundOn((v) => !v)}
              className="hidden sm:block p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={soundOn ? 'Mute buzzer' : 'Unmute buzzer'}
              aria-label="Toggle audio"
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Dark / Light Toggle */}
            <button
              onClick={() => setDarkMode((v) => !v)}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Link to the operator dashboard */}
            <button
              onClick={() => setLinkOpen(true)}
              aria-label={`Dashboard link: ${LINK_LABEL[bridge.status.state] ?? ''}`}
              className="inline-flex items-center gap-1.5 min-h-10 px-2.5 sm:px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <span className={`w-2 h-2 rounded-full ${LINK_DOT[bridge.status.state] ?? 'bg-slate-400'}`} />
              <Radio className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline whitespace-nowrap">{LINK_LABEL[bridge.status.state] ?? 'Dashboard link'}</span>
            </button>

            {/* Export Report */}
            <button
              onClick={() => setReportOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>

            {/* Link to Authenticated Portal */}
            <Link
              to="/login"
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white min-w-10 min-h-10 justify-center px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden sm:flex items-center gap-1"
            >
              <span className="hidden sm:inline">Operator Login</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60" aria-label="Operator login" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Layout Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
        <LiveStrip sim={sim} />
        <p className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] sm:text-xs text-amber-800 dark:text-amber-300">
          <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
          {hardwareLinked ? (
            <span>
              <strong>Hardware linked.</strong> Tank level comes from the prototype's ultrasonic sensor, and its LEDs,
              buzzer and pump follow this twin. Flow readings are modelled.
            </span>
          ) : (
            <span>
              <strong>Simulation.</strong> No hardware is connected - every reading is generated by a model of
              the SWAMPDS pipeline.
            </span>
          )}
        </p>

        {/* Critical Alert Banner (Only shown during active leak) */}
        {sim.status === 'leak' && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <span>
                <strong>Pump Tripped:</strong> Confirmed leak in{' '}
                <span className="font-semibold underline">
                  {sim.leakSegments.map((id) => LEAK_SOURCES[id].label).join(' & ')}
                </span>
                . {sim.leakSegments.includes('L') ? 'Fix the leak, then reset.' : 'Close the valve to reset.'}
              </span>
            </div>
            <button
              onClick={twin.acknowledgeReset}
              className="px-3.5 py-2 min-h-[40px] rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors flex-shrink-0 cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}

        {/* Vector Pipeline Schematic */}
        <Card className="p-3 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <CardHeader
            title="Pipeline Architecture"
            icon={Workflow}
            iconColorClass="text-slate-500 dark:text-slate-400"
          />

          {/* View and tank animation preferences - saved to this browser (localStorage) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 -mt-1">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Pipeline view">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mr-0.5">View</span>
              {VIEWS.map(({ id, name }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={view === id}
                  onClick={() => setView(id)}
                  className={`px-2.5 py-2 min-h-[36px] text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${
                    view === id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            {view === '2d' && (
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Tank animation style">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mr-0.5">Tank style</span>
              {TANK_STYLES.map(({ id, name }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={tankStyle === id}
                  onClick={() => setTankStyle(id)}
                  className={`px-2.5 py-2 min-h-[36px] text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${
                    tankStyle === id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            )}
          </div>

          {view === '3d' ? (
            <Suspense
              fallback={
                <div className="w-full h-[300px] sm:h-[380px] rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse flex items-center justify-center text-xs text-slate-400">
                  Loading 3D view…
                </div>
              }
            >
              <Twin3D sim={sim} dark={darkMode} onToggleValve={(id, pct) => setValve(id, pct)} onTogglePump={togglePump} />
            </Suspense>
          ) : (
            <PipelineSchematic
              sim={sim}
              layout={wide ? 'full' : 'compact'}
              tankStyle={tankStyle}
              onToggleValve={(id, pct) => setValve(id, pct)}
              onTogglePump={togglePump}
            />
          )}
        </Card>

        {/* Balanced Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Controls & Diagnostics (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            <ControlPanel twin={twin} />
            <DetectionPanel sim={sim} config={config} />
          </div>

          {/* Right Column: Telemetry, Hardware & Events (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            <FlowChart data={chartData} animate={false} />
            <HardwarePanel
              outputs={outputs}
              soundOn={soundOn}
              onToggleSound={() => setSoundOn((v) => !v)}
            />
            <DemoGuide sim={sim} config={config} />
            <EventLog events={sim.events} startedAt={startedAt} />
          </div>
        </div>
      </main>

      {/* Report Modal */}
      <BridgeModal open={linkOpen} onClose={() => setLinkOpen(false)} bridge={bridge} />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        sim={sim}
        config={config}
        startedAt={startedAt}
      />
    </div>
  );
}
