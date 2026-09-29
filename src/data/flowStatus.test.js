import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flowSensorStatus } from './flowStatus.js';

test('no flow at Sensor 1 means neither sensor is judged', () => {
  assert.equal(flowSensorStatus('flow1', { flow1: 0.2, flow2: 0 }).tone, 'idle');
  assert.equal(flowSensorStatus('flow2', { flow1: 0, flow2: 0 }).label, 'No flow');
});

test('Sensor 2 is judged against Sensor 1 with the published tolerance', () => {
  const sensors = { flow1: 10, flow2: 8.5 }; // 15% lost
  assert.equal(flowSensorStatus('flow2', sensors, { tolerancePct: 20 }).tone, 'ok');
  assert.equal(flowSensorStatus('flow2', sensors, { tolerancePct: 10 }).tone, 'bad');
  assert.equal(flowSensorStatus('flow2', sensors, { tolerancePct: null }).tone, 'ok', 'falls back to 20%');
  assert.equal(Math.round(flowSensorStatus('flow2', sensors).lossPct), 15);
});

test('any flow rate is fine for Sensor 1 - there is no fixed expected range', () => {
  assert.equal(flowSensorStatus('flow1', { flow1: 1.2, flow2: 1.2 }).tone, 'ok');
  assert.equal(flowSensorStatus('flow1', { flow1: 25, flow2: 24 }).tone, 'ok');
});
