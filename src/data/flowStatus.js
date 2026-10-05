/**
 * @fileoverview Per-sensor status for the three flow sensors, judged the way the leak rule
 * judges them: each sensor against the one just upstream of it (Sensor 2 against Sensor 1,
 * Sensor 3 against Sensor 2). There is no fixed "expected" L/min range - the real pump's flow
 * rate is not known in advance, and any range would be wrong for some rig.
 */

/** Below this upstream reading there is no flow to judge (same value in the firmware and the twin). */
export const MIN_FLOW_LPM = 0.5;

/** Used until the device or twin has published its tolerance (the firmware's value). */
const DEFAULT_TOLERANCE_PCT = 20;

/** Sensor keys from the pump downstream. */
export const FLOW_KEYS = ['flow1', 'flow2', 'flow3'];

const sensorName = (key) => `Sensor ${FLOW_KEYS.indexOf(key) + 1}`;

/**
 * Flow lost between two sensors.
 * @returns {{ lpm: number, pct: number|null }}  pct is null when the upstream sensor has no flow
 */
export function segmentLoss(sensors, upKey, downKey) {
  const up = Number(sensors?.[upKey]) || 0;
  const down = Number(sensors?.[downKey]) || 0;
  return { lpm: up - down, pct: up >= MIN_FLOW_LPM ? ((up - down) / up) * 100 : null };
}

/**
 * @param {'flow1'|'flow2'|'flow3'} key
 * @param {{ flow1?: number, flow2?: number, flow3?: number }} sensors
 * @param {{ tolerancePct?: number|null }} [detection]
 * @returns {{ tone: 'ok'|'bad'|'idle', label: string, lossPct: number|null }}
 *   lossPct: share of the upstream sensor's flow missing at this one (null for Sensor 1, or
 *   when there is no flow to judge)
 */
export function flowSensorStatus(key, sensors, detection) {
  const i = FLOW_KEYS.indexOf(key);
  if (i <= 0) {
    return (Number(sensors?.flow1) || 0) < MIN_FLOW_LPM
      ? { tone: 'idle', label: 'No flow', lossPct: null }
      : { tone: 'ok', label: 'Flowing', lossPct: null };
  }

  const upKey = FLOW_KEYS[i - 1];
  const { pct } = segmentLoss(sensors, upKey, key);
  if (pct === null) return { tone: 'idle', label: 'No flow', lossPct: null };

  const tolerance = detection?.tolerancePct ?? DEFAULT_TOLERANCE_PCT;
  return pct > tolerance
    ? { tone: 'bad', label: `Below ${sensorName(upKey)}`, lossPct: pct }
    : { tone: 'ok', label: `Matches ${sensorName(upKey)}`, lossPct: pct };
}
