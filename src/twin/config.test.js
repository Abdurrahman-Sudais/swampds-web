import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validatePumpThresholds, PUMP_LIMITS, PUMP_ON_CM, PUMP_OFF_CM, FULL_SCALE_CM } from './config.js';

test('the default pump levels are allowed', () => {
  assert.equal(validatePumpThresholds(PUMP_ON_CM, PUMP_OFF_CM), null);
});

test('pump levels cannot go past the safe limits', () => {
  assert.match(validatePumpThresholds(1, 8), /at least 1.5 cm/);
  assert.match(validatePumpThresholds(2, 14), /at most 13.5 cm/);
  assert.match(validatePumpThresholds(2, FULL_SCALE_CM + 5), /at most/);
  assert.match(validatePumpThresholds(5, 6.5), /at least 2 cm above/);
  assert.match(validatePumpThresholds(NaN, 8), /numbers/);
  assert.match(validatePumpThresholds(undefined, undefined), /numbers/);
});

test('the edges of the limits are allowed', () => {
  assert.equal(validatePumpThresholds(PUMP_LIMITS.minOnCm, PUMP_LIMITS.maxOffCm), null);
  assert.equal(validatePumpThresholds(8, 10), null, 'exactly the minimum gap');
  assert.equal(validatePumpThresholds(2.1, 4.1), null, 'float rounding does not break the gap check');
});
