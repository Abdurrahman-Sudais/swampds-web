import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flowSensorStatus, segmentLoss } from './flowStatus.js';

test('no flow at Sensor 1 means no sensor is judged', () => {
  assert.equal(flowSensorStatus('flow1', { flow1: 0.2, flow2: 0, flow3: 0 }).tone, 'idle');
  assert.equal(flowSensorStatus('flow2', { flow1: 0, flow2: 0, flow3: 0 }).label, 'No flow');
  assert.equal(flowSensorStatus('flow3', { flow1: 0, flow2: 0, flow3: 0 }).label, 'No flow');
});

test('Sensor 2 is judged against Sensor 1 with the published tolerance', () => {
  const sensors = { flow1: 10, flow2: 8.5, flow3: 8.5 }; // 15% lost
  assert.equal(flowSensorStatus('flow2', sensors, { tolerancePct: 20 }).tone, 'ok');
  assert.equal(flowSensorStatus('flow2', sensors, { tolerancePct: 10 }).tone, 'bad');
  assert.equal(flowSensorStatus('flow2', sensors, { tolerancePct: null }).tone, 'ok', 'falls back to 20%');
  assert.equal(Math.round(flowSensorStatus('flow2', sensors).lossPct), 15);
});

test('Sensor 3 is judged against Sensor 2, not Sensor 1', () => {
  // A leak in segment A lowers Sensor 2 and Sensor 3 alike: only Sensor 2 is flagged.
  const leakA = { flow1: 10, flow2: 6, flow3: 6 };
  assert.equal(flowSensorStatus('flow2', leakA).tone, 'bad');
  assert.equal(flowSensorStatus('flow3', leakA).tone, 'ok');
  assert.equal(flowSensorStatus('flow3', leakA).label, 'Matches Sensor 2');

  const leakB = { flow1: 10, flow2: 10, flow3: 6 };
  assert.equal(flowSensorStatus('flow2', leakB).tone, 'ok');
  assert.equal(flowSensorStatus('flow3', leakB).tone, 'bad');
  assert.equal(flowSensorStatus('flow3', leakB).label, 'Below Sensor 2');
});

test('any flow rate is fine for Sensor 1 - there is no fixed expected range', () => {
  assert.equal(flowSensorStatus('flow1', { flow1: 1.2, flow2: 1.2, flow3: 1.2 }).tone, 'ok');
  assert.equal(flowSensorStatus('flow1', { flow1: 25, flow2: 24, flow3: 24 }).tone, 'ok');
});

test('segment loss in L/min and %, with no % when the upstream sensor has no flow', () => {
  assert.deepEqual(segmentLoss({ flow2: 4, flow3: 3 }, 'flow2', 'flow3'), { lpm: 1, pct: 25 });
  assert.equal(segmentLoss({ flow2: 0.2, flow3: 0 }, 'flow2', 'flow3').pct, null);
});
