/**
 * @fileoverview setInterval that keeps running while the twin's tab is in the background.
 *
 * Browsers throttle timers on hidden pages: Chrome caps them at once a second, and after
 * ~5 minutes hidden it batches them to once a MINUTE. The twin opens in its own tab, so
 * while someone watches the dashboard the simulation (and its Firebase publishing) would
 * crawl. Timers inside a dedicated Web Worker are not throttled that way, so the ticks come
 * from a worker and the callback runs on the page when its message arrives.
 *
 * Falls back to the normal setInterval where workers are unavailable.
 */

const WORKER_SOURCE = `
  const timers = new Map();
  onmessage = ({ data }) => {
    if (data.type === 'start') timers.set(data.id, setInterval(() => postMessage(data.id), data.ms));
    else { clearInterval(timers.get(data.id)); timers.delete(data.id); }
  };
`;

let worker = null;
let nextId = 1;
const callbacks = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = ({ data: id }) => callbacks.get(id)?.();
  } catch {
    worker = false; // no workers here: use plain timers
  }
  return worker;
}

/** Same contract as setInterval: returns an id for clearBackgroundInterval. */
export function setBackgroundInterval(fn, ms) {
  const w = getWorker();
  if (!w) return { native: setInterval(fn, ms) };
  const id = nextId++;
  callbacks.set(id, fn);
  w.postMessage({ type: 'start', id, ms });
  return { id };
}

export function clearBackgroundInterval(handle) {
  if (!handle) return;
  if ('native' in handle) { clearInterval(handle.native); return; }
  callbacks.delete(handle.id);
  worker?.postMessage({ type: 'stop', id: handle.id });
}
