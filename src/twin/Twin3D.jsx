import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF, Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { Box3, Color, DoubleSide, MeshPhysicalMaterial } from 'three';

/**
 * 3D view of the pipeline, driven by the same `sim` state as PipelineSchematic.
 * Loaded lazily (see TwinPage), so three.js is only downloaded when someone opens it.
 *
 * The model is public/models/swampds.glb, built in Blender by blender/build_twin.py and
 * Draco-compressed (decoder in public/draco/). Parts are found by name (listed in that script),
 * so a model edited by hand keeps working as long as the names stay the same. Water in the
 * tubes, bubbles, drips and labels are placed from each part's bounds.
 */

const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}models/swampds.glb`;
const DRACO_URL = `${BASE}draco/`;

// Which monitored segment each pipe run belongs to (A: F1 -> F2, B: F2 -> F3). Past F3 nothing is monitored.
const PIPE_SEGMENT = [null, null, 'A', 'A', 'B', 'B', null];
const VALVES = ['A', 'B'];
const PIPES = PIPE_SEGMENT.map((_, i) => `Pipe_${i}`);

const WATER_COLOR = '#2f8fcf';
const LEAK = new Color('#f43f5e');
const VERIFYING = new Color('#f59e0b');
const LED_ON = new Color('#1fd65f');
const LED_OFF = new Color('#000000');
// Seamless studio backdrop: the floor is the background colour, so there is no horizon line.
const COLORS = {
  light: { bg: '#e9edf2' },
  dark:  { bg: '#070b14' },
};

// Camera: like an architectural photo with a shift lens. It stays level (so upright parts stay
// upright, at any angle) at EYE_HEIGHT, and the picture is shifted down to centre the rig instead
// of tilting the camera. Orbiting only turns it around the rig; zoom moves it closer or further.
const BOARD = [14.8, 2.6];   // base board size (BOARD_W in blender/build_twin.py)
const SCENE_WIDTH = BOARD[0] + 2.4;   // the base board plus a margin (its front corners sit nearer the camera)
const RIG_CENTRE_Y = 0.8;    // the height the shift centres on
const EYE_HEIGHT = 3.4;
const FOV = 28;

// Materials Blender cannot export the way a browser needs them: see-through, with reflections.
const LOOKS = {
  Glass: () => new MeshPhysicalMaterial({
    color: '#f4f9ff', transparent: true, opacity: 0.14, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02,
    envMapIntensity: 1.8, depthWrite: false, side: DoubleSide,
  }),
  Water: () => new MeshPhysicalMaterial({
    color: WATER_COLOR, transparent: true, opacity: 0.72, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.2,
    depthWrite: false,
  }),
  ClearTube: () => new MeshPhysicalMaterial({
    color: '#f5f8fb', transparent: true, opacity: 0.3, roughness: 0.1, clearcoat: 1, envMapIntensity: 1.6,
    depthWrite: false,
  }),
};
const RENDER_ORDER = { Water: 1, Glass: 2, ClearTube: 2 };

// Eases a value toward its target each frame, so changes glide instead of jumping on each tick.
const approach = (current, target, dt, rate = 4) => current + (target - current) * Math.min(1, dt * rate);

const meshesOf = (node) => {
  const out = [];
  node?.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
};

/** Which clickable part a hit mesh belongs to: 'pump', 'A', 'B' (a valve) or null. */
function partOf(obj) {
  for (let o = obj; o; o = o.parent) {
    if (o.name.startsWith('Pump')) return 'pump';
    const valve = VALVES.find((id) => o.name.startsWith(`Valve_${id}`));
    if (valve) return valve;
  }
  return null;
}

function useModel() {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  return useMemo(() => {
    const root = scene.clone(true);
    // Own materials per mesh, so changing one part never changes another that shares a material.
    root.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material.name;
      o.material = LOOKS[name] ? LOOKS[name]() : o.material.clone();
      o.renderOrder = RENDER_ORDER[name] ?? 0;
      o.userData.baseColor = o.material.color.clone();
      o.userData.baseOpacity = o.material.opacity;
    });
    root.updateMatrixWorld(true);

    const get = (name) => root.getObjectByName(name);
    const bounds = (name) => new Box3().setFromObject(get(name));
    const above = (name, lift = 0.3) => {
      const b = bounds(name);
      return [(b.min.x + b.max.x) / 2, b.max.y + lift, (b.min.z + b.max.z) / 2];
    };
    const valveBottom = (id) => {
      const b = bounds(`Valve_${id}`);
      return [(b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2];
    };
    return {
      root,
      water: { source: get('Water_Source'), delivery: get('Water_Delivery') },
      rotor: get('Pump_Rotor'),
      led: get('Pump_LED'),
      handles: Object.fromEntries(VALVES.map((id) => [id, get(`Valve_${id}_Handle`)])),
      pipes: PIPES.map(get),
      pipeRuns: PIPES.map((name) => {
        const b = bounds(name);
        return { from: b.min.x, to: b.max.x, y: (b.min.y + b.max.y) / 2, r: (b.max.y - b.min.y) / 2 };
      }),
      labels: {
        source: above('Tank_Source'), delivery: above('Sensor_Bracket'), pump: above('Pump_Grille'),
        f1: above('Sensor_F1', 0.2), f2: above('Sensor_F2', 0.2), f3: above('Sensor_F3', 0.2),
        valveA: above('Valve_A_Handle'), valveB: above('Valve_B_Handle'),
      },
      valveBottoms: Object.fromEntries(VALVES.map((id) => [id, valveBottom(id)])),
      fan: { speed: 0 },
    };
  }, [scene]);
}

/** Pipe colours, the pump LED and the valve levers follow the twin's state. */
function showState(model, { pumpOn, openA, openB, segments }) {
  for (const m of meshesOf(model.led)) {
    m.material.emissive.copy(pumpOn ? LED_ON : LED_OFF);
    m.material.emissiveIntensity = pumpOn ? 3 : 0;
  }
  // A real ball valve: lever across the pipe is closed, along the pipe is open.
  model.handles.A.rotation.y = openA ? Math.PI / 2 : 0;
  model.handles.B.rotation.y = openB ? Math.PI / 2 : 0;
  model.pipes.forEach((pipe, i) => {
    const seg = PIPE_SEGMENT[i] && segments[PIPE_SEGMENT[i]];
    const flag = seg?.leak ? LEAK : seg?.abnormalFor > 0 ? VERIFYING : null;
    for (const m of meshesOf(pipe)) {
      m.material.color.copy(flag ?? m.userData.baseColor);
      m.material.opacity = flag ? 0.6 : m.userData.baseOpacity;
    }
  });
}

/** Per frame: tank levels glide to the twin's values; the fan spins up and down like a real motor. */
function animate(model, { tanks, pumpOn }, dt) {
  for (const side of ['source', 'delivery']) {
    const w = model.water[side];
    w.scale.y = approach(w.scale.y, Math.max(0.001, tanks[side] / 100), dt);
  }
  model.fan.speed = approach(model.fan.speed, pumpOn ? 26 : 0, dt, pumpOn ? 1.5 : 0.6);
  model.rotor.rotation.y += model.fan.speed * dt;
}

const HALF_FOV_TAN = Math.tan((FOV * Math.PI) / 360);

/** Puts the camera where the whole rig fits the screen shape. */
function fitCamera(camera, controls, { width, height }) {
  const fitWidth = SCENE_WIDTH / 2 / (HALF_FOV_TAN * (width / height));
  const fitHeight = 1.9 / HALF_FOV_TAN;   // the tanks plus the labels above them
  const distance = Math.max(fitWidth, fitHeight);
  camera.position.set(0, EYE_HEIGHT, distance);
  if (controls) {
    controls.maxDistance = distance * 1.6;
    controls.update();
  }
}

/** The shift lens: moves the picture so the rig sits in the middle, without tilting the camera. */
function shiftLens(camera, controls, { width, height }) {
  const distance = camera.position.distanceTo(controls.target);
  const rigY = (RIG_CENTRE_Y - EYE_HEIGHT) / (distance * HALF_FOV_TAN);   // where the rig falls, -1..1
  camera.setViewOffset(width, height, 0, (-rigY * height) / 2, width, height);
}

function CameraRig() {
  const { camera, size, controls } = useThree();
  useEffect(() => fitCamera(camera, controls, size), [camera, size, controls]);
  useFrame(() => { if (controls) shiftLens(camera, controls, size); });
  return null;
}

function Label({ position, title, value, tone = 'text-slate-800 dark:text-slate-100' }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="flex flex-col items-center whitespace-nowrap leading-tight px-2 py-1 rounded-md bg-white/75 dark:bg-slate-900/70 backdrop-blur-sm shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</span>
        {value != null && <span className={`text-[11px] font-mono font-semibold ${tone}`}>{value}</span>}
      </div>
    </Html>
  );
}

const BUBBLES = 7;

/** Water filling a clear tube while it flows, with bubbles carried along at the flow speed. */
function TubeWater({ run, flow }) {
  const water = useRef();
  const bubbles = useRef([]);
  const offset = useRef((((run.from * 0.37) % 1) + 1) % 1);   // runs start out of step with each other
  const flowing = flow > 0.08;
  const length = run.to - run.from;
  useFrame((_, dt) => {
    const m = water.current.material;
    m.opacity = approach(m.opacity, flowing ? 0.62 : 0, dt, 2);
    water.current.visible = m.opacity > 0.01;
    offset.current = (offset.current + (dt * (0.2 + flow * 0.1) * 6) / length) % 1;
    bubbles.current.forEach((b, i) => {
      if (!b) return;
      b.visible = flowing;
      b.position.x = run.from + ((offset.current + i / BUBBLES + (i % 3) * 0.037) % 1) * length;
    });
  });
  return (
    <group>
      <mesh ref={water} position={[(run.from + run.to) / 2, run.y, 0]} rotation={[0, 0, Math.PI / 2]} renderOrder={1}>
        <cylinderGeometry args={[run.r * 0.8, run.r * 0.8, length, 32]} />
        <meshPhysicalMaterial color={WATER_COLOR} transparent opacity={0} roughness={0.05} clearcoat={1} depthWrite={false} />
      </mesh>
      {Array.from({ length: BUBBLES }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => { bubbles.current[i] = m; }}
          position={[run.from, run.y + ((i % 3) - 1) * run.r * 0.35, ((i % 2) - 0.5) * run.r * 0.4]}
          visible={false}
          renderOrder={3}
        >
          <sphereGeometry args={[run.r * (0.14 + (i % 3) * 0.05), 12, 12]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.55} roughness={0} clearcoat={1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Drips falling from the valve while it leaks, and a puddle that spreads on the board. */
function Leak({ at, active }) {
  const drops = useRef([]);
  const puddle = useRef();
  const size = useRef(0);
  useFrame((state, dt) => {
    drops.current.forEach((d, i) => {
      if (!d) return;
      const t = (state.clock.elapsedTime * 1.1 + i / 3) % 1;
      d.visible = active;
      d.position.y = at[1] - t * t * at[1];   // accelerating, like a real drop
    });
    size.current = active ? Math.min(1, size.current + dt * 0.08) : Math.max(0, size.current - dt * 0.02);
    puddle.current.scale.setScalar(0.05 + size.current * 0.55);
    puddle.current.visible = size.current > 0.001;
  });
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { drops.current[i] = m; }} position={at} scale={[1, 1.4, 1]} visible={false}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshPhysicalMaterial color={WATER_COLOR} transparent opacity={0.8} roughness={0} clearcoat={1} />
        </mesh>
      ))}
      <mesh ref={puddle} position={[at[0], 0.003, at[2] - 0.1]} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={1}>
        <circleGeometry args={[1, 48]} />
        <meshPhysicalMaterial color={WATER_COLOR} transparent opacity={0.45} roughness={0} clearcoat={1} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Studio lighting built locally (no image downloads): soft boxes for the reflections in glass and metal. */
function Studio() {
  return (
    <Environment resolution={256}>
      <Lightformer form="rect" intensity={2.2} position={[0, 6, 1]} rotation-x={Math.PI / 2} scale={[14, 4, 1]} />
      <Lightformer form="rect" intensity={1.4} position={[-9, 2.5, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
      <Lightformer form="rect" intensity={1.4} position={[9, 2.5, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
      <Lightformer form="rect" intensity={0.9} position={[0, 2, 10]} scale={[16, 3, 1]} />
      <Lightformer form="ring" intensity={1.5} position={[4, 4, 6]} scale={1.5} />
    </Environment>
  );
}

function Scene({ sim, dark, onToggleValve, onTogglePump }) {
  const palette = dark ? COLORS.dark : COLORS.light;
  const { flows, tanks, valves, leakFlow, segments, pumpOn } = sim;
  const model = useModel();
  const openA = valves.A > 0;
  const openB = valves.B > 0;

  useEffect(() => { showState(model, { pumpOn, openA, openB, segments }); }, [model, pumpOn, openA, openB, segments]);
  useFrame((_, dt) => animate(model, { tanks, pumpOn }, dt));

  const handleClick = (e) => {
    const part = partOf(e.object);
    if (!part) return;
    e.stopPropagation();
    if (part === 'pump') onTogglePump?.();
    else onToggleValve?.(part, valves[part] > 0 ? 0 : 25);
  };
  const handleHover = (e) => {
    const part = partOf(e.object);
    document.body.style.cursor = (part && part !== 'pump') || (part === 'pump' && sim.mode === 'manual') ? 'pointer' : '';
  };

  const pipeFlow = [flows.f1, flows.f1, flows.f1, flows.f2, flows.f2, flows.f3, flows.f3];
  const { labels } = model;

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <Studio />
      <ambientLight intensity={dark ? 0.15 : 0.25} />
      <directionalLight position={[5, 9, 7]} intensity={dark ? 0.9 : 1.2} />

      {/* The board's soft shadow on the (invisible, backdrop-coloured) floor */}
      <ContactShadows position={[0, -0.178, 0]} scale={[BOARD[0] + 5.2, 6]} far={1} blur={3} opacity={dark ? 0.7 : 0.45} resolution={512} />
      {/* Shadows of the rig on the board */}
      <ContactShadows position={[0, 0.002, 0]} scale={BOARD} far={2.4} blur={2.4} opacity={0.5} resolution={1024} />

      <primitive
        object={model.root}
        onClick={handleClick}
        onPointerMove={handleHover}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      />

      {model.pipeRuns.map((run, i) => <TubeWater key={i} run={run} flow={pipeFlow[i]} />)}
      {VALVES.map((id) => <Leak key={id} at={model.valveBottoms[id]} active={leakFlow[id] > 0.05} />)}

      <Label position={labels.source} title="Source" value={`${Math.round(tanks.source)}%`} />
      <Label position={labels.pump} title="Pump" value={pumpOn ? 'ON' : 'OFF'}
        tone={pumpOn ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'} />
      <Label position={labels.f1} title="Sensor 1" value={`${flows.f1.toFixed(2)} L/min`} />
      <Label position={labels.valveA} title="Valve A" value={`${valves.A}%`}
        tone={openA ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'} />
      <Label position={labels.f2} title="Sensor 2" value={`${flows.f2.toFixed(2)} L/min`} />
      <Label position={labels.valveB} title="Valve B" value={`${valves.B}%`}
        tone={openB ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'} />
      <Label position={labels.f3} title="Sensor 3" value={`${flows.f3.toFixed(2)} L/min`} />
      <Label position={labels.delivery} title="Delivery" value={`${Math.round(tanks.delivery)}%`} />

      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={6}
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
        minAzimuthAngle={-Math.PI / 2.5}
        maxAzimuthAngle={Math.PI / 2.5}
        target={[0, EYE_HEIGHT, 0]}
        enableDamping
      />
      <CameraRig />
    </>
  );
}

/**
 * @param {{ sim: object, dark?: boolean, onToggleValve?: Function, onTogglePump?: Function }} props
 * Drag to orbit, scroll or pinch to zoom. Click the pump (manual mode) or a valve, as in 2D.
 */
export default function Twin3D({ sim, dark = false, onToggleValve, onTogglePump }) {
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  return (
    <div
      className="w-full h-[300px] sm:h-[400px] rounded-xl overflow-hidden"
      role="img"
      aria-label={`3D pipeline view. Pump ${sim.pumpOn ? 'on' : 'off'}, delivery tank ${Math.round(sim.tanks.delivery)}% full.`}
    >
      <Canvas camera={{ fov: FOV, position: [0, EYE_HEIGHT, 30] }} dpr={[1, 1.75]}>
        <Scene sim={sim} dark={dark} onToggleValve={onToggleValve} onTogglePump={onTogglePump} />
      </Canvas>
    </div>
  );
}
