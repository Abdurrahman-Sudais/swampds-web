/**
 * @fileoverview SWAMPDS data layer - the only file that talks to Firebase.
 *
 * useSwampdsData()     live sensor + status + alerts snapshot (two flow sensors: flow1, flow2)
 * useChartHistory()    { flowData, waterLevelData } for trend charts, built from
 *                      readings recorded here as they arrive (Firebase keeps no history)
 * sendPumpCommand(cmd) write "on" | "off" to the pump command
 * setControlMode(mode) write "auto" | "manual" to the control mode
 * usePumpHistory()     pump on/off session log
 */

import { useState, useEffect } from 'react';
import { getDatabase, ref, onValue, set, push } from 'firebase/database';
import { app } from '../firebase/firebaseConfig';

const db = getDatabase(app);

/**
 * Auto-pump thresholds used by the firmware (PUMP_ON_BELOW_CM / PUMP_OFF_ABOVE_CM in an 18 cm tank).
 * Display values only - the web app does not enforce them. `low` / `full` are the same levels in %.
 */
const TANK_CM = 18;
export const PUMP_THRESHOLDS = {
  lowCm: 2,
  fullCm: 13,
  low:  Math.round((2 / TANK_CM) * 100),   // 11 %
  full: Math.round((13 / TANK_CM) * 100),  // 72 %
};

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

// Subscribe to the entire database root - updates push to all useSwampdsData() consumers
onValue(ref(db, '/'), (snap) => {
  const val = snap.val();
  if (!val) return;

  // Normalise alerts: Firebase stores objects with push-keys, convert to array
  let alerts = [];
  if (val.alerts) {
    if (Array.isArray(val.alerts)) {
      alerts = val.alerts;
    } else {
      alerts = Object.values(val.alerts)
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .slice(0, 10);
    }
  }

  // Map the backend structure and uppercase values to the frontend format
  const backendStatus = val.status || {};
  const backendSystem = val.system || {};
  const mappedStatus = {
    systemStatus:  backendSystem.status?.toLowerCase() ?? initialData.status.systemStatus,
    pumpStatus:    backendSystem.pumpState?.toLowerCase() ?? initialData.status.pumpStatus,
    controlMode:   backendStatus.controlMode?.toLowerCase() ?? initialData.status.controlMode,
    // ms epoch the current pump run began, so "Current Runtime" reflects the real elapsed time
    // instead of counting from whenever this page happened to load. Null while the pump is off.
    pumpStartedAt: backendSystem.pumpStartedAt ?? null,
  };

  const beat = val.sensors?.lastUpdated ?? null;
  const prev = _store.meta ?? initialData.meta;
  const meta = {
    source:      val.system?.source ?? null,
    online:      val.system?.online ?? null,
    lastUpdated: beat,
    receivedAt:  beat === null
      ? null
      : (beat !== prev.lastUpdated || prev.receivedAt === null ? Date.now() : prev.receivedAt),
  };

  _notify({
    sensors: val.sensors ?? initialData.sensors,
    status:  mappedStatus,
    control: val.control ?? initialData.control,
    alerts,
    detection: {
      tolerancePct: Number.isFinite(val.twin?.tolerancePct) ? val.twin.tolerancePct : null,
      persistSec:   Number.isFinite(val.twin?.persistSec)   ? val.twin.persistSec   : null,
    },
    loaded: true,
    meta,
  });

  if (val.sensors) _recordSample(val.sensors);
});

// Chart history (recorded from the live stream)
// Firebase only holds the latest sensor values, so trend data is built here:
// one sample per SAMPLE_INTERVAL_MS, kept for 24 h, persisted in localStorage
// so a page reload does not wipe the charts. Only records while the app is open.

const HISTORY_KEY        = 'swampds.history.v1';
const HISTORY_WINDOW_MS  = 24 * 60 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 5 * 1000; // 24h of history at this rate is ~17k points/line, still cheap to store and chart

// Includes seconds: below a 60s sample interval, several points in a row would otherwise
// carry the identical "HH:MM" label, which reads as duplicate/simultaneous readings.
const _timeLabel = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const _deriveCharts = (samples) => ({
  flowData:       samples.map(s => ({ time: _timeLabel(s.ts), F1: s.f1, F2: s.f2 })),
  waterLevelData: samples.map(s => ({ time: _timeLabel(s.ts), level: s.level })),
});

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
const _chartListeners = new Set();

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

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(_samples));
  } catch {
    // storage full or unavailable - charts still work for this session
  }
}

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
 * Subscribe to pump session history from Firebase.
 * Backend writes a new entry to /pumpHistory each time a pump session ends.
 *
 * Expected Firebase shape per entry:
 *   { date: "Sep 08 2026", start: "10:25 AM", end: "10:45 AM", duration: "20m 0s", startTimestamp: 1234567890 }
 *
 * @returns {{ date: string, start: string, end: string, duration: string }[]}
 */
export function usePumpHistory() {
  const [history, setHistory] = useState([]);

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
