import { useState, useEffect, useCallback } from 'react';

const KEY_PREFIX = 'swampds_alerts_seen_at';

const readSeen = (key) => {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
};

/**
 * Unread state for the top-bar bell, like an app-icon badge: an alert is "new" when its
 * timestamp is later than the newest alert this user has already seen. Opening the alerts
 * (markSeen) clears it until the next alert arrives. Remembered per user in localStorage and
 * kept in step across open tabs.
 *
 * @param {{ timestamp?: number }[]} alerts  newest first, `timestamp` in ms (server time)
 * @param {string|undefined} userId
 * @returns {{ unreadCount: number, markSeen: () => void }}
 */
export function useUnreadAlerts(alerts, userId) {
  const key = `${KEY_PREFIX}:${userId ?? 'anon'}`;
  const [seen, setSeen] = useState(() => ({ key, at: readSeen(key) }));
  // A different user signed in: their own record, not the previous user's
  const seenAt = seen.key === key ? seen.at : readSeen(key);

  useEffect(() => {
    const onStorage = (e) => { if (e.key === key) setSeen({ key, at: readSeen(key) }); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const stamps = alerts.map(a => Number(a.timestamp)).filter(Number.isFinite);
  const latest = stamps.length ? Math.max(...stamps) : 0;
  const unreadCount = stamps.filter(t => t > seenAt).length;

  const markSeen = useCallback(() => {
    if (latest <= seenAt) return;
    setSeen({ key, at: latest });
    try { localStorage.setItem(key, String(latest)); } catch { /* private mode: badge just won't persist */ }
  }, [key, latest, seenAt]);

  return { unreadCount, markSeen };
}
