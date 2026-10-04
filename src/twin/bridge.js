/**
 * @fileoverview Connects the digital twin to Firebase so it stands in for the ESP32:
 * it publishes sensor/status/alert/history data, and obeys the dashboard's commands.
 * When the prototype is online it also runs hardware-in-the-loop: the real level sensor
 * (hardware/levelCm) feeds the twin, and the ESP32 mirrors the twin's outputs (hil/).
 *
 * Framework-free. The Firebase functions are injected (`api`), so the same code runs
 * against the real SDK in the browser and an in-memory fake in tests.
 * See contract.js for the exact data layout.
 */

import {
  toSnapshot, flatten, shouldPublishEvent, eventToAlert, connectionAlert,
  createPumpTracker, trackPump, controlIntents, canAcquireLock, pumpLevelsFromDb,
  measuredLevelPct, levelCheckFromHardware, PUBLISH_INTERVAL_MS, HARDWARE_STALE_MS,
} from './contract.js';

const norm = (v) => (typeof v === 'string' ? v.toLowerCase() : null);

/**
 * @param {{
 *   api: object,                          firebase/database functions (ref, update, push, ...)
 *   db: object,
 *   clientId: string,                     unique per browser tab
 *   identity: { uid: string, email: string },
 *   getSim: () => object,                 latest engine state
 *   getConfig: () => object,
 *   applyIntent: (intent: object) => void,   apply a dashboard command to the twin
 *   applyConfig?: (patch: object) => void,   apply admin-set pump levels (config/) to the twin
 *   applyHardware?: (hw: { levelPct: number|null, levelCheck: object|null }) => void,
 *                                         the prototype's real level and level-rate check; nulls = not linked
 *   onStatus: (status: object) => void,
 *   now?: () => number,
 *   setIntervalFn?: Function, clearIntervalFn?: Function,
 * }} deps
 */
export function createBridge(deps) {
  const {
    api, db, clientId, identity, getSim, getConfig, applyIntent, applyConfig = () => {},
    applyHardware = () => {}, onStatus,
    now = Date.now, setIntervalFn = setInterval, clearIntervalFn = clearInterval,
  } = deps;
  const { ref, update, push, remove, onValue, runTransaction, onDisconnect } = api;

  const lockRef = ref(db, 'twinLock');
  const root = () => ref(db);

  let running = false;
  let publishing = false;
  let timer = null;
  let unsubs = [];
  let lastEventId = 0;
  let tracker = createPumpTracker();
  let offlineHandler = null;
  let hilHandler = null;
  const hw = { value: null, lastSeen: null, receivedAt: null }; // latest hardware/, and when it last changed (local time)
  const dbControl = { mode: null, cmd: null }; // what the database currently holds
  let dbConfig = null;                         // latest config/ (admin-set pump levels)

  const status = (state, extra = {}) => onStatus({ state, ...extra });

  /** Best-effort: a failed connection-log write must never block connecting or disconnecting. */
  const logConnection = (kind, timestamp) =>
    push(ref(db, 'alerts'), connectionAlert(kind, identity.email, timestamp)).catch(() => {});

  /** What the ESP32 reports while it keeps reporting; nulls once it goes quiet (the level also on a fault). */
  function currentHardware(t) {
    if (hw.receivedAt === null || t - hw.receivedAt > HARDWARE_STALE_MS) return { levelPct: null, levelCheck: null };
    return { levelPct: measuredLevelPct(hw.value, getConfig()), levelCheck: levelCheckFromHardware(hw.value) };
  }

  async function fail(error) {
    status('error', { message: error?.message ?? String(error) });
    await stop({ silent: true });
  }

  // lifecycle

  /**
   * Take the lock and start publishing.
   * @param {{ force?: boolean, clearPrevious?: boolean }} [options]
   * @returns {Promise<boolean>} false if another twin holds the lock
   */
  async function start({ force = false, clearPrevious = false } = {}) {
    status('connecting');
    try {
      const t = now();
      const { committed, snapshot } = await runTransaction(lockRef, (current) =>
        canAcquireLock(current, { now: t, clientId, force })
          ? { clientId, uid: identity.uid, email: identity.email, since: t, heartbeat: t }
          : undefined);

      if (!committed) {
        status('locked', { lockedBy: snapshot.val()?.email ?? 'another twin' });
        return false;
      }

      const sim = getSim();
      lastEventId = sim.seq;                                   // don't replay history from before connecting
      tracker = trackPump(createPumpTracker(), sim.pumpOn, t).tracker;

      // The twin boots as the device: it reports its own mode, then listens for commands.
      await update(root(), { 'status/controlMode': sim.mode, 'control/pumpCommand': sim.manualCommand });
      if (clearPrevious) {
        await remove(ref(db, 'alerts'));
        await remove(ref(db, 'pumpHistory'));
      }

      offlineHandler = onDisconnect(ref(db, 'system/online'));
      await offlineHandler.set(false);
      // If this tab dies, the prototype's pump stops at once. hil/ itself stays: the prototype keeps
      // following until the heartbeat goes stale, so a reload or a hand-over to another twin is seamless.
      hilHandler = onDisconnect(ref(db, 'hil/pump'));
      await hilHandler.set(false);

      unsubs = [
        onValue(ref(db, 'status/controlMode'), (snap) => {
          dbControl.mode = norm(snap.val());
          if (running) controlIntents(getSim(), { controlMode: snap.val() }).forEach(applyIntent);
        }),
        onValue(ref(db, 'control/pumpCommand'), (snap) => {
          dbControl.cmd = norm(snap.val());
          if (running) controlIntents(getSim(), { pumpCommand: snap.val() }).forEach(applyIntent);
        }),
        onValue(ref(db, 'config'), (snap) => {
          dbConfig = snap.val();
          if (running) applyConfig(pumpLevelsFromDb(dbConfig));
        }),
        onValue(ref(db, 'hardware'), (snap) => {
          const value = snap.val();
          const lastSeen = value?.lastSeen ?? null;
          if (lastSeen !== null && lastSeen !== hw.lastSeen) hw.receivedAt = now();
          hw.value = value;
          hw.lastSeen = lastSeen;
          if (running) applyHardware(currentHardware(now()));
        }),
        onValue(lockRef, (snap) => {
          const lock = snap.val();
          if (running && lock && lock.clientId !== clientId) {
            status('displaced', { lockedBy: lock.email ?? 'another twin' });
            stop({ release: false, silent: true });
          }
        }),
      ];

      running = true;
      applyConfig(pumpLevelsFromDb(dbConfig)); // the levels already set before this twin connected
      applyHardware(currentHardware(t));
      logConnection('connected', t); // visible on the dashboard: an alert, not just the "simulated data" banner
      await publish();
      timer = setIntervalFn(() => { publish().catch(fail); }, PUBLISH_INTERVAL_MS);
      return true;
    } catch (error) {
      await fail(error);
      return false;
    }
  }

  /**
   * Stop publishing and mark the data source offline.
   * @param {{ release?: boolean, silent?: boolean }} [options]
   */
  async function stop({ release = true, silent = false } = {}) {
    const wasRunning = running;
    running = false;
    if (timer) clearIntervalFn(timer);
    timer = null;
    unsubs.forEach((unsubscribe) => unsubscribe());
    unsubs = [];

    if (wasRunning) applyHardware({ levelPct: null, levelCheck: null }); // no longer receiving the prototype's readings
    if (wasRunning && release) {
      try {
        await update(root(), { 'hil/pump': false }); // pump off now; the prototype lets go once the heartbeat is stale
        await logConnection('disconnected', now());
        await runTransaction(lockRef, (current) => (current?.clientId === clientId ? null : undefined));
        await update(root(), { 'system/online': false });
      } catch { /* best effort: onDisconnect / lock expiry cover a failed cleanup */ }
    }
    // Always cancel: a displaced twin must not flip the new owner's "online" flag when it closes.
    try { await offlineHandler?.cancel(); } catch { /* ignore */ }
    try { await hilHandler?.cancel(); } catch { /* ignore */ }
    offlineHandler = null;
    hilHandler = null;
    if (!silent) status('off');
  }

  // publishing

  async function publish() {
    if (!running || publishing) return;
    publishing = true;
    try {
      const t = now();
      applyHardware(currentHardware(t)); // unlinks the prototype once the ESP32 goes quiet
      const sim = getSim();

      // Advance the pump-session tracker first, so this tick's snapshot carries an up-to-date
      // pumpStartedAt (and, if the pump just stopped, the finished session goes to pumpHistory below).
      const tracked = trackPump(tracker, sim.pumpOn, t);
      tracker = tracked.tracker;

      const updates = flatten(toSnapshot(sim, getConfig(), t, tracker.startedAt));
      updates['twinLock/heartbeat'] = t;
      await update(root(), updates);

      if (sim.seq < lastEventId) lastEventId = 0;             // the twin was restarted: its event ids began again
      const fresh = sim.events.filter((e) => e.id > lastEventId).reverse(); // oldest first
      lastEventId = sim.seq;
      let offset = 0;
      for (const event of fresh) {
        if (shouldPublishEvent(event)) await push(ref(db, 'alerts'), eventToAlert(event, t + offset++));
      }

      if (tracked.session) await push(ref(db, 'pumpHistory'), tracked.session);

      status('live', { lastPublishAt: t });
    } finally {
      publishing = false;
    }
  }

  /** Call whenever the twin's own mode / manual command changes: mirror it to the database. */
  function syncControlOut() {
    if (!running) return;
    const sim = getSim();
    const updates = {};
    if (dbControl.mode !== sim.mode) updates['status/controlMode'] = sim.mode;
    if (dbControl.cmd !== sim.manualCommand) updates['control/pumpCommand'] = sim.manualCommand;
    if (Object.keys(updates).length > 0) update(root(), updates).catch(fail);
  }

  return { start, stop, syncControlOut, publishNow: publish, isRunning: () => running };
}
