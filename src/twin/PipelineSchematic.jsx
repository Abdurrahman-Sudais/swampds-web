import React from 'react';
import { getTankFragment } from './tankVariants/index.js';

/**
 * Modern, Minimalist Vector Pipeline Schematic
 * Clean geometric lines, subtle fluid flow, and clear visual hierarchy.
 */

const FULL_TANK_SIZE = { w: 52, h: 68 };
const COMPACT_TANK_SIZE = { w: 28, h: 44 };

// Nodes, left to right: source, pump, F1, valve A, F2, valve B, F3, delivery.
const NODE_COUNT = 8;

const HORIZONTAL = {
  viewBox: '0 0 920 180',
  at: (i) => ({ x: 60 + i * 115, y: 80 }),
};

// Which monitored segment each pipe run belongs to (A: F1 -> F2, B: F2 -> F3). Past F3 nothing is monitored.
const PIPE_SEGMENT = [null, null, 'A', 'A', 'B', 'B', null];

function FullSchematic({ sim, onToggleValve, onTogglePump, tankStyle }) {
  const layout = HORIZONTAL;
  const pos = Array.from({ length: NODE_COUNT }, (_, i) => layout.at(i));
  const { flows, tanks, valves, leakFlow, segments, pumpOn } = sim;

  const pipeFlow = [flows.f1, flows.f1, flows.f1, flows.f2, flows.f2, flows.f3, flows.f3];

  const getPipeColor = (segId) => {
    if (!segId) return 'stroke-slate-200 dark:stroke-slate-800';
    const seg = segments[segId];
    if (seg.leak) return 'stroke-rose-500';
    if (seg.abnormalFor > 0) return 'stroke-amber-400';
    return 'stroke-slate-200 dark:stroke-slate-800';
  };

  return (
    <div className="w-full relative select-none py-2">
      <svg
        viewBox={layout.viewBox}
        className="w-full h-auto max-h-[220px]"
        role="img"
        aria-label="Pipeline schematic"
      >
        {/* Connecting Pipe Lines */}
        {pipeFlow.map((flow, i) => {
          const a = pos[i], b = pos[i + 1];
          const hasFlow = flow > 0.08;
          const segId = PIPE_SEGMENT[i];
          const isLeakingSeg = segId && segments[segId].leak;

          return (
            <g key={i}>
              {/* Background pipe channel */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={getPipeColor(segId)}
                strokeWidth={isLeakingSeg ? '5' : '4'}
                strokeLinecap="round"
              />
              {/* Active subtle fluid dash */}
              {hasFlow && (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="6 12"
                  strokeLinecap="round"
                  className="fluid-flow"
                />
              )}
            </g>
          );
        })}

        {/* Node 0: Source Tank */}
        <g transform={`translate(${pos[0].x - FULL_TANK_SIZE.w / 2},${pos[0].y - FULL_TANK_SIZE.h / 2})`}>
          {React.createElement(getTankFragment(tankStyle), { percent: tanks.source, active: pumpOn, ...FULL_TANK_SIZE })}
        </g>

        {/* Node 1: Pump */}
        <g
          transform={`translate(${pos[1].x},${pos[1].y})`}
          className="cursor-pointer"
          onClick={onTogglePump}
        >
          <circle
            r="22"
            className={
              pumpOn
                ? 'fill-emerald-50 dark:fill-emerald-950/40 stroke-emerald-500'
                : 'fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700'
            }
            strokeWidth="2"
          />
          <path
            d="M -6 -7 L 8 0 L -6 7 Z"
            className={pumpOn ? 'fill-emerald-600' : 'fill-slate-400'}
          />
        </g>

        {/* Node 2: Sensor F1 */}
        <g transform={`translate(${pos[2].x},${pos[2].y})`}>
          <rect
            x="-24"
            y="-18"
            width="48"
            height="36"
            rx="8"
            className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="2"
          />
          <text
            textAnchor="middle"
            y="4"
            fontSize="11"
            fontWeight="700"
            className="fill-blue-600 dark:fill-blue-400 font-mono"
          >
            F1
          </text>
        </g>

        {/* Node 3: Valve A */}
        <g
          transform={`translate(${pos[3].x},${pos[3].y})`}
          className="cursor-pointer"
          onClick={() => onToggleValve?.('A', valves.A > 0 ? 0 : 25)}
        >
          <circle
            r="18"
            className={
              valves.A > 0
                ? 'fill-amber-50 dark:fill-amber-950/40 stroke-amber-500'
                : 'fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700'
            }
            strokeWidth="2"
          />
          <text
            textAnchor="middle"
            y="4"
            fontSize="11"
            fontWeight="700"
            className={valves.A > 0 ? 'fill-amber-600 dark:fill-amber-400 font-mono' : 'fill-slate-600 dark:fill-slate-400 font-mono'}
          >
            VA
          </text>
          {/* Subtle drip if leaking */}
          {leakFlow.A > 0.05 && (
            <circle cx="0" cy="24" r="3" fill="#0284c7" className="gentle-drip" />
          )}
        </g>

        {/* Node 4: Sensor F2 */}
        <g transform={`translate(${pos[4].x},${pos[4].y})`}>
          <rect
            x="-24"
            y="-18"
            width="48"
            height="36"
            rx="8"
            className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="2"
          />
          <text
            textAnchor="middle"
            y="4"
            fontSize="11"
            fontWeight="700"
            className="fill-blue-600 dark:fill-blue-400 font-mono"
          >
            F2
          </text>
        </g>

        {/* Node 5: Valve B */}
        <g
          transform={`translate(${pos[5].x},${pos[5].y})`}
          className="cursor-pointer"
          onClick={() => onToggleValve?.('B', valves.B > 0 ? 0 : 25)}
        >
          <circle
            r="18"
            className={
              valves.B > 0
                ? 'fill-amber-50 dark:fill-amber-950/40 stroke-amber-500'
                : 'fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700'
            }
            strokeWidth="2"
          />
          <text
            textAnchor="middle"
            y="4"
            fontSize="11"
            fontWeight="700"
            className={valves.B > 0 ? 'fill-amber-600 dark:fill-amber-400 font-mono' : 'fill-slate-600 dark:fill-slate-400 font-mono'}
          >
            VB
          </text>
          {/* Subtle drip if leaking */}
          {leakFlow.B > 0.05 && (
            <circle cx="0" cy="24" r="3" fill="#0284c7" className="gentle-drip" />
          )}
        </g>

        {/* Node 6: Sensor F3 */}
        <g transform={`translate(${pos[6].x},${pos[6].y})`}>
          <rect
            x="-24"
            y="-18"
            width="48"
            height="36"
            rx="8"
            className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="2"
          />
          <text
            textAnchor="middle"
            y="4"
            fontSize="11"
            fontWeight="700"
            className="fill-blue-600 dark:fill-blue-400 font-mono"
          >
            F3
          </text>
        </g>

        {/* Node 7: Delivery Tank */}
        <g transform={`translate(${pos[7].x - FULL_TANK_SIZE.w / 2},${pos[7].y - FULL_TANK_SIZE.h / 2})`}>
          {React.createElement(getTankFragment(tankStyle), { percent: tanks.delivery, active: pumpOn, ...FULL_TANK_SIZE })}
        </g>

        {/* Minimalist Clean Labels */}
          <>
            {/* Source */}
            <text x={pos[0].x} y="132" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-slate-400 uppercase tracking-wider">Source</text>

            {/* Pump */}
            <text x={pos[1].x} y="128" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-slate-400 uppercase tracking-wider">Pump</text>
            <text x={pos[1].x} y="142" textAnchor="middle" fontSize="10" fontWeight="700" className={pumpOn ? 'fill-emerald-600 font-mono' : 'fill-slate-400 font-mono'}>
              {pumpOn ? 'ON' : 'OFF'}
            </text>

            {/* F1 */}
            <text x={pos[2].x} y="128" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-slate-400 uppercase tracking-wider">Sensor 1</text>
            <text x={pos[2].x} y="142" textAnchor="middle" fontSize="10.5" fontWeight="600" className="fill-slate-700 dark:fill-slate-300 font-mono">
              {flows.f1.toFixed(2)} L/m
            </text>

            {/* Valve A */}
            <text x={pos[3].x} y="128" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-slate-400 uppercase tracking-wider">Valve A</text>
            <text x={pos[3].x} y="142" textAnchor="middle" fontSize="10.5" fontWeight="600" className={valves.A > 0 ? 'fill-amber-600 font-mono' : 'fill-slate-400 font-mono'}>
              {valves.A}%
            </text>

            {/* F2 */}
            <text x={pos[4].x} y="128" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-slate-400 uppercase tracking-wider">Sensor 2</text>
            <text x={pos[4].x} y="142" textAnchor="middle" fontSize="10.5" fontWeight="600" className="fill-slate-700 dark:fill-slate-300 font-mono">
              {flows.f2.toFixed(2)} L/m
            </text>

            {/* Valve B */}
            <text x={pos[5].x} y="128" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-slate-400 uppercase tracking-wider">Valve B</text>
            <text x={pos[5].x} y="142" textAnchor="middle" fontSize="10.5" fontWeight="600" className={valves.B > 0 ? 'fill-amber-600 font-mono' : 'fill-slate-400 font-mono'}>
              {valves.B}%
            </text>

            {/* F3 */}
            <text x={pos[6].x} y="128" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-slate-400 uppercase tracking-wider">Sensor 3</text>
            <text x={pos[6].x} y="142" textAnchor="middle" fontSize="10.5" fontWeight="600" className="fill-slate-700 dark:fill-slate-300 font-mono">
              {flows.f3.toFixed(2)} L/m
            </text>

            {/* Delivery */}
            <text x={pos[7].x} y="132" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-slate-400 uppercase tracking-wider">Delivery</text>
          </>
      </svg>
    </div>
  );
}

// Compact horizontal layout (phones and tablets)
// Same left-to-right flow as the full layout, drawn at real sizes (8 nodes in ~330 units) so
// text stays legible instead of being shrunk with the whole picture.

const COMPACT = {
  viewBox: '0 0 328 100',
  at: (i) => ({ x: 22 + i * 40, y: 38 }),
};

const INK = 'fill-slate-800 dark:fill-slate-100 font-mono';
const MUTED = 'fill-slate-500 dark:fill-slate-400';

function Caption({ x, row, children, className = MUTED, mono = false, size = 10, weight = 600 }) {
  return (
    <text
      x={x}
      y={row === 1 ? 78 : 92}
      textAnchor="middle"
      fontSize={size}
      fontWeight={weight}
      className={`${className}${mono ? ' font-mono' : ''}`}
    >
      {children}
    </text>
  );
}

function CompactSchematic({ sim, onToggleValve, onTogglePump, tankStyle }) {
  const { flows, tanks, valves, leakFlow, segments, pumpOn } = sim;
  const pos = Array.from({ length: NODE_COUNT }, (_, i) => COMPACT.at(i));
  const pipeFlow = [flows.f1, flows.f1, flows.f1, flows.f2, flows.f2, flows.f3, flows.f3];

  const pipeClass = (segId) => {
    if (!segId) return 'stroke-slate-200 dark:stroke-slate-800';
    const seg = segments[segId];
    if (seg.leak) return 'stroke-rose-500';
    if (seg.abnormalFor > 0) return 'stroke-amber-400';
    return 'stroke-slate-200 dark:stroke-slate-800';
  };

  const tank = (i, pct) => (
    <g transform={`translate(${pos[i].x - COMPACT_TANK_SIZE.w / 2},${pos[i].y - COMPACT_TANK_SIZE.h / 2})`}>
      {React.createElement(getTankFragment(tankStyle), { percent: pct, active: pumpOn, ...COMPACT_TANK_SIZE })}
    </g>
  );

  const sensor = (i, name) => (
    <g transform={`translate(${pos[i].x},${pos[i].y})`}>
      <rect x="-14" y="-11" width="28" height="22" rx="6"
        className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700" strokeWidth="1.5" />
      <text textAnchor="middle" y="3.5" fontSize="10" fontWeight="700" className="fill-blue-600 dark:fill-blue-400 font-mono">{name}</text>
    </g>
  );

  const valve = (i, id) => {
    const opening = valves[id];
    return (
      <g transform={`translate(${pos[i].x},${pos[i].y})`} className="cursor-pointer" onClick={() => onToggleValve?.(id, opening > 0 ? 0 : 25)}>
        <circle r="20" fill="transparent" /> {/* 40px touch target */}
        <circle r="12"
          className={opening > 0
            ? 'fill-amber-50 dark:fill-amber-950/40 stroke-amber-500'
            : 'fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700'}
          strokeWidth="1.5" />
        <text textAnchor="middle" y="4" fontSize="11" fontWeight="700"
          className={opening > 0 ? 'fill-amber-600 dark:fill-amber-400 font-mono' : 'fill-slate-600 dark:fill-slate-400 font-mono'}>
          {id}
        </text>
        {leakFlow[id] > 0.05 && <circle cx="15" cy="6" r="2.5" fill="#0284c7" className="gentle-drip" />}
      </g>
    );
  };

  return (
    <div className="w-full select-none py-1">
      <svg
        viewBox={COMPACT.viewBox}
        className="w-full max-w-[560px] mx-auto h-auto"
        role="img"
        aria-label="Pipeline schematic"
      >
        {pipeFlow.map((flow, i) => {
          const a = pos[i], b = pos[i + 1];
          const segId = PIPE_SEGMENT[i];
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={pipeClass(segId)}
                strokeWidth={segId && segments[segId].leak ? 4 : 3} strokeLinecap="round" />
              {flow > 0.08 && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#38bdf8" strokeWidth="2"
                  strokeDasharray="4 8" strokeLinecap="round" className="fluid-flow" />
              )}
            </g>
          );
        })}

        {tank(0, tanks.source)}

        <g transform={`translate(${pos[1].x},${pos[1].y})`} className="cursor-pointer" onClick={onTogglePump}>
          <circle r="20" fill="transparent" />
          <circle r="13"
            className={pumpOn
              ? 'fill-emerald-50 dark:fill-emerald-950/40 stroke-emerald-500'
              : 'fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700'}
            strokeWidth="1.5" />
          <path d="M -4 -5 L 6 0 L -4 5 Z" className={pumpOn ? 'fill-emerald-600' : 'fill-slate-400'} />
        </g>

        {sensor(2, 'F1')}
        {valve(3, 'A')}
        {sensor(4, 'F2')}
        {valve(5, 'B')}
        {sensor(6, 'F3')}
        {tank(7, tanks.delivery)}

        <Caption x={pos[0].x} row={1}>Source</Caption>
        <Caption x={pos[1].x} row={1}>Pump</Caption>
        <Caption x={pos[1].x} row={2} weight={700} mono className={pumpOn ? 'fill-emerald-600 dark:fill-emerald-400' : 'fill-slate-400'}>
          {pumpOn ? 'ON' : 'OFF'}
        </Caption>

        {[[2, flows.f1], [4, flows.f2], [6, flows.f3]].map(([i, v]) => (
          <React.Fragment key={i}>
            <Caption x={pos[i].x} row={1} size={11} weight={700} mono className={INK}>{v.toFixed(2)}</Caption>
            <Caption x={pos[i].x} row={2}>L/min</Caption>
          </React.Fragment>
        ))}

        {[[3, 'A'], [5, 'B']].map(([i, id]) => (
          <React.Fragment key={id}>
            <Caption x={pos[i].x} row={1} size={11} weight={700} mono
              className={valves[id] > 0 ? 'fill-amber-600 dark:fill-amber-400' : 'fill-slate-400'}>
              {valves[id]}%
            </Caption>
            <Caption x={pos[i].x} row={2}>Valve {id}</Caption>
          </React.Fragment>
        ))}

        <Caption x={pos[7].x} row={1}>Delivery</Caption>
      </svg>
    </div>
  );
}

/**
 * @param {{
 *   sim: object,
 *   layout?: 'full'|'compact',
 *   tankStyle?: 'wave'|'bubbles'|'glass'|'ripple',
 *   onToggleValve?: Function,
 *   onTogglePump?: Function,
 * }} props
 * `full` is the wide desktop drawing; `compact` is the same left-to-right flow sized for phones
 * and tablets. `tankStyle` picks the source/delivery tank animation (see tankVariants/index.js);
 * it defaults to DEFAULT_TANK_STYLE when omitted or unrecognised.
 */
export default function PipelineSchematic({ layout = 'full', ...props }) {
  return layout === 'compact' ? <CompactSchematic {...props} /> : <FullSchematic {...props} />;
}
