/**
 * @fileoverview Digital-twin configuration.
 *
 * The leak rule and pump thresholds mirror the prototype firmware
 * (swampds_prototype_3flow.ino). Change them in both places together.
 */

/**
 * Master switch for linking the twin to the dashboard/hardware (Firebase). false = the twin runs as a
 * standalone simulation only: no auto-connect on the twin page, no background twin on the dashboard,
 * and the Connect button refuses. The prototype then runs on its own (see TWIN_LINK_ENABLED in the firmware).
 */
export const TWIN_LINK_ENABLED = true;

// Delivery tank geometry on the prototype, in cm (same names and values as the firmware).
// The ultrasonic sensor sits inside the tank, so the highest level it can safely measure is
// below the rim: 19 - 1.2 (sensor) - 3.8 (allowance under it; ~2 cm is its blind zone) = 14 cm = 100 %.
export const TANK_HEIGHT_CM      = 19;
export const SENSOR_DROP_CM      = 1.2;
export const SENSOR_CLEARANCE_CM = 3.8;
export const FULL_SCALE_CM       = TANK_HEIGHT_CM - SENSOR_DROP_CM - SENSOR_CLEARANCE_CM; // 14
export const PUMP_ON_CM          = 2;                   // 14 %
export const PUMP_OFF_CM         = FULL_SCALE_CM - 0.5; // 13.5 cm = 96 %

/**
 * Limits for admin-set pump thresholds (Settings page). The same limits are enforced by the
 * database rules (database.rules.json) and clamped again by the firmware, so an out-of-range
 * value can never reach the pump.
 */
export const PUMP_LIMITS = {
  minOnCm:  1.5,          // above the 1 cm low-level warning, so a normal refill never raises it
  maxOffCm: PUMP_OFF_CM,  // 13.5 cm: stop no higher than 0.5 cm below the highest safe level
  minGapCm: 2,            // start and stop at least 2 cm apart, or sensor noise can make the pump cycle
};

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * @returns {string|null} why the pair is not allowed, or null if it is
 */
export function validatePumpThresholds(onCm, offCm) {
  if (!Number.isFinite(onCm) || !Number.isFinite(offCm)) return 'Enter both levels as numbers.';
  if (onCm < PUMP_LIMITS.minOnCm) return `Pump ON level must be at least ${PUMP_LIMITS.minOnCm} cm.`;
  if (offCm > PUMP_LIMITS.maxOffCm) return `Pump OFF level can be at most ${PUMP_LIMITS.maxOffCm} cm (the highest safe level).`;
  if (round1(offCm - onCm) < PUMP_LIMITS.minGapCm) return `Keep the OFF level at least ${PUMP_LIMITS.minGapCm} cm above the ON level.`;
  return null;
}

/** cm -> % of the highest safe level (what the dashboard and twin show as 100 %). */
export const levelPct = (cm) => (cm / FULL_SCALE_CM) * 100;

export const DEFAULT_CONFIG = {
  // Timing
  tickSec: 0.7,            // simulation step (PRD NFR5: ~0.7 s)

  // Hydraulics
  baseFlowLpm: 4.8,        // pump output with no leaks
  maxLeakFraction: 0.6,    // share of upstream flow lost with a valve 100% open
  sourceCapacityL: 12,     // small demo tanks so a full cycle fits in a demo
  deliveryCapacityL: 6,
  deliveryHeightCm: FULL_SCALE_CM,  // depth (cm) at 100 %, used to report cm to the dashboard

  // Sensors
  noisePct: 1.5,           // random reading noise, +/- percent
  sensorBiasPct: [0, 0.8, -0.8], // fixed per-sensor calibration error (F1, F2, F3)
  minFlowLpm: 0.5,         // below this upstream flow a segment is not evaluated

  // Leak detection (compare-and-persist) - firmware TOLERANCE_PCT / PERSIST_SEC
  tolerancePct: 20,        // % of a segment's inflow missing at its outlet that is treated as abnormal
  persistSec: 10,          // abnormal difference must last this long to be a LEAK

  // Pump control
  lowLevelPct: (PUMP_ON_CM / FULL_SCALE_CM) * 100,   // auto mode: pump ON at or below (2 cm = 14 %)
  fullLevelPct: (PUMP_OFF_CM / FULL_SCALE_CM) * 100, // auto mode: pump OFF at or above (13.5 cm = 96 %)
  sourceEmptyPct: 2,       // pump stops (dry-run protection) at or below this source level

  // Display
  historyLength: 40,       // samples kept for the rolling flow chart (PRD FR14)
};

/**
 * Smallest valve opening (%) that is reliably flagged as a leak.
 * A valve at `o` % loses o * maxLeakFraction % of the flow, and that loss must beat the
 * tolerance by a small margin to survive sensor noise over the whole persistence window
 * (measured with the 10 s window: 2 points catches ~80% of runs, 3 points all of them).
 * Anything smaller stays inside the tolerance and is intentionally NOT reported.
 */
export function reliableLeakOpening(config) {
  const NOISE_MARGIN_PCT = 3;
  return Math.min(100, Math.ceil((config.tolerancePct + NOISE_MARGIN_PCT) / config.maxLeakFraction));
}

/** Human-readable description of each monitored pipe segment (three flow sensors = two segments). */
export const SEGMENTS = {
  A: { valve: 'A', from: 'F1', to: 'F2', label: 'F1 → F2 (Valve A)' },
  B: { valve: 'B', from: 'F2', to: 'F3', label: 'F2 → F3 (Valve B)' },
};

/** Everything that can be named in leakSegments: the flow segment, plus the prototype's level-rate check. */
export const LEAK_SOURCES = {
  ...SEGMENTS,
  L: { valve: null, from: 'Pump', to: 'Tank', label: 'Pump → Tank (level-rate check)' },
};
