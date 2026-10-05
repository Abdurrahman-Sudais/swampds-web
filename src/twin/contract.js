/**
 * @fileoverview The Firebase data contract shared by the digital twin and the operator
 * dashboard. Pure functions only (no Firebase, no React) so it is easy to test.
 *
 * WHAT THE TWIN PUBLISHES (acting as the device):
 *   sensors/flow1, flow2, flow3, waterLevelPercent, waterLevelCm, lastUpdated   (ms epoch)
 *   system/status      'NORMAL' | 'WARNING' | 'LEAK'
 *   system/pumpState   'ON' | 'OFF'
 *   system/pumpMode    'AUTO' | 'MANUAL'   (mirror of status/controlMode)
 *   system/pumpStartedAt  ms epoch the current pump run began (absent while the pump is off)
 *   system/source      'digital-twin'      (so the dashboard can say the data is simulated)
 *   system/online      true
 *   system/leakSegments  'A' | 'B' | 'A,B' (plus ',L' / 'L' for the prototype's level-rate check;
 *                        absent when there is no leak). A = F1 -> F2, B = F2 -> F3
 *   system/hardwareLinked  true while the delivery level comes from the prototype's sensor
 *   hil/status, hil/pump, hil/heartbeat   outputs for the prototype to mirror (hardware-in-the-loop):
 *     the ESP32 drives its LEDs, buzzer and pump relay from these while the heartbeat keeps changing.
 *     On disconnect only hil/pump is cleared (pump off at once); the ESP32 lets go once the heartbeat is stale
 *   hil/reset          count of alarm resets; a change clears the prototype's latched level leak
 *   alerts/<pushId>    { time, severity, message, timestamp, source }
 *     - one is written when the twin connects to / disconnects from the dashboard
 *   pumpHistory/<pushId>  { date, start, end, duration, startTimestamp }
 *   twin/valves/A|B, twin/tolerancePct, twin/persistSec   (informational)
 *   twinLock           { clientId, uid, email, since, heartbeat }   (single-publisher lock)
 *
 * WHAT THE TWIN OBEYS (written by the dashboard):
 *   status/controlMode  'auto' | 'manual'
 *   control/pumpCommand 'on' | 'off'   (only in manual mode)
 *   config/pumpOnCm, config/pumpOffCm   admin-set auto-pump levels (cm); defaults when absent or unsafe
 *
 * WHAT THE TWIN READS FROM THE PROTOTYPE (written by the ESP32):
 *   hardware/levelCm, hardware/levelFault, hardware/lastSeen   the real delivery-tank level
 *   hardware/levelLeak, hardware/levelCheck/{state, risePct, abnormalSec, persistSec, windowSec, limitPct}
 *     the prototype's level-rate leak check (rise of the tank vs. its normal fill rate)
 */

import { PUMP_ON_CM, PUMP_OFF_CM, validatePumpThresholds, levelPct } from './config.js';

export const DATA_SOURCE = 'digital-twin';
export const PUBLISH_INTERVAL_MS = 1000;
export const LOCK_TTL_MS = 15_000;      // a lock whose heartbeat is older than this is up for grabs
export const STALE_AFTER_MS = 15_000;   // dashboard: no heartbeat change for this long = offline
export const HARDWARE_STALE_MS = 10_000; // twin: no hardware/lastSeen change for this long = level sensor unlinked

const STATUS_TEXT = { normal: 'NORMAL', warning: 'WARNING', leak: 'LEAK' };

const roundTo = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

// Snapshot

/**
 * Engine state -> the sensor/system/twin nodes the dashboard reads.
 * @param {number|null} pumpStartedAt  ms epoch the current pump run began (from the bridge's
 *   session tracker); included only while the pump is on, so the dashboard can show a real
 *   elapsed runtime instead of guessing from when its own page happened to load.
 */
export function toSnapshot(sim, config, now, pumpStartedAt = null) {
  return {
    sensors: {
      flow1: sim.flows.f1,
      flow2: sim.flows.f2,
      flow3: sim.flows.f3,
      waterLevelPercent: Math.round(sim.tanks.delivery),
      waterLevelCm: roundTo((sim.tanks.delivery / 100) * config.deliveryHeightCm, 1),
      lastUpdated: now,
    },
    system: {
      status: STATUS_TEXT[sim.status] ?? 'NORMAL',
      pumpState: sim.pumpOn ? 'ON' : 'OFF',
      pumpMode: sim.mode.toUpperCase(),
      source: DATA_SOURCE,
      online: true,
      leakSegments: sim.leakSegments.length > 0 ? sim.leakSegments.join(',') : null, // null deletes it
      pumpStartedAt: sim.pumpOn ? pumpStartedAt : null, // null deletes it - no stale value once the pump stops
      hardwareLinked: sim.measuredDelivery !== null,
    },
    hil: {
      status: STATUS_TEXT[sim.status] ?? 'NORMAL',
      pump: sim.pumpOn,
      heartbeat: now,
      reset: sim.resets,
    },
    twin: {
      valves: { A: sim.valves.A, B: sim.valves.B },
      tolerancePct: config.tolerancePct,
      persistSec: config.persistSec,
    },
  };
}

/** Nested object → { 'a/b/c': value } for a multi-path update (null values delete). */
export function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}/${key}` : key;
    if (value !== null && typeof value === 'object') flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

// Alerts & pump history

/** Warnings, alarms and system messages go to the dashboard; operator clicks on the twin do not. */
export function shouldPublishEvent(event) {
  return event.severity !== 'info' || event.source === 'system';
}

const plain = (text) => text.replace(/ /g, ' '); // ICU uses a narrow no-break space before AM/PM

const fmtTime = (ms) => plain(new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).replace(',', '');

/** Engine event → dashboard alert. `timestamp` orders the dashboard's list (newest first). */
export function eventToAlert(event, timestamp) {
  return {
    time: fmtTime(timestamp),
    severity: event.severity,
    message: event.message,
    timestamp,
    source: DATA_SOURCE,
  };
}

/**
 * Alert recorded when the twin starts or stops publishing to the dashboard, so the change
 * is visible in the dashboard's alert list and pumping-history event log, not just in a banner.
 * @param {'connected'|'disconnected'} kind
 * @param {string} [email]  who connected, if known
 */
export function connectionAlert(kind, email, timestamp) {
  const who = email ? ` by ${email}` : '';
  const message = kind === 'connected'
    ? `Digital twin connected${who}. This dashboard is now showing simulated data.`
    : `Digital twin disconnected${who}. Data will stop updating until it reconnects.`;
  return { time: fmtTime(timestamp), severity: 'info', message, timestamp, source: DATA_SOURCE };
}

/** Seconds → "20m 0s" (or "1h 5m 0s"), the format the pump-history page shows. */
export function formatDuration(totalSec) {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export const createPumpTracker = () => ({ startedAt: null });

/**
 * Watches the pump relay and emits one history row when a run ends.
 * @returns {{ tracker: object, session: object|null }}
 */
export function trackPump(tracker, pumpOn, now) {
  if (pumpOn && tracker.startedAt === null) return { tracker: { startedAt: now }, session: null };
  if (!pumpOn && tracker.startedAt !== null) {
    const start = tracker.startedAt;
    return {
      tracker: { startedAt: null },
      session: {
        date: fmtDate(start),
        start: fmtTime(start),
        end: fmtTime(now),
        duration: formatDuration((now - start) / 1000),
        startTimestamp: start,
      },
    };
  }
  return { tracker, session: null };
}

// Commands from the dashboard

const norm = (v) => (typeof v === 'string' ? v.toLowerCase() : null);

/**
 * What the twin should do about a value the dashboard wrote. Pass only the field that changed.
 * A mode change never also applies the pump command: the twin keeps the pump as it is
 * (bumpless) and republishes its own command, instead of obeying a stale one.
 * @returns {{ type: 'mode'|'command', value: string }[]}
 */
export function controlIntents(sim, remote) {
  const intents = [];
  const mode = norm(remote.controlMode);
  if ((mode === 'auto' || mode === 'manual') && mode !== sim.mode) {
    intents.push({ type: 'mode', value: mode });
    return intents;
  }
  const cmd = norm(remote.pumpCommand);
  if ((cmd === 'on' || cmd === 'off') && sim.mode === 'manual' && cmd !== sim.manualCommand) {
    intents.push({ type: 'command', value: cmd });
  }
  return intents;
}

/**
 * config/ node -> the twin's auto-pump levels (config patch). Missing or out-of-limit values fall
 * back to the defaults, exactly as the firmware does.
 */
export function pumpLevelsFromDb(config) {
  const ok = validatePumpThresholds(config?.pumpOnCm, config?.pumpOffCm) === null;
  return {
    lowLevelPct:  levelPct(ok ? config.pumpOnCm  : PUMP_ON_CM),
    fullLevelPct: levelPct(ok ? config.pumpOffCm : PUMP_OFF_CM),
  };
}

// Hardware-in-the-loop

/**
 * hardware/ node (written by the ESP32) -> real delivery level in %, or null when there is no
 * usable reading (no hardware, sensor fault, or the ESP32 has not published one yet).
 */
export function measuredLevelPct(hardware, config) {
  const cm = hardware?.levelCm;
  if (!Number.isFinite(cm) || hardware.levelFault === true) return null;
  return Math.min(100, Math.max(0, (cm / config.deliveryHeightCm) * 100));
}

const int = (v) => (Number.isFinite(v) ? v : null);

/**
 * hardware/ node -> the prototype's level-rate check, or null when the firmware does not run one.
 * risePct is null while it is not measuring (pump off, settling, window filling).
 */
export function levelCheckFromHardware(hardware) {
  const c = hardware?.levelCheck;
  if (!c || typeof c.state !== 'string') return null;
  return {
    state: c.state,
    risePct: Number.isFinite(c.risePct) && c.risePct >= 0 ? c.risePct : null,
    abnormalSec: int(c.abnormalSec) ?? 0,
    persistSec: int(c.persistSec),
    windowSec: int(c.windowSec),
    limitPct: int(c.limitPct),
    leak: hardware.levelLeak === true,
  };
}

// Single-publisher lock

/** May this client take the lock? Free, already ours, stale, or forced. */
export function canAcquireLock(current, { now, clientId, force = false }) {
  if (!current) return true;
  if (current.clientId === clientId) return true;
  if (force) return true;
  return now - (current.heartbeat ?? 0) > LOCK_TTL_MS;
}

// Dashboard side

/**
 * Should the operator dashboard warn about where its data comes from?
 * `receivedAt` is the LOCAL time the heartbeat last changed, so it does not depend on the
 * two machines' clocks agreeing.
 * @returns {{ kind: 'live'|'simulated'|'hybrid'|'offline', simulated: boolean, ageSec: number|null }}
 *   hybrid: the twin is publishing, with the prototype's level sensor and outputs linked
 */
export function describeDataSource(meta, now) {
  const simulated = meta?.source === DATA_SOURCE;
  const age = Number.isFinite(meta?.receivedAt) ? now - meta.receivedAt : null;
  const offline = meta?.online === false || (age !== null && age > STALE_AFTER_MS);
  const ageSec = age === null ? null : Math.round(age / 1000);
  if (offline) return { kind: 'offline', simulated, ageSec };
  if (simulated) return { kind: meta?.hardwareLinked ? 'hybrid' : 'simulated', simulated, ageSec };
  return { kind: 'live', simulated, ageSec };
}
