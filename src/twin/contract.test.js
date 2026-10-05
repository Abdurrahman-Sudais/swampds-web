import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG as CFG } from './config.js';
import { createInitialState, step, setValve, setMode, setMeasuredLevel } from './engine.js';
import {
  toSnapshot, flatten, shouldPublishEvent, eventToAlert, connectionAlert, formatDuration,
  createPumpTracker, trackPump, controlIntents, canAcquireLock, describeDataSource, measuredLevelPct, levelCheckFromHardware,
  DATA_SOURCE, LOCK_TTL_MS, STALE_AFTER_MS,
} from './contract.js';

const run = (s, n) => { for (let i = 0; i < n; i++) s = step(s, CFG, CFG.tickSec, () => 0.5); return s; };

test('snapshot maps the engine state to what the dashboard reads', () => {
  const s = run(createInitialState(), 5);
  const snap = toSnapshot(s, CFG, 1_700_000_000_000);

  assert.equal(snap.sensors.flow1, s.flows.f1);
  assert.equal(snap.sensors.waterLevelPercent, Math.round(s.tanks.delivery));
  assert.equal(snap.sensors.waterLevelCm, Math.round((s.tanks.delivery / 100) * CFG.deliveryHeightCm * 10) / 10);
  assert.equal(snap.sensors.lastUpdated, 1_700_000_000_000);
  assert.deepEqual(
    { status: snap.system.status, pump: snap.system.pumpState, mode: snap.system.pumpMode, src: snap.system.source, online: snap.system.online },
    { status: 'NORMAL', pump: 'ON', mode: 'AUTO', src: DATA_SOURCE, online: true },
  );
  assert.equal(snap.system.leakSegments, null, 'no leak -> field is deleted');
  assert.equal(snap.system.pumpStartedAt, null, 'no start time passed in -> field is deleted');
});

test('snapshot reports a real pump-start time while the pump is on, and clears it once it stops', () => {
  const running = run(createInitialState(), 3);
  assert.equal(toSnapshot(running, CFG, 999, 12_345).system.pumpStartedAt, 12_345);

  let s = running;
  for (let i = 0; i < 200 && s.pumpOn; i++) s = step(s, CFG, CFG.tickSec, () => 0.5); // wait for the tank to fill and the pump to stop
  assert.equal(s.pumpOn, false);
  assert.equal(toSnapshot(s, CFG, 999, 12_345).system.pumpStartedAt, null, 'stale start time must not linger once the pump is off');
});

test('snapshot reports a leak with its segments', () => {
  let s = setValve(setValve(run(createInitialState(), 3), 'A', 100), 'B', 100);
  s = run(s, Math.ceil(CFG.persistSec / CFG.tickSec) + 2);
  const snap = toSnapshot(s, CFG, 1);
  assert.equal(snap.system.status, 'LEAK');
  assert.equal(snap.system.leakSegments, 'A,B');
  assert.equal(snap.system.pumpState, 'OFF');
  assert.deepEqual(snap.twin.valves, { A: 100, B: 100 });
});

test('snapshot publishes all three flow sensors', () => {
  const s = run(createInitialState(), 5);
  const snap = toSnapshot(s, CFG, 1);
  assert.equal(snap.sensors.flow1, s.flows.f1);
  assert.equal(snap.sensors.flow2, s.flows.f2);
  assert.equal(snap.sensors.flow3, s.flows.f3);
});

test('flatten builds multi-path updates and keeps nulls (which delete)', () => {
  assert.deepEqual(flatten({ a: { b: 1, c: { d: 'x' } }, e: null }), { 'a/b': 1, 'a/c/d': 'x', e: null });
});

test('only warnings, alarms and system messages reach the dashboard alerts', () => {
  assert.equal(shouldPublishEvent({ severity: 'critical', source: 'system' }), true);
  assert.equal(shouldPublishEvent({ severity: 'warning', source: 'operator' }), true);
  assert.equal(shouldPublishEvent({ severity: 'info', source: 'system' }), true);
  assert.equal(shouldPublishEvent({ severity: 'info', source: 'operator' }), false);
});

test('alerts use the dashboard shape and a plain-space "10:25 AM" time', () => {
  const ts = new Date(2026, 8, 8, 10, 25, 30).getTime();
  const alert = eventToAlert({ severity: 'critical', message: 'LEAK', source: 'system' }, ts);
  assert.deepEqual(alert, { time: '10:25 AM', severity: 'critical', message: 'LEAK', timestamp: ts, source: DATA_SOURCE });
});

test('connection alerts are visible dashboard entries, not just a banner', () => {
  const ts = new Date(2026, 8, 8, 10, 25, 30).getTime();

  const connected = connectionAlert('connected', 'alice@team.test', ts);
  assert.equal(connected.severity, 'info');
  assert.equal(connected.source, DATA_SOURCE);
  assert.equal(connected.timestamp, ts);
  assert.match(connected.message, /connected by alice@team\.test/);
  assert.match(connected.message, /simulated data/i);

  const disconnected = connectionAlert('disconnected', 'alice@team.test', ts);
  assert.match(disconnected.message, /disconnected by alice@team\.test/);

  const anonymous = connectionAlert('connected', undefined, ts);
  assert.doesNotMatch(anonymous.message, / by /, 'no email -> no dangling "by"');
});

test('durations match the pump-history format', () => {
  assert.equal(formatDuration(1200), '20m 0s');
  assert.equal(formatDuration(59.6), '1m 0s');
  assert.equal(formatDuration(3905), '1h 5m 5s');
});

test('a pump run becomes one history row when it ends', () => {
  const start = new Date(2026, 8, 8, 10, 25, 0).getTime();
  const end = start + 20 * 60 * 1000;

  let r = trackPump(createPumpTracker(), false, start);
  assert.equal(r.session, null);
  r = trackPump(r.tracker, true, start);
  assert.equal(r.session, null);
  r = trackPump(r.tracker, true, start + 5000);
  assert.equal(r.session, null);
  r = trackPump(r.tracker, false, end);
  assert.deepEqual(r.session, {
    date: 'Sep 08 2026', start: '10:25 AM', end: '10:45 AM', duration: '20m 0s', startTimestamp: start,
  });
  assert.equal(trackPump(r.tracker, false, end + 1000).session, null, 'no duplicate row');
});

test('dashboard commands: mode changes and manual pump commands', () => {
  const auto = createInitialState();
  assert.deepEqual(controlIntents(auto, { controlMode: 'MANUAL' }), [{ type: 'mode', value: 'manual' }], 'case-insensitive');
  assert.deepEqual(controlIntents(auto, { controlMode: 'auto' }), [], 'already in that mode');
  assert.deepEqual(controlIntents(auto, { controlMode: 'banana' }), []);

  assert.deepEqual(controlIntents(auto, { pumpCommand: 'on' }), [], 'pump commands are ignored in auto mode');
  const manual = setMode(auto, 'manual');
  assert.deepEqual(controlIntents(manual, { pumpCommand: 'on' }), [{ type: 'command', value: 'on' }]);
  assert.deepEqual(controlIntents(manual, { pumpCommand: 'off' }), [], 'already off');
});

test('the lock: free, own, stale and forced are acquirable; a fresh foreign lock is not', () => {
  const now = 1_000_000;
  const other = { clientId: 'B', heartbeat: now - 1000 };
  assert.equal(canAcquireLock(null, { now, clientId: 'A' }), true);
  assert.equal(canAcquireLock({ clientId: 'A', heartbeat: now }, { now, clientId: 'A' }), true);
  assert.equal(canAcquireLock(other, { now, clientId: 'A' }), false);
  assert.equal(canAcquireLock({ clientId: 'B', heartbeat: now - LOCK_TTL_MS - 1 }, { now, clientId: 'A' }), true);
  assert.equal(canAcquireLock(other, { now, clientId: 'A', force: true }), true);
});

test('the dashboard says where its data comes from and when it goes quiet', () => {
  const now = 1_000_000;
  assert.equal(describeDataSource({ source: null, receivedAt: null }, now).kind, 'live', 'unknown age: say nothing');
  assert.equal(describeDataSource({ source: DATA_SOURCE, online: true, receivedAt: now - 2000 }, now).kind, 'simulated');
  assert.equal(describeDataSource({ source: DATA_SOURCE, online: true, receivedAt: now - STALE_AFTER_MS - 1000 }, now).kind, 'offline');
  assert.equal(describeDataSource({ source: DATA_SOURCE, online: false, receivedAt: now }, now).kind, 'offline');
  const real = describeDataSource({ source: 'esp32', online: true, receivedAt: now - 1000 }, now);
  assert.equal(real.kind, 'live');
  assert.equal(real.simulated, false);
});

test('snapshot carries the outputs the prototype mirrors (hil/) and whether hardware is linked', () => {
  let sim = setValve(createInitialState(), 'A', 100);
  sim = run(sim, 40);                                       // leak confirmed, pump cut
  const snap = toSnapshot(sim, CFG, 7_000);
  assert.deepEqual(snap.hil, { status: 'LEAK', pump: false, heartbeat: 7_000, reset: 0 });
  assert.equal(snap.system.hardwareLinked, false);
  assert.equal(toSnapshot(setMeasuredLevel(sim, 30), CFG, 7_000).system.hardwareLinked, true);
});

test('hardware level: cm -> % of the safe level, nothing on a fault or missing reading', () => {
  assert.equal(measuredLevelPct({ levelCm: CFG.deliveryHeightCm / 2 }, CFG), 50);
  assert.equal(measuredLevelPct({ levelCm: 99 }, CFG), 100);
  assert.equal(measuredLevelPct({ levelCm: 5, levelFault: true }, CFG), null);
  assert.equal(measuredLevelPct({ pumpOnCm: 2 }, CFG), null, 'old firmware without levelCm');
  assert.equal(measuredLevelPct(null, CFG), null);
});

test('data source says hybrid when the twin publishes with hardware linked', () => {
  const now = 100_000;
  const meta = { source: DATA_SOURCE, online: true, hardwareLinked: true, receivedAt: now - 1000 };
  assert.equal(describeDataSource(meta, now).kind, 'hybrid');
  assert.equal(describeDataSource({ ...meta, online: false }, now).kind, 'offline');
});

test('level-rate check: parsed from hardware/, absent on firmware without it', () => {
  const hw = { levelLeak: true, levelCheck: { state: 'leak', risePct: 20, abnormalSec: 6, persistSec: 6, windowSec: 15, limitPct: 60 } };
  assert.deepEqual(levelCheckFromHardware(hw),
    { state: 'leak', risePct: 20, abnormalSec: 6, persistSec: 6, windowSec: 15, limitPct: 60, leak: true });
  assert.equal(levelCheckFromHardware({ ...hw, levelCheck: { ...hw.levelCheck, risePct: -1 } }).risePct, null, '-1 = not measuring');
  assert.equal(levelCheckFromHardware({ levelCm: 5 }), null);
});
