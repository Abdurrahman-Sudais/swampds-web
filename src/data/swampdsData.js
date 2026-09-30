/**
 * @fileoverview SWAMPDS data layer - the only file that talks to Firebase.
 *
 * useSwampdsData()     live sensor + status + alerts snapshot (two flow sensors: flow1, flow2)
 * useChartHistory()    { flowData, waterLevelData } for trend charts, built from
 *                      readings recorded here as they arrive (Firebase keeps no history)
 * sendPumpCommand(cmd) write "on" | "off" to the pump command
 * setControlMode(mode) write "auto" | "manual" to the control mode
 * setPumpThresholds()  admin: write the auto-pump ON/OFF levels (cm) to config/
 * usePumpHistory()     pump on/off session log
 */

import { useState, useEffect } from 'react';
import { getDatabase, ref, onValue, set, update, query, orderByKey, limitToLast } from 'firebase/database';
import { app } from '../firebase/firebaseConfig';
import { PUMP_ON_CM, PUMP_OFF_CM, validatePumpThresholds, levelPct } from '../twin/config.js';

const db = getDatabase(app);

/**
 * Auto-pump thresholds in force: the admin-set values in config/ when they are valid, otherwise
 * the firmware defaults. `low` / `full` are the same levels in %, where 100 % is the highest
 * level the sensor can safely measure.
 */
function _thresholds(config) {
  const custom = validatePumpThresholds(config?.pumpOnCm, config?.pumpOffCm) === null;
  const lowCm  = custom ? config.pumpOnCm  : PUMP_ON_CM;
  const fullCm = custom ? config.pumpOffCm : PUMP_OFF_CM;
  return { lowCm, fullCm, low: Math.round(levelPct(lowCm)), full: Math.round(levelPct(fullCm)), custom };
}

// Live store (populated by Firebase onValue)

const initialData = {
  sensors: {
    flow1: 0, flow2: 0,
    waterLevelPercent: 0, waterLevelCm: 0,
    lastUpdated: Date.now(),
  },
  status:  { systemStatus: 'normal', pumpStatus: 'off', controlMode: 'auto' },
  control: { pumpCommand: 'off' },
  alerts:  [],
  // Leak rule in use, as published by the device or twin (twin/tolerancePct, twin/persistSec).
  // Null until something publishes it.
  detection: { tolerancePct: null, persistSec: null },
  thresholds: _thresholds(null),
  // What the ESP32 reports it is actually using (hardware/pumpOnCm, pumpOffCm); null without hardware
  deviceThresholds: null,
  loaded:  false, // true once the first real Firebase snapshot has arrived
  // Where the data comes from. `receivedAt` is the LOCAL time the heartbeat (sensors/lastUpdated)
  // last changed, so staleness does not depend on the publisher's clock being right.
  meta:    { source: null, online: null, lastUpdated: null, receivedAt: null },
};

let _store = { ...initialData };
const _listeners = new Set();

const _notify = (snapshot) => {
  _store = snapshot;
  _listeners.forEach(fn => fn(snapshot));
};

// Live listeners. One per node rather than one on the database root: a root listener
// re-reads and re-sorts the whole tree (every alert and pump-history row ever written)
// on each 1-2 s sensor update, which gets slower the longer the system runs.

const ALERTS_SHOWN = 10;
const _raw = { sensors: null, system: null, status: null, control: null, twin: null, config: null, hardware: null, alerts: null };
const _seen = new Set(); // nodes whose first snapshot has arrived

function _rebuild() {
  // Normalise alerts: Firebase stores objects with push-keys, convert to array (newest first)
  let alerts = [];
  if (_raw.alerts) {
    alerts = Array.isArray(_raw.alerts)
      ? _raw.alerts
      : Object.values(_raw.alerts)
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
          .slice(0, ALERTS_SHOWN);
  }

  // Map the backend structure and uppercase values to the frontend format
  const backendStatus = _raw.status || {};
  const backendSystem = _raw.system || {};
  const mappedStatus = {
    systemStatus:  backendSystem.status?.toLowerCase() ?? initialData.status.systemStatus,
    pumpStatus:    backendSystem.pumpState?.toLowerCase() ?? initialData.status.pumpStatus,
    controlMode:   backendStatus.controlMode?.toLowerCase() ?? initialData.status.controlMode,
    // ms epoch the current pump run began, so "Current Runtime" reflects the real elapsed time
    // instead of counting from whenever this page happened to load. Null while the pump is off.
    pumpStartedAt: backendSystem.pumpStartedAt ?? null,
  };

  const beat = _raw.sensors?.lastUpdated ?? null;
  const prev = _store.meta ?? initialData.meta;
  const meta = {
    source:      backendSystem.source ?? null,
    online:      backendSystem.online ?? null,
    lastUpdated: beat,
    receivedAt:  beat === null
      ? null
      : (beat !== prev.lastUpdated || prev.receivedAt === null ? Date.now() : prev.receivedAt),
  };

  _notify({
    sensors: _raw.sensors ?? initialData.sensors,
    status:  mappedStatus,
    control: _raw.control ?? initialData.control,
    alerts,
    detection: {
      tolerancePct: Number.isFinite(_raw.twin?.tolerancePct) ? _raw.twin.tolerancePct : null,
      persistSec:   Number.isFinite(_raw.twin?.persistSec)   ? _raw.twin.persistSec   : null,
    },
    thresholds: _thresholds(_raw.config),
    deviceThresholds: Number.isFinite(_raw.hardware?.pumpOnCm) && Number.isFinite(_raw.hardware?.pumpOffCm)
      ? { lowCm: _raw.hardware.pumpOnCm, fullCm: _raw.hardware.pumpOffCm }
      : null,
    loaded: _seen.size > 0,
    meta,
  });
}

function _listen(key, source) {
  onValue(source, (snap) => {
    _raw[key] = snap.val();
    _seen.add(key);
    _rebuild();
    if (key === 'sensors' && _raw.sensors) _recordSample(_raw.sensors);
  });
}

// Chart history (recorded from the live stream)
// Firebase only holds the latest sensor values, so trend data is built here:
// one sample per SAMPLE_INTERVAL_MS, kept for 24 h, persisted in localStorage
// so a page reload does not wipe the charts. Only records while the app is open.
// The charts get a thinned copy (at most MAX_CHART_POINTS per line): a chart a few hundred
// pixels wide cannot show 17k points, and drawing them all made every update slow.

const HISTORY_KEY        = 'swampds.history.v1';
const HISTORY_WINDOW_MS  = 24 * 60 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 5 * 1000; // 24h of history at this rate is ~17k points/line
const MAX_CHART_POINTS   = 300;
const SAVE_EVERY_MS      = 30 * 1000; // localStorage write rate (the full history is ~1 MB of JSON)

// Includes seconds: below a 60s sample interval, several points in a row would otherwise
// carry the identical "HH:MM" label, which reads as duplicate/simultaneous readings.
const _timeLabel = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Keep the newest sample of each time bucket. Buckets are aligned to the clock (not to the
 * array index), so existing points do not shift sideways every time a new sample arrives.
 */
export function thinSamples(samples, maxPoints = MAX_CHART_POINTS, stepMs = SAMPLE_INTERVAL_MS) {
  if (samples.length <= maxPoints) return samples;
  const span = samples[samples.length - 1].ts - samples[0].ts;
  const bucketMs = Math.max(stepMs, Math.ceil(span / maxPoints / stepMs) * stepMs);
  const out = [];
  for (const s of samples) {
    const bucket = Math.floor(s.ts / bucketMs);
    if (out.length && Math.floor(out[out.length - 1].ts / bucketMs) === bucket) out[out.length - 1] = s;
    else out.push(s);
  }
  return out;
}

const _deriveCharts = (samples) => {
  const shown = thinSamples(samples).map(s => ({ ...s, time: _timeLabel(s.ts) }));
  return {
    flowData:       shown.map(s => ({ time: s.time, F1: s.f1, F2: s.f2 })),
    waterLevelData: shown.map(s => ({ time: s.time, level: s.level })),
  };
};

function _loadSamples() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    const cutoff = Date.now() - HISTORY_WINDOW_MS;
    return Array.isArray(raw) ? raw.filter(s => Number.isFinite(s?.ts) && s.ts >= cutoff) : [];
  } catch {
    return [];
  }
}

let _samples = _loadSamples();
let _charts  = _deriveCharts(_samples);
let _lastSave = 0;
const _chartListeners = new Set();

function _save() {
  _lastSave = Date.now();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(_samples));
  } catch {
    // storage full or unavailable - charts still work for this session
  }
}
// Keep the last (unsaved) samples when the tab closes
if (typeof window !== 'undefined') window.addEventListener('pagehide', _save);

function _recordSample(sensors) {
  const f1 = Number(sensors.flow1);
  const f2 = Number(sensors.flow2);
  const level = Number(sensors.waterLevelPercent);
  if (![f1, f2, level].every(Number.isFinite)) return;

  const now  = Date.now();
  const last = _samples[_samples.length - 1];
  if (last && now - last.ts < SAMPLE_INTERVAL_MS) return;

  const cutoff = now - HISTORY_WINDOW_MS;
  _samples = [..._samples.filter(s => s.ts >= cutoff), { ts: now, f1, f2, level }];
  _charts  = _deriveCharts(_samples);
  _chartListeners.forEach(fn => fn(_charts));

  if (now - _lastSave >= SAVE_EVERY_MS) _save();
}

for (const key of ['sensors', 'system', 'status', 'control', 'twin', 'config', 'hardware']) _listen(key, ref(db, key));
// Push keys sort by creation time, so the last N keys are the newest alerts (no index needed)
_listen('alerts', query(ref(db, 'alerts'), orderByKey(), limitToLast(ALERTS_SHOWN)));

// PUBLIC HOOKS & COMMANDS

/**
 * Subscribe to live sensor, status, and alert data.
 * @returns {{ sensors: object, status: object, control: object, alerts: object[] }}
 */
export function useSwampdsData() {
  const [data, setData] = useState(_store);
  useEffect(() => {
    setData(_store);
    _listeners.add(setData);
    return () => _listeners.delete(setData);
  }, []);
  return data;
}

/**
 * Subscribe to chart data recorded from live readings (24 h rolling window).
 * Arrays are empty until the first samples are recorded.
 * @returns {{ flowData: object[], waterLevelData: object[] }}
 */
export function useChartHistory() {
  const [history, setHistory] = useState(_charts);
  useEffect(() => {
    setHistory(_charts);
    _chartListeners.add(setHistory);
    return () => _chartListeners.delete(setHistory);
  }, []);
  return history;
}

/**
 * Issue a pump on/off command - writes to Firebase.
 * @param {'on'|'off'} command
 */
export function sendPumpCommand(command) {
  set(ref(db, 'control/pumpCommand'), command);
}

/**
 * Switch between automatic and manual control modes - writes to Firebase.
 * @param {'auto'|'manual'} mode
 */
export function setControlMode(mode) {
  set(ref(db, 'status/controlMode'), mode);
}

/**
 * Admin only: set the auto-pump ON/OFF water levels (cm). Checked here and again by the database
 * rules and the firmware, so an unsafe pair is refused rather than sent to the pump.
 * @returns {Promise<void>} rejects with a readable message if the pair is not allowed or the write fails
 */
export async function setPumpThresholds(onCm, offCm) {
  const problem = validatePumpThresholds(onCm, offCm);
  if (problem) throw new Error(problem);
  await update(ref(db, 'config'), { pumpOnCm: onCm, pumpOffCm: offCm });
}

/** Admin only: go back to the firmware's default levels. */
export async function resetPumpThresholds() {
  await set(ref(db, 'config'), null);
}

/**
 * Subscribe to pump session history from Firebase.
 * Backend writes a new entry to /pumpHistory each time a pump session ends.
 *
 * Expected Firebase shape per entry:
 *   { date: "Sep 08 2026", start: "10:25 AM", end: "10:45 AM", duration: "20m 0s", startTimestamp: 1234567890 }
 *
 * @returns {{ date: string, start: string, end: string, duration: string }[] | null} null while loading
 */
export function usePumpHistory() {
  const [history, setHistory] = useState(null); // null until the first snapshot arrives

  useEffect(() => {
    const historyRef = ref(db, 'pumpHistory');
    const unsubscribe = onValue(historyRef, (snap) => {
      const val = snap.val();
      if (!val) {
        setHistory([]);
        return;
      }
      // Firebase push-keys come back as an object: convert and sort newest first
      const rows = Array.isArray(val)
        ? val
        : Object.values(val).sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));
      setHistory(rows.slice(0, 50)); // cap at 50 rows
    });
    return unsubscribe;
  }, []);

  return history;
}
