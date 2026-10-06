import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeDataSource } from '../../twin/contract.js';
import {
  normalizePrefs, pickNewAlerts, latestTimestamp, alertNotification, connectionNotification,
} from '../../data/notifications.js';

// Notification preferences, per browser: the permission they depend on is per browser too.

const PREFS_KEY = 'swampds_notifications';
const _prefsListeners = new Set();

const readPrefs = () => {
  try { return normalizePrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')); }
  catch { return normalizePrefs(null); }
};

let _prefs = readPrefs();

/** @param {Partial<typeof _prefs>} patch */
export function setNotificationPrefs(patch) {
  _prefs = normalizePrefs({ ..._prefs, ...patch });
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs)); } catch { /* private mode: lasts this session */ }
  _prefsListeners.forEach(fn => fn());
}

if (typeof window !== 'undefined') {
  // Kept in step across open tabs
  window.addEventListener('storage', (e) => {
    if (e.key !== PREFS_KEY) return;
    _prefs = readPrefs();
    _prefsListeners.forEach(fn => fn());
  });
}

const subscribePrefs = (fn) => { _prefsListeners.add(fn); return () => _prefsListeners.delete(fn); };

export const useNotificationPrefs = () => useSyncExternalStore(subscribePrefs, () => _prefs);

/** 'unsupported' | 'default' | 'granted' | 'denied' */
export const notificationPermission = () =>
  (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');

// Showing them

let _audio = null;

/** Short chime: three urgent beeps for a leak, two for a warning, one soft one otherwise. */
export function playChime(severity) {
  try {
    _audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (_audio.state === 'suspended') _audio.resume();
    const [beeps, freq, gap] = severity === 'critical' ? [3, 880, 0.22] : severity === 'warning' ? [2, 660, 0.28] : [1, 520, 0];
    const start = _audio.currentTime + 0.02;
    for (let i = 0; i < beeps; i++) {
      const t = start + i * gap;
      const osc = _audio.createOscillator();
      const gain = _audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(severity === 'info' ? 0.08 : 0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(_audio.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  } catch { /* no audio (blocked until the user interacts, or unsupported): the notification still shows */ }
}

/**
 * Show one notification if the browser allows it. Returns false when it could not be shown
 * (no permission, or a browser such as Chrome on Android that only allows them from a service worker).
 * @param {{ title: string, body: string, tag: string, requireInteraction: boolean, severity: string }} spec
 * @param {{ sound?: boolean, onClick?: () => void }} [opts]  sound: the system sound, plus a chime for a leak
 */
export function showNotification(spec, { sound = false, onClick } = {}) {
  if (notificationPermission() !== 'granted') return false;
  try {
    const n = new Notification(spec.title, {
      body: spec.body,
      tag: spec.tag,
      icon: `${import.meta.env.BASE_URL}favicon.svg`,
      requireInteraction: spec.requireInteraction,
      silent: !sound,
    });
    n.onclick = () => { window.focus(); onClick?.(); n.close(); };
  } catch {
    return false;
  }
  // The browser may block page audio until the user has clicked on it; the system sound still plays
  if (sound && spec.severity === 'critical') playChime('critical');
  return true;
}

// Watching the live data

const OFFLINE_CHECK_MS = 5000;

/**
 * Shows a browser notification for every new alert (filtered by the user's settings), and when
 * the device or Digital Twin stops sending data and starts again. Alerts already in the list when
 * the dashboard opens are not repeated. Works while the dashboard is open in a tab, including a
 * background one.
 *
 * @param {{ alerts: object[], alertsLoaded: boolean, loaded: boolean, meta: object }} data
 */
export function useAlertNotifications({ alerts, alertsLoaded, loaded, meta }) {
  const prefs = useNotificationPrefs();
  const navigate = useNavigate();
  const handledUpTo = useRef(null); // newest alert timestamp already handled (notified or skipped)

  useEffect(() => {
    if (!alertsLoaded) return;
    // First snapshot: these happened before the dashboard opened, so they are history, not news
    if (handledUpTo.current === null) {
      handledUpTo.current = latestTimestamp(alerts);
      return;
    }
    const since = handledUpTo.current;
    handledUpTo.current = latestTimestamp(alerts, since);
    if (!prefs.enabled) return;
    for (const alert of pickNewAlerts(alerts, since, prefs)) {
      showNotification(alertNotification(alert), { sound: prefs.sound, onClick: () => navigate('/alerts') });
    }
  }, [alerts, alertsLoaded, prefs, navigate]);

  // Device/twin went quiet: the same rule the "No recent data" banner uses, checked on a timer
  // because nothing arrives from Firebase to trigger a re-render when the data stops.
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  const wasOffline = useRef(null);

  useEffect(() => {
    if (!loaded) return;
    const check = () => {
      const m = metaRef.current;
      if (!m?.source && m?.receivedAt == null) return; // nothing has ever published: nothing to lose
      const info = describeDataSource(m, Date.now());
      const offline = info.kind === 'offline';
      const prev = wasOffline.current;
      wasOffline.current = offline;
      if (prev === null || prev === offline) return; // first look is the baseline
      const p = _prefs;
      if (!p.enabled || !p.offline) return;
      showNotification(connectionNotification(offline, info.simulated), { sound: p.sound });
    };
    check();
    const id = setInterval(check, OFFLINE_CHECK_MS);
    return () => clearInterval(id);
  }, [loaded]);
}
