/**
 * @fileoverview Digital-twin configuration.
 *
 * The leak rule and pump thresholds mirror the prototype firmware
 * (swampds_prototype_2flow.ino). Change them in both places together.
 */

// Delivery tank geometry on the prototype, in cm (firmware: DELIVERY_HEIGHT_CM, PUMP_*_CM)
export const TANK_HEIGHT_CM = 18;
export const PUMP_ON_CM     = 2;
export const PUMP_OFF_CM    = 13;   // leaves 5 cm below the ultrasonic sensor

export const DEFAULT_CONFIG = {
  // Timing
  tickSec: 0.7,            // simulation step (PRD NFR5: ~0.7 s)

  // Hydraulics
  baseFlowLpm: 4.8,        // pump output with no leaks
  maxLeakFraction: 0.6,    // share of upstream flow lost with a valve 100% open
  sourceCapacityL: 12,     // small demo tanks so a full cycle fits in a demo
  deliveryCapacityL: 6,
  deliveryHeightCm: TANK_HEIGHT_CM, // used to report a water depth (cm) to the dashboard

  // Sensors
  noisePct: 1.5,           // random reading noise, +/- percent
  sensorBiasPct: [0, 0.8], // fixed per-sensor calibration error (F1, F2)
  minFlowLpm: 0.5,         // below this upstream flow a segment is not evaluated

  // Leak detection (compare-and-persist) - firmware TOLERANCE_PCT / PERSIST_SEC
  tolerancePct: 20,        // % of F1's flow missing at F2 that is treated as abnormal
  persistSec: 10,          // abnormal difference must last this long to be a LEAK

  // Pump control
  lowLevelPct: (PUMP_ON_CM / TANK_HEIGHT_CM) * 100,   // auto mode: pump ON at or below (2 cm = 11 %)
  fullLevelPct: (PUMP_OFF_CM / TANK_HEIGHT_CM) * 100, // auto mode: pump OFF at or above (13 cm = 72 %)
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

/** Human-readable description of the monitored pipe segment (two flow sensors = one segment). */
export const SEGMENTS = {
  A: { valve: 'A', from: 'F1', to: 'F2', label: 'F1 → F2 (Valve A)' },
};
