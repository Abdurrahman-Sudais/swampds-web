import { useState, useRef, useCallback, useEffect } from 'react';
import { createBridge } from './bridge.js';
import { setBackgroundInterval, clearBackgroundInterval } from './backgroundTimer.js';
import { friendlyAuthError } from '../auth/authErrors.js';

const newClientId = () => globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`;

/** Firebase is only downloaded when the operator asks to connect, so the public twin stays free of it. */
async function loadFirebase() {
  const [config, database] = await Promise.all([
    import('../firebase/firebaseConfig'),
    import('firebase/database'),
  ]);
  const { ref, update, push, remove, onValue, runTransaction, onDisconnect, get } = database;
  const db = database.getDatabase(config.app);
  return {
    auth: config.auth,
    loginWithEmail: config.loginWithEmail,
    db,
    ref,
    get,
    api: { ref, update, push, remove, onValue, runTransaction, onDisconnect },
  };
}

const RETRY_MS = 10_000; // background mode: how often to try for the lock while another twin holds it

const NOT_ADMIN_MESSAGE = 'This account is view-only and cannot connect the Digital Twin. Ask an admin to grant edit access.';

/**
 * Links the running twin to Firebase so the operator dashboard can show it and control it.
 *
 * state: 'off' | 'loading' | 'signin' | 'connecting' | 'live' | 'locked' | 'displaced' | 'error'
 *
 * auto: connect without being asked, using the saved sign-in (does nothing when signed out)
 *   'takeover'   connect on load and take over from any other twin (the twin page)
 *   'background' connect on load, and keep retrying while another twin holds the lock (the dashboard)
 *
 * @param {{ sim: object, config: object, auto?: false|'takeover'|'background',
 *   actions: { setMode: Function, setManualCommand: Function, updateConfig: Function, setMeasuredLevel?: Function } }} args
 */
export function useFirebaseBridge({ sim, config, actions, auto = false }) {
  const [status, setStatus] = useState({ state: 'off' });
  const [clientId] = useState(newClientId);

  const simRef     = useRef(sim);
  const configRef  = useRef(config);
  const actionsRef = useRef(actions);
  const fbRef      = useRef(null);
  const bridgeRef  = useRef(null);
  const optionsRef = useRef({ clearPrevious: false });
  const manualOffRef = useRef(false);

  useEffect(() => { simRef.current = sim; }, [sim]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  // Mirror the twin's own mode / manual command changes to the dashboard
  useEffect(() => { bridgeRef.current?.syncControlOut(); }, [sim.mode, sim.manualCommand]);

  // Stop publishing if the page is closed or navigated away from
  useEffect(() => () => { bridgeRef.current?.stop({ silent: true }); }, []);

  const begin = useCallback(async (user) => {
    const fb = fbRef.current;

    // Database rules restrict every write to admin accounts, so this would fail anyway -
    // check first and say why in plain terms, instead of surfacing a raw permission error.
    const roleSnap = await fb.get(fb.ref(fb.db, `roles/${user.uid}`));
    if (roleSnap.val() !== 'admin') {
      setStatus({ state: 'error', message: NOT_ADMIN_MESSAGE });
      return;
    }

    bridgeRef.current = createBridge({
      api: fb.api,
      db: fb.db,
      clientId,
      identity: { uid: user.uid, email: user.email ?? user.uid },
      getSim: () => simRef.current,
      getConfig: () => configRef.current,
      applyIntent: (intent) => (intent.type === 'mode'
        ? actionsRef.current.setMode(intent.value, 'dashboard')
        : actionsRef.current.setManualCommand(intent.value, 'dashboard')),
      applyConfig: (patch) => actionsRef.current.updateConfig?.(patch),
      applyMeasuredLevel: (pct) => actionsRef.current.setMeasuredLevel?.(pct),
      onStatus: setStatus,
      // keep publishing at full rate while the twin's tab is in the background
      setIntervalFn: setBackgroundInterval,
      clearIntervalFn: clearBackgroundInterval,
    });
    await bridgeRef.current.start(optionsRef.current);
  }, [clientId]);

  const connect = useCallback(async (options = {}) => {
    optionsRef.current = { clearPrevious: Boolean(options.clearPrevious), force: Boolean(options.force) };
    if (!options.quiet) manualOffRef.current = false;
    setStatus({ state: 'loading' });
    try {
      fbRef.current ??= await loadFirebase();
      await fbRef.current.auth.authStateReady();
      const user = fbRef.current.auth.currentUser;
      if (!user) { setStatus({ state: options.quiet ? 'off' : 'signin' }); return; }
      await begin(user);
    } catch (error) {
      setStatus({
        state: 'error',
        message: error?.code === 'auth/invalid-api-key'
          ? 'Firebase is not configured for this site (missing VITE_FIREBASE_* settings).'
          : (error?.message ?? 'Could not load Firebase.'),
      });
    }
  }, [begin]);

  const signIn = useCallback(async (email, password) => {
    setStatus({ state: 'loading' });
    try {
      const credential = await fbRef.current.loginWithEmail(email, password);
      await begin(credential.user);
    } catch (error) {
      setStatus({ state: 'signin', error: friendlyAuthError(error?.code) });
    }
  }, [begin]);

  const takeOver = useCallback(async () => {
    await bridgeRef.current?.start({ ...optionsRef.current, force: true });
  }, []);

  const disconnect = useCallback(async () => {
    manualOffRef.current = true; // an operator's Disconnect is not undone by auto-reconnect
    await bridgeRef.current?.stop();
    setStatus({ state: 'off' });
  }, []);

  // Auto-connect on load, using the sign-in already saved in this browser
  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(() => connect({ force: auto === 'takeover', quiet: true }), 0);
    return () => clearTimeout(id);
  }, [auto, connect]);

  // Background mode: retake the lock once the twin that took it goes away
  const state = status.state;
  useEffect(() => {
    if (auto !== 'background' || !['locked', 'displaced'].includes(state)) return;
    const id = setInterval(() => {
      if (!manualOffRef.current) connect({ quiet: true });
    }, RETRY_MS);
    return () => clearInterval(id);
  }, [auto, state, connect]);

  return { status, connect, signIn, takeOver, disconnect };
}
