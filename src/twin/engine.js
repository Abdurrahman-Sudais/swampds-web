/**
 * @fileoverview Digital-twin simulation engine (pure, no React, no Firebase).
 *
 * Pipeline: SOURCE TANK -> PUMP -> F1 -> VALVE A -> F2 -> DELIVERY TANK.
 * Two flow sensors, so there is one monitored segment (A, between F1 and F2), matching
 * the 2-sensor prototype firmware. Pipe downstream of F2 is not monitored.
 *
 * Detection is compare-and-persist, as in the firmware: the share of F1's flow missing at F2 (%).
 * A difference above tolerance starts a timer (status "warning"); it lasting `persistSec`
 * declares a leak, which latches - the pump cuts off and the alarm stays on until the
 * operator resets it with the valve closed.
 *
 * Hardware-in-the-loop: when the prototype's ultrasonic sensor is linked (setMeasuredLevel),
 * the delivery tank level is the real measurement instead of a simulated one, and the source
 * tank is not drained (the real pump draws from the real source). The prototype's own
 * level-rate leak check (setLevelCheck) latches a leak here too, as segment 'L'.
 *
 * Every function takes a state and returns a new one. Randomness is injected (`rng`)
 * so tests are deterministic.
 */

import { DEFAULT_CONFIG } from './config.js';

const SEGMENT_IDS = ['A'];
const MAX_EVENTS = 200;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;

// State

const emptySegment = () => ({ diffPct: 0, abnormalFor: 0, leak: false });

/**
 * @returns the simulation state at power-on (pump idle, delivery tank low so auto mode starts it).
 * @param {{ mode?: 'auto'|'manual' }} [options]  'manual' starts with the pump off until an operator acts
 */
export function createInitialState({ mode = 'auto' } = {}) {
  return addEvent({
    t: 0,
    seq: 0,
    mode,                    // 'auto' | 'manual'
    manualCommand: 'off',    // 'on' | 'off' (used in manual mode)
    autoRun: false,          // auto-mode hysteresis memory
    pumpOn: false,           // relay closed and pump powered
    stopReason: null,        // why a wanted pump is held off: 'leak' | 'source-empty' | 'delivery-full'
    valves: { A: 0 },        // leak valve opening, 0-100 %
    tanks: { source: 100, delivery: 5 },  // percent full; below lowLevelPct so auto mode starts the pump
    measuredDelivery: null,  // real delivery level (%) from the hardware sensor, null = simulated
    levelCheck: null,        // the prototype's level-rate leak check, as it reports it (null = not linked)
    resets: 0,               // successful alarm resets; the prototype clears its own latch when this changes
    flows: { f1: 0, f2: 0 },              // sensor readings, L/min
    leakFlow: { A: 0 },                   // true water being lost, L/min (for the schematic)
    segments: { A: emptySegment() },
    status: 'normal',        // 'normal' | 'warning' | 'leak'
    latched: false,          // a leak was confirmed and not yet reset
    leakSegments: [],        // 'A' (flow F1 -> F2) and/or 'L' (level-rate check) while a leak is latched
    history: [],
    events: [],
  }, 'info', 'system', 'Digital twin started.');
}

/** Prepend an event (newest first) and return the new state. */
function addEvent(state, severity, source, message) {
  const seq = state.seq + 1;
  const event = { id: seq, t: state.t, severity, source, message };
  return { ...state, seq, events: [event, ...state.events].slice(0, MAX_EVENTS) };
}

// Simulation step

/**
 * Advance the simulation by `dt` seconds.
 * @param {object} state
 * @param {typeof DEFAULT_CONFIG} config
 * @param {number} dt   seconds
 * @param {() => number} [rng]   returns [0, 1)
 */
export function step(state, config = DEFAULT_CONFIG, dt = config.tickSec, rng = Math.random) {
  let s = { ...state, t: state.t + dt, tanks: { ...state.tanks } };

  s = decidePump(s, config);
  s = runPhysics(s, config, dt, rng);
  s = runDetection(s, config, dt);

  const sample = { t: round2(s.t), F1: s.flows.f1, F2: s.flows.f2, level: round2(s.tanks.delivery) };
  return { ...s, history: [...s.history, sample].slice(-config.historyLength) };
}

/** Decide whether the pump should run this tick (mode, hysteresis, protections). */
function decidePump(s, config) {
  let autoRun = s.autoRun;
  if (s.tanks.delivery <= config.lowLevelPct) autoRun = true;
  else if (s.tanks.delivery >= config.fullLevelPct) autoRun = false;

  const wanted = s.mode === 'auto' ? autoRun : s.manualCommand === 'on';

  let stopReason = null;
  if (s.latched) stopReason = 'leak';
  else if (s.tanks.source <= config.sourceEmptyPct) stopReason = 'source-empty';
  else if (s.tanks.delivery >= 100) stopReason = 'delivery-full';

  const pumpOn = wanted && stopReason === null;
  const heldReason = wanted ? stopReason : null;

  let next = { ...s, autoRun, pumpOn, stopReason: heldReason };

  if (pumpOn !== s.pumpOn) {
    next = addEvent(
      next, 'info', 'system',
      pumpOn
        ? `Pump started (${s.mode.toUpperCase()}).`
        : `Pump stopped (${s.mode.toUpperCase()}${heldReason ? `, ${STOP_REASON_TEXT[heldReason]}` : ''}).`,
    );
  }
  // 'leak' is announced by the detection step itself
  if (heldReason && heldReason !== 'leak' && heldReason !== s.stopReason) {
    next = addEvent(next, 'warning', 'system', `Pump held off: ${STOP_REASON_TEXT[heldReason]}.`);
  }
  return next;
}

const STOP_REASON_TEXT = {
  leak: 'leak protection cut-off',
  'source-empty': 'source tank empty',
  'delivery-full': 'delivery tank full',
};

/** Conserved-flow physics, sensor readings, and tank levels. */
function runPhysics(s, config, dt, rng) {
  const trueF1 = s.pumpOn ? config.baseFlowLpm : 0;
  const leakA = trueF1 * (s.valves.A / 100) * config.maxLeakFraction;
  const trueF2 = trueF1 - leakA;

  const read = (trueFlow, i) => {
    if (trueFlow <= 0) return 0;
    const noise = (rng() * 2 - 1) * config.noisePct;
    return round2(Math.max(0, trueFlow * (1 + (config.sensorBiasPct[i] + noise) / 100)));
  };

  const perMin = dt / 60;
  const measured = s.measuredDelivery;
  return {
    ...s,
    flows: { f1: read(trueF1, 0), f2: read(trueF2, 1) },
    leakFlow: { A: leakA },
    tanks: measured === null
      ? {
          source:   clamp(s.tanks.source   - (trueF1 * perMin / config.sourceCapacityL)   * 100, 0, 100),
          delivery: clamp(s.tanks.delivery + (trueF2 * perMin / config.deliveryCapacityL) * 100, 0, 100),
        }
      : { source: s.tanks.source, delivery: measured },
  };
}

/** Compare neighbouring sensors per segment; declare a leak only once it persists. */
function runDetection(s, config, dt) {
  const { f1, f2 } = s.flows;
  const pairs = { A: [f1, f2] };

  const segments = {};
  for (const id of SEGMENT_IDS) {
    const prev = s.segments[id];
    const [up, down] = pairs[id];

    if (up < config.minFlowLpm) {
      // no flow to judge (pump off): a confirmed leak keeps the numbers that triggered it,
      // anything still pending is dropped
      segments[id] = prev.leak ? prev : { diffPct: 0, abnormalFor: 0, leak: false };
      continue;
    }
    const diffPct = Math.max(0, ((up - down) / up) * 100); // only a loss counts, as in the firmware
    const abnormalFor = diffPct > config.tolerancePct ? prev.abnormalFor + dt : 0;
    segments[id] = { diffPct, abnormalFor, leak: prev.leak || abnormalFor >= config.persistSec };
  }

  let next = { ...s, segments };
  const newlyConfirmed = SEGMENT_IDS.filter((id) => segments[id].leak && !s.segments[id].leak);

  if (newlyConfirmed.length > 0) {
    const leakSegments = SEGMENT_IDS.filter((id) => segments[id].leak);
    const detail = newlyConfirmed
      .map((id) => `${id} (${SEG_TEXT[id]}): ${segments[id].diffPct.toFixed(1)}% difference for ${segments[id].abnormalFor.toFixed(1)} s`)
      .join('; ');
    next = {
      ...next,
      latched: true,
      leakSegments,
      status: 'leak',
      pumpOn: false,        // relay opens in the same tick so every output changes together
      stopReason: 'leak',
    };
    return addEvent(next, 'critical', 'system', `LEAK CONFIRMED on segment ${detail}. Pump cut off, alarm on.`);
  }

  if (next.latched) return { ...next, status: 'leak' };

  const pending = SEGMENT_IDS.filter((id) => segments[id].abnormalFor > 0);
  const levelPending = s.levelCheck?.abnormalSec > 0;   // the prototype's level-rate check is verifying
  const status = pending.length > 0 || levelPending ? 'warning' : 'normal';
  next = { ...next, status };

  if (status === 'warning' && s.status === 'normal') {
    next = addEvent(
      next, 'warning', 'system',
      pending.length > 0
        ? `Flow difference above ${config.tolerancePct}% on segment ${pending.join(' & ')} - watching for ${config.persistSec} s before declaring a leak.`
        : `Tank is filling slower than normal - watching for ${s.levelCheck.persistSec ?? 'a few'} s before declaring a leak.`,
    );
  } else if (status === 'normal' && s.status === 'warning') {
    next = addEvent(next, 'info', 'system', 'Readings returned within tolerance before the persistence window - no leak declared.');
  }
  return next;
}

const SEG_TEXT = { A: 'F1 → F2' };

// Operator actions

/** Set a leak valve's opening (0-100 %). Only opening/closing is logged, not every slider tick. */
export function setValve(state, id, percent) {
  const value = Math.round(clamp(Number(percent) || 0, 0, 100));
  const before = state.valves[id];
  let next = { ...state, valves: { ...state.valves, [id]: value } };
  if (before === 0 && value > 0) next = addEvent(next, 'info', 'operator', `Operator opened Valve ${id} (${value}%).`);
  else if (before > 0 && value === 0) next = addEvent(next, 'info', 'operator', `Operator closed Valve ${id}.`);
  return next;
}

const via = (origin) => (origin ? ` (from ${origin})` : '');

/**
 * Switch between 'auto' and 'manual'. Manual starts from the pump's current state.
 * `origin` names where the request came from (e.g. 'dashboard') for the event log.
 */
export function setMode(state, mode, origin) {
  if (mode === state.mode) return state;
  const next = { ...state, mode, manualCommand: state.pumpOn ? 'on' : 'off' };
  return addEvent(next, 'info', 'operator', `Operator switched to ${mode.toUpperCase()} mode${via(origin)}.`);
}

/** Start or stop the pump. Only honoured in manual mode. */
export function setManualCommand(state, command, origin) {
  if (state.mode !== 'manual' || command === state.manualCommand) return state;
  return addEvent({ ...state, manualCommand: command }, 'info', 'operator', `Operator commanded pump ${command.toUpperCase()}${via(origin)}.`);
}

/**
 * Acknowledge a leak alarm. Succeeds only when the leak valve is closed.
 * @returns {{ state: object, ok: boolean, reason?: string }}
 */
export function acknowledgeReset(state) {
  if (!state.latched) {
    return { state, ok: false, reason: 'There is no active leak alarm to reset.' };
  }
  if (state.valves.A > 0) {
    const reason = 'Close the leak valve before resetting.';
    return { state: addEvent(state, 'warning', 'operator', `Reset refused: ${reason.toLowerCase()}`), ok: false, reason };
  }
  const next = {
    ...state,
    latched: false,
    leakSegments: [],
    status: 'normal',
    stopReason: null,
    segments: { A: emptySegment() },
    resets: state.resets + 1,
  };
  return { state: addEvent(next, 'info', 'operator', 'Operator acknowledged the alarm and reset the system.'), ok: true };
}

/**
 * Link (percent, 0-100) or unlink (null) the real delivery-tank level from the hardware sensor.
 * While linked, the tank shows the measurement; unlinked, the simulation carries on from it.
 */
export function setMeasuredLevel(state, percent) {
  const value = Number.isFinite(percent) ? clamp(percent, 0, 100) : null;
  if (value === state.measuredDelivery) return state;
  const wasLinked = state.measuredDelivery !== null;
  const next = {
    ...state,
    measuredDelivery: value,
    tanks: value === null ? state.tanks : { ...state.tanks, delivery: value },
  };
  if (!wasLinked && value !== null) return addEvent(next, 'info', 'system', 'Hardware linked: delivery tank level now comes from the ultrasonic sensor.');
  if (wasLinked && value === null) return addEvent(next, 'warning', 'system', 'Hardware level sensor lost: delivery tank level is simulated until it returns.');
  return next;
}

/**
 * The prototype's level-rate check, as published (hardware/levelCheck), or null when unlinked.
 * A leak it newly reports latches the twin's alarm and cuts the pump, like a flow leak. Only the
 * change to "leak" counts, so a reset is not undone while the prototype catches up with it.
 */
export function setLevelCheck(state, check) {
  const wasLeak = state.levelCheck?.leak === true;
  let next = { ...state, levelCheck: check };
  if (!check?.leak || wasLeak) return next;
  if (next.leakSegments.includes('L')) return next;

  next = {
    ...next,
    latched: true,
    leakSegments: [...next.leakSegments, 'L'],
    status: 'leak',
    pumpOn: false,
    stopReason: 'leak',
  };
  const detail = Number.isFinite(check.risePct)
    ? `the tank rose only ${check.risePct}% of its normal rate for ${check.abnormalSec} s`
    : 'the tank stopped rising at its normal rate';
  return addEvent(next, 'critical', 'system',
    `LEAK CONFIRMED by the level-rate check: with the pump on, ${detail}. Water is being lost between the pump and the tank, or the source tank has run dry. Pump cut off, alarm on.`);
}

/** Refill the source tank to 100 % so the demo can be run again. */
export function refillSource(state) {
  return addEvent({ ...state, tanks: { ...state.tanks, source: 100 } }, 'info', 'operator', 'Operator refilled the source tank.');
}

/** Empty the delivery tank to 0 % so the demo can be run again. */
export function emptyDelivery(state) {
  return addEvent({ ...state, tanks: { ...state.tanks, delivery: 0 } }, 'info', 'operator', 'Operator emptied the delivery tank.');
}
