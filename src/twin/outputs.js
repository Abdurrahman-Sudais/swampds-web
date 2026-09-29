/**
 * @fileoverview Derives the simulated hardware outputs from engine state:
 * LEDs, buzzer, relay, and the OLED display text.
 */

import { SEGMENTS } from './config.js';

const OLED_SWAP_SEC = 2; // during a leak the OLED alternates between screens

const fmt = (v) => v.toFixed(2);

/**
 * @param {object} state  engine state
 * @returns {{
 *   leds:   { green: boolean, yellow: boolean, red: boolean },
 *   buzzer: boolean,
 *   relay:  'closed' | 'open',
 *   oled:   { screen: 'readings' | 'warning', lines: string[] },
 * }}
 */
export function deriveOutputs(state) {
  const { status, flows, tanks, pumpOn, leakSegments, t } = state;

  const showWarning = status === 'leak' && Math.floor(t / OLED_SWAP_SEC) % 2 === 1;

  const lines = showWarning
    ? [
        '!! LEAK DETECTED !!',
        `Section: ${leakSegments.map((id) => SEGMENTS[id].from + '-' + SEGMENTS[id].to).join(', ')}`,
        'Pump: OFF (cut-off)',
        'Close valve, then reset',
      ]
    : [
        `F1 ${fmt(flows.f1)} L/min`,
        `F2 ${fmt(flows.f2)} L/min`,
        `Tank ${Math.round(tanks.delivery)}%  Pump ${pumpOn ? 'ON' : 'OFF'}`,
      ];

  return {
    leds: { green: status === 'normal', yellow: status === 'warning', red: status === 'leak' },
    buzzer: status === 'leak',
    relay: pumpOn ? 'closed' : 'open',
    oled: { screen: showWarning ? 'warning' : 'readings', lines },
  };
}
