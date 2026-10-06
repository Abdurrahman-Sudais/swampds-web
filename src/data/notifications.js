/**
 * @fileoverview Browser notifications: which alerts to notify about and what each notification says.
 * Pure functions only (no DOM, no React), so the rules are unit-tested; the hook that shows them is
 * components/layout/useAlertNotifications.js and the switches live on the Settings page.
 */

/** Everything on except the master switch: the browser only lets a click ask for permission. */
export const DEFAULT_PREFS = Object.freeze({
  enabled:  false,
  critical: true,  // leaks: section A/B, level-rate check
  warning:  true,  // dry run, low level, sensor fault, suspected leak
  info:     true,  // back to normal, pump levels changed, twin/hardware connected
  offline:  true,  // the device or twin stopped sending data, and when it comes back
  sound:    true,
});

/** Stored prefs → a complete, valid prefs object (unknown keys dropped, missing ones defaulted). */
export function normalizePrefs(raw) {
  const out = { ...DEFAULT_PREFS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_PREFS)) {
      if (typeof raw[key] === 'boolean') out[key] = raw[key];
    }
  }
  return out;
}

const severityOf = (alert) => (alert?.severity in SEVERITY_TITLES ? alert.severity : 'info');

/**
 * Alerts that arrived after `sinceTs` and whose severity is switched on, oldest first
 * (the order they happened in, so a burst reads correctly in the notification centre).
 * @param {{ severity?: string, message?: string, timestamp?: number }[]} alerts
 * @param {number} sinceTs  newest alert timestamp already handled
 */
export function pickNewAlerts(alerts, sinceTs, prefs) {
  return alerts
    .filter(a => Number.isFinite(Number(a?.timestamp)) && Number(a.timestamp) > sinceTs)
    .filter(a => prefs[severityOf(a)])
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
}

/** Newest timestamp in a list of alerts, or `fallback` if none has one. */
export function latestTimestamp(alerts, fallback = 0) {
  const stamps = alerts.map(a => Number(a?.timestamp)).filter(Number.isFinite);
  return stamps.length ? Math.max(fallback, ...stamps) : fallback;
}

const SEVERITY_TITLES = {
  critical: 'SWAMPDS - Leak detected',
  warning:  'SWAMPDS - Warning',
  info:     'SWAMPDS',
};

/**
 * Alert → Notification options. Leaks stay on screen until dismissed; each alert gets its own
 * tag so a burst stacks instead of one replacing the other.
 */
export function alertNotification(alert) {
  const severity = severityOf(alert);
  return {
    title: SEVERITY_TITLES[severity],
    body: alert.message ?? '',
    tag: `swampds-alert-${alert.timestamp}`,
    requireInteraction: severity === 'critical',
    severity,
  };
}

/**
 * The data feed went quiet or came back. One shared tag, so "back online" replaces "offline".
 * @param {boolean} offline
 * @param {boolean} simulated  the Digital Twin was the publisher, not the device
 */
export function connectionNotification(offline, simulated) {
  const who = simulated ? 'The Digital Twin' : 'The SWAMPDS device';
  return offline
    ? {
        title: 'SWAMPDS - Device offline',
        body: `${who} has stopped sending data. Leaks will not be reported until it reconnects.`,
        tag: 'swampds-connection',
        requireInteraction: !simulated,
        severity: 'warning',
      }
    : {
        title: 'SWAMPDS - Back online',
        body: `${who} is sending data again.`,
        tag: 'swampds-connection',
        requireInteraction: false,
        severity: 'info',
      };
}

/** What a test from the Settings page looks like. */
export const TEST_NOTIFICATION = Object.freeze({
  title: 'SWAMPDS - Notifications are on',
  body: 'This is how leaks and warnings will appear while the dashboard is open.',
  tag: 'swampds-test',
  requireInteraction: false,
  severity: 'info',
});
