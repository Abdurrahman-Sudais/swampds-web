import { useTwin } from './useTwin.js';
import { useFirebaseBridge } from './useFirebaseBridge.js';

/**
 * Runs the digital twin with no UI while an admin has the operator dashboard open, so the
 * system (and the prototype mirroring it) is running without a separate twin tab. Opening the
 * twin page takes over from this one; it picks up again once that tab closes.
 *
 * Its own component so the twin's 0.7 s ticks re-render only this, not the dashboard.
 */
export default function BackgroundTwin() {
  const twin = useTwin({ initialMode: 'manual' }); // it drives the real pump: never start it unasked
  useFirebaseBridge({
    sim: twin.sim,
    config: twin.config,
    auto: 'background',
    actions: {
      setMode: twin.setMode, setManualCommand: twin.setManualCommand,
      updateConfig: twin.updateConfig, setHardware: twin.setHardware,
    },
  });
  return null;
}
