import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF } from '@react-three/drei';
import { Box3, Color, Vector3 } from 'three';

/**
 * 3D view of the pipeline, driven by the same `sim` state as PipelineSchematic.
 * Loaded lazily (see TwinPage), so three.js is only downloaded when someone opens it.
 *
 * The model is public/models/swampds.glb, built in Blender by blender/build_twin.py. Parts are
 * found by name (listed in that script), so a model edited by hand keeps working as long as the
 * names stay the same. Labels, water particles and drips are placed from each part's bounds.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}models/swampds.glb`;

// Which monitored segment each pipe run belongs to. Past F2 nothing is monitored.
const PIPE_SEGMENT = [null, null, 'A', 'A', null];
const PIPES = PIPE_SEGMENT.map((_, i) => `Pipe_${i}`);

const WATER = '#38bdf8';
const PUMP_ON = new Color('#10b981');
const VALVE_OPEN = new Color('#f59e0b');
const LEAK = new Color('#f43f5e');
const VERIFYING = new Color('#fbbf24');
const COLORS = {
  light: { bg: '#f8fafc', floor: '#e2e8f0' },
  dark:  { bg: '#020617', floor: '#0f172a' },
};

// Eases a value toward its target each frame, so levels glide instead of jumping on each tick.
const approach = (current, target, dt, rate = 4) => current + (target - current) * Math.min(1, dt * rate);

const meshesOf = (node) => {
  const out = [];
  node?.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
};

/** Sets a part's colour, or restores the one it has in the model when `color` is null. */
function tint(node, color) {
  for (const m of meshesOf(node)) m.material.color.copy(color ?? m.userData.baseColor);
}

/** Which clickable part a hit mesh belongs to. */
function partOf(obj) {
  for (let o = obj; o; o = o.parent) {
    if (o.name.startsWith('Pump')) return 'pump';
    if (o.name.startsWith('Valve_A')) return 'valve';
  }
  return null;
}

function useModel() {
  const { scene } = useGLTF(MODEL_URL);
  return useMemo(() => {
    const root = scene.clone(true);
    // Own materials per mesh, so tinting one part never changes another that shares a material.
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.userData.baseColor = o.material.color.clone();
    });
    // Glass: see-through, and never hides the water behind it.
    for (const name of ['Tank_Source', 'Tank_Delivery']) {
      for (const m of meshesOf(root.getObjectByName(name))) {
        Object.assign(m.material, { transparent: true, opacity: 0.22, depthWrite: false });
        m.renderOrder = 1;
      }
    }
    root.updateMatrixWorld(true);
    const get = (name) => root.getObjectByName(name);
    const bounds = (name) => new Box3().setFromObject(get(name));
    const top = (name) => {
      const b = bounds(name);
      return [(b.min.x + b.max.x) / 2, b.max.y + 0.35, (b.min.z + b.max.z) / 2];
    };
    const valve = bounds('Valve_A').getCenter(new Vector3());
    return {
      root,
      water: { source: get('Water_Source'), delivery: get('Water_Delivery') },
      pump: get('Pump_Body'),
      rotor: get('Pump_Rotor'),
      valve: get('Valve_A'),
      handle: get('Valve_A_Handle'),
      pipes: PIPES.map(get),
      pipeRuns: PIPES.map((name) => {
        const b = bounds(name);
        return { from: b.min.x, to: b.max.x, y: (b.min.y + b.max.y) / 2 };
      }),
      labels: {
        source: top('Tank_Source'), delivery: top('Tank_Delivery'), pump: top('Pump_Body'),
        f1: top('Sensor_F1'), f2: top('Sensor_F2'), valve: top('Valve_A_Handle'),
      },
      drip: [valve.x, bounds('Valve_A').min.y, valve.z],
    };
  }, [scene]);
}

/** Colours and the valve handle follow the twin's state. */
function showState(model, { pumpOn, valveOpen, segments }) {
  tint(model.pump, pumpOn ? PUMP_ON : null);
  tint(model.handle, valveOpen ? VALVE_OPEN : null);
  model.handle.rotation.y = valveOpen ? Math.PI / 2 : 0;
  model.pipes.forEach((pipe, i) => {
    const seg = PIPE_SEGMENT[i] && segments[PIPE_SEGMENT[i]];
    tint(pipe, seg?.leak ? LEAK : seg?.abnormalFor > 0 ? VERIFYING : null);
  });
}

/** Per frame: water levels glide to the twin's values; the rotor spins while the pump runs. */
function animate(model, { tanks, pumpOn }, dt) {
  for (const side of ['source', 'delivery']) {
    const w = model.water[side];
    w.scale.y = approach(w.scale.y, Math.max(0.001, tanks[side] / 100), dt);
  }
  if (pumpOn) model.rotor.rotation.z -= dt * 12;
}

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

const PARTICLES = 5;

/** Water moving through one pipe run; faster at higher flow, hidden when nothing flows. */
function FlowParticles({ run, flow }) {
  const dots = useRef([]);
  const offset = useRef(0);
  const flowing = flow > 0.08;
  useFrame((_, dt) => {
    offset.current = (offset.current + dt * (0.25 + flow * 0.12)) % 1;
    dots.current.forEach((d, i) => {
      if (!d) return;
      d.visible = flowing;
      d.position.x = run.from + ((offset.current + i / PARTICLES) % 1) * (run.to - run.from);
    });
  });
  return Array.from({ length: PARTICLES }, (_, i) => (
    <mesh key={i} ref={(m) => { dots.current[i] = m; }} position={[run.from, run.y, 0]} visible={false}>
      <sphereGeometry args={[0.07, 12, 12]} />
      <meshStandardMaterial color={WATER} emissive={WATER} emissiveIntensity={0.4} />
    </mesh>
  ));
}

function Drips({ at, active }) {
  const drops = useRef([]);
  useFrame((state) => {
    drops.current.forEach((d, i) => {
      if (!d) return;
      const t = (state.clock.elapsedTime * 0.9 + i / 3) % 1;
      d.visible = active;
      d.position.y = at[1] - t * at[1];
    });
  });
  return [0, 1, 2].map((i) => (
    <mesh key={i} ref={(m) => { drops.current[i] = m; }} position={at} visible={false}>
      <sphereGeometry args={[0.06, 12, 12]} />
      <meshStandardMaterial color="#0284c7" />
    </mesh>
  ));
}

function Scene({ sim, dark, onToggleValve, onTogglePump }) {
  const palette = dark ? COLORS.dark : COLORS.light;
  const { flows, tanks, valves, leakFlow, segments, pumpOn } = sim;
  const model = useModel();
  const valveOpen = valves.A > 0;

  useEffect(() => { showState(model, { pumpOn, valveOpen, segments }); }, [model, pumpOn, valveOpen, segments]);
  useFrame((_, dt) => animate(model, { tanks, pumpOn }, dt));

  const handleClick = (e) => {
    const part = partOf(e.object);
    if (!part) return;
    e.stopPropagation();
    if (part === 'pump') onTogglePump?.();
    else onToggleValve?.('A', valveOpen ? 0 : 25);
  };
  const handleHover = (e) => {
    const part = partOf(e.object);
    document.body.style.cursor = part === 'valve' || (part === 'pump' && sim.mode === 'manual') ? 'pointer' : '';
  };

  const pipeFlow = [flows.f1, flows.f1, flows.f1, flows.f2, flows.f2];
  const { labels } = model;

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <ambientLight intensity={dark ? 0.6 : 0.85} />
      <directionalLight position={[4, 8, 6]} intensity={dark ? 1.2 : 1.5} />
      <directionalLight position={[-6, 4, -4]} intensity={0.4} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[16, 6]} />
        <meshStandardMaterial color={palette.floor} />
      </mesh>

      <primitive
        object={model.root}
        onClick={handleClick}
        onPointerMove={handleHover}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      />

      {model.pipeRuns.map((run, i) => <FlowParticles key={i} run={run} flow={pipeFlow[i]} />)}
      <Drips at={model.drip} active={leakFlow.A > 0.05} />

      <Label position={labels.source} title="Source" value={`${Math.round(tanks.source)}%`} />
      <Label position={labels.pump} title="Pump" value={pumpOn ? 'ON' : 'OFF'}
        tone={pumpOn ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'} />
      <Label position={labels.f1} title="Sensor 1" value={`${flows.f1.toFixed(2)} L/min`} />
      <Label position={labels.valve} title="Valve A" value={`${valves.A}%`}
        tone={valveOpen ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} />
      <Label position={labels.f2} title="Sensor 2" value={`${flows.f2.toFixed(2)} L/min`} />
      <Label position={labels.delivery} title="Delivery" value={`${Math.round(tanks.delivery)}%`} />

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
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
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
