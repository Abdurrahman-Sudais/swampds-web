import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox } from '@react-three/drei';

/**
 * 3D view of the pipeline, driven by the same `sim` state as PipelineSchematic.
 * Loaded lazily (see TwinPage), so three.js is only downloaded when someone opens it.
 *
 * Every part is a simple placeholder shape. To use a Blender model instead, export it as
 * glTF (.glb), load it with drei's useGLTF, and drive its named objects from `sim` the same
 * way these shapes are driven (water height from tanks, pump spin from pumpOn, and so on).
 */

// Nodes, left to right: source, pump, F1, valve A, F2, delivery (same order as the 2D schematic).
const NODE_X = [-5, -3, -1, 1, 3, 5];
const PIPE_Y = 0.45;
const TANK = { r: 0.65, h: 1.7 };

// Which monitored segment each pipe run belongs to. Past F2 nothing is monitored.
const PIPE_SEGMENT = [null, null, 'A', 'A', null];

const WATER = '#38bdf8';
const COLORS = {
  light: { bg: '#f8fafc', floor: '#e2e8f0', pipe: '#cbd5e1', body: '#ffffff', off: '#94a3b8' },
  dark:  { bg: '#020617', floor: '#0f172a', pipe: '#334155', body: '#1e293b', off: '#64748b' },
};

// Eases a value toward its target each frame, so levels glide instead of jumping on each tick.
const approach = (current, target, dt, rate = 4) => current + (target - current) * Math.min(1, dt * rate);

function Label({ position, title, value, tone = 'text-slate-700 dark:text-slate-200' }) {
  return (
    <Html position={position} center style={{ pointerEvents: 'none' }}>
      <div className="flex flex-col items-center whitespace-nowrap leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</span>
        {value != null && <span className={`text-[11px] font-mono font-semibold ${tone}`}>{value}</span>}
      </div>
    </Html>
  );
}

function Tank({ x, percent, palette, title }) {
  const water = useRef();
  useFrame((_, dt) => {
    const target = Math.max(0.001, (percent / 100) * TANK.h);
    const h = approach(water.current.scale.y, target, dt);
    water.current.scale.y = h;
    water.current.position.y = h / 2;
  });
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, TANK.h / 2, 0]}>
        <cylinderGeometry args={[TANK.r, TANK.r, TANK.h, 40, 1, true]} />
        <meshStandardMaterial color={palette.pipe} transparent opacity={0.28} side={2} />
      </mesh>
      <mesh ref={water} scale={[1, 0.001, 1]}>
        <cylinderGeometry args={[TANK.r * 0.94, TANK.r * 0.94, 1, 40]} />
        <meshStandardMaterial color={WATER} transparent opacity={0.85} />
      </mesh>
      <Label position={[0, TANK.h + 0.35, 0]} title={title} value={`${Math.round(percent)}%`} />
    </group>
  );
}

function Pump({ on, manual, onToggle, palette }) {
  const rotor = useRef();
  useFrame((_, dt) => { if (on) rotor.current.rotation.x += dt * 12; });
  return (
    <group position={[NODE_X[1], PIPE_Y, 0]}>
      <mesh
        rotation={[0, 0, Math.PI / 2]}
        onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        onPointerOver={() => { if (manual) document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      >
        <cylinderGeometry args={[0.42, 0.42, 0.7, 32]} />
        <meshStandardMaterial color={on ? '#10b981' : palette.off} />
      </mesh>
      <mesh ref={rotor}>
        <boxGeometry args={[0.75, 0.12, 0.7]} />
        <meshStandardMaterial color={palette.body} />
      </mesh>
      <Label position={[0, 0.9, 0]} title="Pump" value={on ? 'ON' : 'OFF'}
        tone={on ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'} />
    </group>
  );
}

function Sensor({ x, name, flow, palette }) {
  return (
    <group position={[x, PIPE_Y, 0]}>
      <RoundedBox args={[0.6, 0.5, 0.5]} radius={0.08}>
        <meshStandardMaterial color={palette.body} />
      </RoundedBox>
      <mesh position={[0, 0.26, 0]}>
        <boxGeometry args={[0.3, 0.02, 0.3]} />
        <meshStandardMaterial color="#2563eb" />
      </mesh>
      <Label position={[0, 0.75, 0]} title={name} value={`${flow.toFixed(2)} L/min`} />
    </group>
  );
}

function Drips({ active }) {
  const drops = useRef([]);
  useFrame((state) => {
    drops.current.forEach((d, i) => {
      if (!d) return;
      const t = (state.clock.elapsedTime * 0.9 + i / 3) % 1;
      d.visible = active;
      d.position.y = -0.3 - t * (PIPE_Y - 0.05);
    });
  });
  return [0, 1, 2].map((i) => (
    <mesh key={i} ref={(m) => { drops.current[i] = m; }} visible={false}>
      <sphereGeometry args={[0.06, 12, 12]} />
      <meshStandardMaterial color="#0284c7" />
    </mesh>
  ));
}

function Valve({ opening, leaking, onToggle, palette }) {
  const open = opening > 0;
  return (
    <group position={[NODE_X[3], PIPE_Y, 0]}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      >
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial color={open ? '#f59e0b' : palette.body} />
      </mesh>
      {/* Handle: turns a quarter when the valve is open */}
      <mesh position={[0, 0.42, 0]} rotation={[0, open ? Math.PI / 2 : 0, 0]}>
        <boxGeometry args={[0.55, 0.08, 0.1]} />
        <meshStandardMaterial color={open ? '#d97706' : palette.off} />
      </mesh>
      <Drips active={leaking} />
      <Label position={[0, 0.85, 0]} title="Valve A" value={`${opening}%`}
        tone={open ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} />
    </group>
  );
}

const PARTICLES = 5;

function Pipe({ from, to, flow, color }) {
  const len = to - from;
  const dots = useRef([]);
  const offset = useRef(0);
  const flowing = flow > 0.08;
  useFrame((_, dt) => {
    offset.current = (offset.current + dt * (0.25 + flow * 0.12)) % 1;
    dots.current.forEach((d, i) => {
      if (!d) return;
      d.visible = flowing;
      d.position.x = (((offset.current + i / PARTICLES) % 1) - 0.5) * len;
    });
  });
  return (
    <group position={[(from + to) / 2, PIPE_Y, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, len, 20]} />
        <meshStandardMaterial color={color} transparent opacity={0.55} />
      </mesh>
      {Array.from({ length: PARTICLES }, (_, i) => (
        <mesh key={i} ref={(m) => { dots.current[i] = m; }} visible={false}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color={WATER} emissive={WATER} emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ sim, dark, onToggleValve, onTogglePump }) {
  const palette = dark ? COLORS.dark : COLORS.light;
  const { flows, tanks, valves, leakFlow, segments, pumpOn } = sim;
  const pipeFlow = [flows.f1, flows.f1, flows.f1, flows.f2, flows.f2];

  const pipeColor = (segId) => {
    const seg = segId && segments[segId];
    if (seg?.leak) return '#f43f5e';
    if (seg?.abnormalFor > 0) return '#fbbf24';
    return palette.pipe;
  };

  // Pipes run between the edges of the tanks, not their centres.
  const ends = NODE_X.map((x, i) => (i === 0 ? x + TANK.r : i === NODE_X.length - 1 ? x - TANK.r : x));

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <ambientLight intensity={dark ? 0.55 : 0.8} />
      <directionalLight position={[4, 8, 6]} intensity={dark ? 1.1 : 1.4} />
      <directionalLight position={[-6, 4, -4]} intensity={0.35} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[16, 6]} />
        <meshStandardMaterial color={palette.floor} />
      </mesh>

      {pipeFlow.map((flow, i) => (
        <Pipe key={i} from={ends[i]} to={ends[i + 1]} flow={flow} color={pipeColor(PIPE_SEGMENT[i])} />
      ))}

      <Tank x={NODE_X[0]} percent={tanks.source} palette={palette} title="Source" />
      <Pump on={pumpOn} manual={sim.mode === 'manual'} onToggle={onTogglePump} palette={palette} />
      <Sensor x={NODE_X[2]} name="Sensor 1" flow={flows.f1} palette={palette} />
      <Valve opening={valves.A} leaking={leakFlow.A > 0.05}
        onToggle={() => onToggleValve?.('A', valves.A > 0 ? 0 : 25)} palette={palette} />
      <Sensor x={NODE_X[4]} name="Sensor 2" flow={flows.f2} palette={palette} />
      <Tank x={NODE_X[5]} percent={tanks.delivery} palette={palette} title="Delivery" />

      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={6}
        maxDistance={18}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0.6, 0]}
      />
    </>
  );
}

/**
 * @param {{ sim: object, dark?: boolean, onToggleValve?: Function, onTogglePump?: Function }} props
 * Drag to orbit, scroll or pinch to zoom. Click the pump (manual mode) or the valve, as in 2D.
 */
export default function Twin3D({ sim, dark = false, onToggleValve, onTogglePump }) {
  return (
    <div
      className="w-full h-[300px] sm:h-[380px] rounded-xl overflow-hidden"
      role="img"
      aria-label={`3D pipeline view. Pump ${sim.pumpOn ? 'on' : 'off'}, delivery tank ${Math.round(sim.tanks.delivery)}% full.`}
    >
      <Canvas camera={{ position: [0, 4.2, 9.5], fov: 42 }} dpr={[1, 2]}>
        <Scene sim={sim} dark={dark} onToggleValve={onToggleValve} onTogglePump={onTogglePump} />
      </Canvas>
    </div>
  );
}
