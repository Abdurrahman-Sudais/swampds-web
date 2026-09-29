import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, reliableLeakOpening } from './config.js';
import { DEMO_PRESETS } from './presets.js';
import {
  createInitialState, step, setValve, setMode, setManualCommand,
  acknowledgeReset, refillSource, emptyDelivery,
} from './engine.js';
import { deriveOutputs } from './outputs.js';

// Deterministic random numbers so noise-based tests never flake.
function seeded(seed = 1) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CFG = DEFAULT_CONFIG;
const DT = CFG.tickSec;

const run = (state, ticks, config = CFG, rng = seeded(7)) => {
  for (let i = 0; i < ticks; i++) state = step(state, config, DT, rng);
  return state;
};

const runningPump = () => run(createInitialState(), 3);

/** Step until `pred(state)` is true, returning the state and elapsed seconds. */
function runUntil(state, pred, maxTicks = 200, config = CFG, rng = seeded(7)) {
  let elapsed = 0;
  for (let i = 0; i < maxTicks; i++) {
    state = step(state, config, DT, rng);
    elapsed += DT;
    if (pred(state)) return { state, elapsed };
  }
  throw new Error('condition not reached');
}

test('normal operation: pump starts in auto, delivery fills, source drains, status stays normal', () => {
  const s0 = createInitialState();
  const s = run(s0, 60);
  assert.equal(s.pumpOn, true);
  assert.ok(s.tanks.delivery > s0.tanks.delivery);
  assert.ok(s.tanks.source < s0.tanks.source);
  assert.equal(s.status, 'normal');
});

test('sensor noise and calibration bias alone never cause a warning or leak', () => {
  let s = createInitialState();
  const rng = seeded(42);
  for (let i = 0; i < 3000; i++) {
    s = step(s, CFG, DT, rng);
    if (s.tanks.delivery >= CFG.fullLevelPct - 1) s = emptyDelivery(s); // keep it running across many cycles
    if (s.tanks.source <= 10) s = refillSource(s);
    assert.equal(s.status, 'normal', `status left normal at tick ${i}`);
  }
});

test('flow is conserved: a leak reduces the downstream sensor and what reaches the tank', () => {
  const clean = { ...CFG, noisePct: 0, sensorBiasPct: [0, 0] };
  let s = setValve(runningPump(), 'A', 50);
  s = step(s, clean, DT, seeded());
  // 50% open * 0.6 max leak = 30% loss
  assert.ok(Math.abs(s.flows.f1 - 4.8) < 0.01);
  assert.ok(Math.abs(s.flows.f2 - 4.8 * 0.7) < 0.01);
  assert.deepEqual(Object.keys(s.flows), ['f1', 'f2'], 'two flow sensors');
});

test('a leak is declared only after the difference persists past the threshold duration', () => {
  let s = setValve(runningPump(), 'A', 100);
  let sawWarning = false;
  let elapsed = 0;
  while (s.status !== 'leak') {
    s = step(s, CFG, DT, seeded(3));
    elapsed += DT;
    if (s.status === 'warning') sawWarning = true;
    assert.ok(elapsed < 20, 'leak was never declared');
  }
  assert.ok(sawWarning, 'should pass through warning first');
  assert.ok(elapsed >= CFG.persistSec, `declared after only ${elapsed.toFixed(1)} s`);
  assert.ok(elapsed <= CFG.persistSec + 2 * DT, `declared too late: ${elapsed.toFixed(1)} s`);
});

test('a brief spike shorter than the persistence window does not declare a leak', () => {
  let s = setValve(runningPump(), 'A', 100);
  s = run(s, 2);                       // 1.4 s abnormal, window is 10 s
  assert.equal(s.status, 'warning');
  s = run(setValve(s, 'A', 0), 3);
  assert.equal(s.status, 'normal');
  assert.equal(s.latched, false);
  assert.ok(s.events.some((e) => e.message.includes('no leak declared')));
});

test('a confirmed leak is reported on segment A (F1 -> F2), the only monitored segment', () => {
  const { state } = runUntil(setValve(runningPump(), 'A', 100), (x) => x.latched);
  assert.deepEqual(state.leakSegments, ['A']);
});

test('confirmed leak cuts the pump in the same tick and every output agrees', () => {
  const { state: s } = runUntil(setValve(runningPump(), 'A', 100), (x) => x.latched);
  assert.equal(s.pumpOn, false);
  assert.equal(s.status, 'leak');

  const out = deriveOutputs(s);
  assert.deepEqual(out.leds, { green: false, yellow: false, red: true });
  assert.equal(out.buzzer, true);
  assert.equal(out.relay, 'open');

  // pump stays off while the alarm is latched, even if the valve is closed
  const held = run(setValve(s, 'A', 0), 10);
  assert.equal(held.pumpOn, false);
  assert.equal(held.status, 'leak');
});

test('a confirmed leak keeps its measured difference after the pump is cut', () => {
  const { state } = runUntil(setValve(runningPump(), 'A', 100), (x) => x.latched);
  const held = run(state, 10);
  assert.ok(held.segments.A.diffPct > CFG.tolerancePct);
  assert.ok(held.segments.A.abnormalFor >= CFG.persistSec);
  assert.equal(held.segments.A.leak, true);
});

test('leak protection overrides manual mode', () => {
  let s = setManualCommand(setMode(runningPump(), 'manual'), 'on');
  s = run(s, 2);
  assert.equal(s.pumpOn, true);
  const { state } = runUntil(setValve(s, 'A', 100), (x) => x.latched);
  assert.equal(state.pumpOn, false);
  assert.deepEqual(state.leakSegments, ['A']);
});

test('reset is refused while the valve is open, and works once it is closed', () => {
  let { state: s } = runUntil(setValve(runningPump(), 'A', 100), (x) => x.latched);

  const refused = acknowledgeReset(s);
  assert.equal(refused.ok, false);
  assert.equal(refused.state.latched, true);

  const closed = setValve(refused.state, 'A', 0);
  const accepted = acknowledgeReset(closed);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state.latched, false);
  assert.equal(accepted.state.status, 'normal');

  // auto control resumes and the system stays healthy
  s = run(accepted.state, 20);
  assert.equal(s.pumpOn, true);
  assert.equal(s.status, 'normal');
});

test('reset with no active alarm does nothing', () => {
  assert.equal(acknowledgeReset(createInitialState()).ok, false);
});

test('auto mode uses hysteresis: stops at the full level, restarts only at the low level', () => {
  let s = createInitialState();
  s = { ...s, tanks: { ...s.tanks, delivery: CFG.fullLevelPct - 0.1 } };
  s = { ...s, autoRun: true };
  const { state: full } = runUntil(s, (x) => !x.pumpOn);
  assert.ok(full.tanks.delivery >= CFG.fullLevelPct);

  const idle = run(full, 30);
  assert.equal(idle.pumpOn, false, 'must not restart between the thresholds');

  const low = emptyDelivery(idle);
  assert.equal(run(low, 2).pumpOn, true);
});

test('pump stops when the source tank is empty', () => {
  const s0 = createInitialState();
  const s = run({ ...s0, tanks: { ...s0.tanks, source: CFG.sourceEmptyPct } }, 3);
  assert.equal(s.pumpOn, false);
  assert.equal(s.stopReason, 'source-empty');
  assert.equal(run(refillSource(s), 3).pumpOn, true);
});

test('manual buttons are ignored in auto mode and work in manual mode', () => {
  const auto = createInitialState();
  assert.equal(setManualCommand(auto, 'on'), auto);

  const manual = setMode(run(createInitialState(), 3), 'manual');
  assert.equal(manual.manualCommand, 'on', 'manual takes over the pump state (bumpless)');
  const stopped = run(setManualCommand(manual, 'off'), 2);
  assert.equal(stopped.pumpOn, false);
});

test('rolling history keeps only the configured number of samples', () => {
  const s = run(createInitialState(), CFG.historyLength + 25);
  assert.equal(s.history.length, CFG.historyLength);
});

test('OLED alternates between readings and the leak warning during a leak', () => {
  const { state: s } = runUntil(setValve(runningPump(), 'A', 100), (x) => x.latched);
  const screens = new Set();
  let cur = s;
  for (let i = 0; i < 12; i++) {
    cur = step(cur, CFG, DT, seeded());
    screens.add(deriveOutputs(cur).oled.screen);
  }
  assert.deepEqual([...screens].sort(), ['readings', 'warning']);
  assert.ok(deriveOutputs(createInitialState()).oled.lines[0].startsWith('F1'));
});

test('operator actions are logged, but slider drags are not', () => {
  let s = createInitialState();
  const before = s.events.length;
  s = setValve(s, 'A', 10);   // opened
  s = setValve(s, 'A', 30);   // drag
  s = setValve(s, 'A', 55);   // drag
  s = setValve(s, 'A', 0);    // closed
  assert.equal(s.events.length - before, 2);
  assert.ok(s.events.every((e, i) => i === s.events.length - 1 || e.id > s.events[i + 1].id), 'newest first');
});


/** Fraction of 100 seeded runs in which a valve opened to `opening` % is confirmed as a leak within 20 s. */
function detectionRate(opening, config = CFG) {
  let hits = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const rng = seeded(seed);
    let s = run(createInitialState(), 3, config, rng);
    s = setValve(s, 'A', opening);
    for (let i = 0; i < 29 && !s.latched; i++) s = step(s, config, DT, rng);
    if (s.latched) hits++;
  }
  return hits / 100;
}

test('reliableLeakOpening is the smallest opening the detector really catches', () => {
  assert.equal(reliableLeakOpening(CFG), 39);
  assert.ok(detectionRate(reliableLeakOpening(CFG)) >= 0.98);
  assert.equal(detectionRate(25), 0, '25% opening loses 15% of flow, inside the 20% tolerance');

  const loose = { ...CFG, tolerancePct: 10 };
  assert.ok(detectionRate(reliableLeakOpening(loose), loose) >= 0.98);
});

test('every leak preset opens a valve far enough to be detected with default settings', () => {
  for (const preset of DEMO_PRESETS.filter((p) => p.id !== 'normal')) {
    const opened = { A: 0 };
    preset.apply({ setValve: (id, v) => { opened[id] = v; }, setMode() {}, refillSource() {} });
    assert.ok(
      opened.A >= reliableLeakOpening(CFG),
      `${preset.id} opens only ${JSON.stringify(opened)}`,
    );
  }
});
