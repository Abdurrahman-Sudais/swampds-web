/**
 * @fileoverview Per-sensor status for the two flow sensors, judged the way the leak rule
 * judges them: Sensor 2 against Sensor 1. There is no fixed "expected" L/min range - the
 * real pump's flow rate is not known in advance, and any range would be wrong for some rig.
 */

/** Below this Sensor 1 reading there is no flow to judge (same value in the firmware and the twin). */
export const MIN_FLOW_LPM = 0.5;

/** Used until the device or twin has published its tolerance (the firmware's value). */
const DEFAULT_TOLERANCE_PCT = 20;

/**
 * @param {'flow1'|'flow2'} key
 * @param {{ flow1?: number, flow2?: number }} sensors
 * @param {{ tolerancePct?: number|null }} [detection]
 * @returns {{ tone: 'ok'|'bad'|'idle', label: string, lossPct: number|null }}
 *   lossPct: share of Sensor 1's flow missing at Sensor 2, or null when there is no flow
 */
export function flowSensorStatus(key, sensors, detection) {
  const f1 = Number(sensors?.flow1) || 0;
  const f2 = Number(sensors?.flow2) || 0;
  if (f1 < MIN_FLOW_LPM) return { tone: 'idle', label: 'No flow', lossPct: null };

  const lossPct = ((f1 - f2) / f1) * 100;
  if (key === 'flow1') return { tone: 'ok', label: 'Flowing', lossPct };

  const tolerance = detection?.tolerancePct ?? DEFAULT_TOLERANCE_PCT;
  return lossPct > tolerance
    ? { tone: 'bad', label: 'Below Sensor 1', lossPct }
    : { tone: 'ok', label: 'Matches Sensor 1', lossPct };
}
