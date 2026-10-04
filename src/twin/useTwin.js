import { useState, useEffect, useRef, useCallback } from 'react';
import { DEFAULT_CONFIG } from './config.js';
import * as engine from './engine.js';
import { setBackgroundInterval, clearBackgroundInterval } from './backgroundTimer.js';

const NOTICE_MS = 4000;
const MAX_CATCH_UP_TICKS = 100; // after a long stall (laptop asleep), don't replay more than ~70 s at once

/**
 * Runs the digital-twin engine on a fixed interval and exposes its operator actions.
 * Config changes (tolerance, persistence, ...) apply from the next tick.
 * @param {{ initialMode?: 'auto'|'manual' }} [options]  mode at start and after restart
 */
export function useTwin({ initialMode = 'auto' } = {}) {
  const [sim, setSim]             = useState(() => engine.createInitialState({ mode: initialMode }));
  const [config, setConfig]       = useState(DEFAULT_CONFIG);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [notice, setNotice]       = useState(null); // feedback for the last reset attempt

  // Latest values for callbacks/timers that must not be re-created on every tick
  const simRef    = useRef(sim);
  const configRef = useRef(config);
  useEffect(() => { simRef.current = sim; }, [sim]);
  useEffect(() => { configRef.current = config; }, [config]);

  // Step the engine by real elapsed time, not by timer callbacks: if the browser delivers ticks
  // late, the missed steps are run together, so the twin (and what it publishes) keeps real time.
  useEffect(() => {
    const tickMs = config.tickSec * 1000;
    let last = Date.now();
    const handle = setBackgroundInterval(() => {
      const owed = Math.floor((Date.now() - last) / tickMs);
      if (owed < 1) return;
      last += owed * tickMs;
      const ticks = Math.min(owed, MAX_CATCH_UP_TICKS);
      setSim((s) => {
        for (let i = 0; i < ticks; i++) s = engine.step(s, configRef.current);
        return s;
      });
    }, tickMs);
    return () => clearBackgroundInterval(handle);
  }, [config.tickSec]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const setValve         = useCallback((id, pct) => setSim((s) => engine.setValve(s, id, pct)), []);
  const setMode          = useCallback((mode, origin) => setSim((s) => engine.setMode(s, mode, origin)), []);
  const setManualCommand = useCallback((cmd, origin) => setSim((s) => engine.setManualCommand(s, cmd, origin)), []);
  const refillSource     = useCallback(() => setSim((s) => engine.refillSource(s)), []);
  const emptyDelivery    = useCallback(() => setSim((s) => engine.emptyDelivery(s)), []);
  const setHardware      = useCallback(({ levelPct, levelCheck }) =>
    setSim((s) => engine.setLevelCheck(engine.setMeasuredLevel(s, levelPct), levelCheck)), []);

  const acknowledgeReset = useCallback(() => {
    const result = engine.acknowledgeReset(simRef.current);
    setSim(result.state);
    setNotice(result.ok
      ? { ok: true, text: 'Alarm acknowledged. System reset.' }
      : { ok: false, text: result.reason });
  }, []);

  const updateConfig  = useCallback((patch) => setConfig((c) => ({ ...c, ...patch })), []);
  const resetConfig   = useCallback(() => setConfig(DEFAULT_CONFIG), []);

  const restart = useCallback(() => {
    setSim(engine.createInitialState({ mode: initialMode }));
    setStartedAt(Date.now());
    setNotice(null);
  }, [initialMode]);

  return {
    sim, config, startedAt, notice,
    setValve, setMode, setManualCommand, acknowledgeReset,
    refillSource, emptyDelivery, setHardware, updateConfig, resetConfig, restart,
  };
}
