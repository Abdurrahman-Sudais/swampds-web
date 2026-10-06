import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PREFS, normalizePrefs, pickNewAlerts, latestTimestamp, alertNotification, connectionNotification,
} from './notifications.js';

const all = { ...DEFAULT_PREFS, enabled: true };
const alerts = [ // newest first, as the data layer returns them
  { severity: 'info',     message: 'System returned to normal.', timestamp: 400 },
  { severity: 'warning',  message: 'Water level is low.',        timestamp: 300 },
  { severity: 'critical', message: 'Leak in section A.',         timestamp: 200 },
  { severity: 'info',     message: 'Hardware connected.',        timestamp: 100 },
];

test('prefs default everything on except the master switch', () => {
  assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS);
  assert.equal(DEFAULT_PREFS.enabled, false);
  assert.equal(DEFAULT_PREFS.critical && DEFAULT_PREFS.warning && DEFAULT_PREFS.info && DEFAULT_PREFS.offline, true);
});

test('stored prefs keep valid booleans and drop junk', () => {
  const p = normalizePrefs({ enabled: true, info: false, warning: 'yes', extra: 1 });
  assert.equal(p.enabled, true);
  assert.equal(p.info, false);
  assert.equal(p.warning, true, 'non-boolean falls back to the default');
  assert.equal('extra' in p, false);
});

test('only alerts newer than the last one handled, oldest first', () => {
  const picked = pickNewAlerts(alerts, 200, all);
  assert.deepEqual(picked.map(a => a.timestamp), [300, 400]);
  assert.deepEqual(pickNewAlerts(alerts, 400, all), []);
});

test('severities switched off are skipped', () => {
  const picked = pickNewAlerts(alerts, 0, { ...all, info: false });
  assert.deepEqual(picked.map(a => a.severity), ['critical', 'warning']);
});

test('alerts without a timestamp are ignored; unknown severities count as info', () => {
  const odd = [{ severity: 'critical', message: 'x' }, { severity: 'weird', message: 'y', timestamp: 5 }];
  assert.deepEqual(pickNewAlerts(odd, 0, all).map(a => a.message), ['y']);
  assert.deepEqual(pickNewAlerts(odd, 0, { ...all, info: false }), []);
});

test('latest timestamp', () => {
  assert.equal(latestTimestamp(alerts), 400);
  assert.equal(latestTimestamp([], 7), 7);
  assert.equal(latestTimestamp(alerts, 999), 999);
});

test('leaks stay on screen, each alert stacks under its own tag', () => {
  const leak = alertNotification(alerts[2]);
  assert.equal(leak.requireInteraction, true);
  assert.match(leak.title, /Leak/);
  assert.equal(leak.body, 'Leak in section A.');
  assert.notEqual(leak.tag, alertNotification(alerts[1]).tag);
  assert.equal(alertNotification(alerts[1]).requireInteraction, false);
});

test('offline and back-online share a tag so one replaces the other', () => {
  const off = connectionNotification(true, false);
  const on = connectionNotification(false, false);
  assert.equal(off.tag, on.tag);
  assert.match(off.body, /device/);
  assert.match(connectionNotification(true, true).body, /Digital Twin/);
  assert.equal(off.requireInteraction, true, 'losing the real device matters more than the twin closing');
  assert.equal(connectionNotification(true, true).requireInteraction, false);
});
