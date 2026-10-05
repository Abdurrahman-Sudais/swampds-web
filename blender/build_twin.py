"""
Builds the SWAMPDS digital-twin model and exports it for the website.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python blender/build_twin.py

Writes:
    blender/swampds_twin.blend      - open this to refine the model by hand
    public/models/swampds.glb       - what the 3D view (src/twin/Twin3D.jsx) loads

The website finds parts by NAME, so keep these names when you edit the model:
    Tank_Source, Tank_Delivery      acrylic tanks
    Water_Source, Water_Delivery    water; origin on the tank floor, modelled at 100 % (14 cm), scaled by the level
    Pump_Body, Pump_Rotor           the rotor (cooling fan under the top grille) spins about the vertical axis
    Pump_LED                        lights green while the pump runs
    Sensor_F1, Sensor_F2, Sensor_F3 YF-S201 flow sensors
    Valve_A, Valve_A_Handle         ball valves; the lever's origin is on the stem. Lever across the pipe = closed
    Valve_B, Valve_B_Handle
    Pipe_0 .. Pipe_6                clear tubing, left to right; Pipe_2 and Pipe_3 are monitored segment A
                                    (F1 -> F2), Pipe_4 and Pipe_5 segment B (F2 -> F3)
Anything else (board, clamps, brackets, the HC-SR04) is decoration. Parts named Pump*, Valve_A* or
Valve_B* are clickable on the website.

Materials the website restyles by name: Glass, Water, ClearTube (Blender cannot export the
see-through look the browser needs, so those three are tuned in Twin3D.jsx).

After editing by hand: File > Export > glTF 2.0, format "glTF Binary (.glb)", save over
public/models/swampds.glb. Re-running this script rebuilds the model from scratch.

Scale: 1 Blender unit = 10 cm, so the 19 cm tanks are 1.9 units tall.
"""

import math
from pathlib import Path

import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parent.parent
BLEND_OUT = ROOT / "blender" / "swampds_twin.blend"
GLB_OUT = ROOT / "public" / "models" / "swampds.glb"

# ---- Geometry (keep in step with src/twin/config.js) -----------------------------------------
TANK_H = 1.9            # 19 cm
TANK_R = 0.65
WALL = 0.03
FLOOR = 0.04            # tank bottom thickness; water starts here
SENSOR_DROP = 0.12      # HC-SR04 face 1.2 cm below the rim
FULL_WATER = 1.4        # 14 cm of water = 100 %
PIPE_Z = 0.45           # pipe centre height above the board
PIPE_R = 0.1
BOARD_W = 14.8          # base board length (Twin3D.jsx frames the camera on it: SCENE_WIDTH)
# Source, pump, F1, valve A, F2, valve B, F3, delivery: spaced so all seven tube runs are ~0.86 long.
NODE_X = [-6, -3.85, -2.25, -0.7, 0.85, 2.4, 3.95, 6]

R90 = math.radians(90)
ALONG_X = (0, R90, 0)   # turns a Z-axis primitive to lie along X
ALONG_Y = (R90, 0, 0)


# ---- Materials -------------------------------------------------------------------------------
def material(name, rgb, alpha=1.0, metallic=0.0, roughness=0.5, transmission=0.0, ior=1.45, coat=0.0,
             emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, alpha)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")

    def put(key, value):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value

    put("Base Color", (*rgb, 1.0))
    put("Alpha", alpha)
    put("Metallic", metallic)
    put("Roughness", roughness)
    put("Transmission Weight", transmission)
    put("IOR", ior)
    put("Coat Weight", coat)
    if emission:
        put("Emission Color", (*emission, 1.0))
        put("Emission Strength", 1.0)
    if alpha < 1.0:
        for attr, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, value)
            except (AttributeError, TypeError):
                pass
    return m


# ---- Mesh helpers ----------------------------------------------------------------------------
def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def smooth(obj, angle=35):
    """Smooth curved surfaces, keep hard edges hard (no modifier, so it survives joins)."""
    me = obj.data
    try:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(angle))
    except AttributeError:
        for p in me.polygons:
            p.use_smooth = True


def apply_mods(obj):
    activate(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def bevel(obj, width, segments=3):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    apply_mods(obj)
    smooth(obj)
    return obj


def adopt(name, mat):
    obj = bpy.context.active_object
    obj.name = obj.data.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def cylinder(name, mat, r, depth, loc, rot=(0, 0, 0), verts=64, fill="NGON", round_edges=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, end_fill_type=fill,
                                        location=loc, rotation=rot)
    obj = adopt(name, mat)
    return bevel(obj, round_edges) if round_edges else obj


def hexagon(name, mat, r, depth, loc, rot=(0, 0, 0)):
    return cylinder(name, mat, r, depth, loc, rot, verts=6, round_edges=min(r, depth) * 0.12)


def box(name, mat, size, loc, rot=(0, 0, 0), round_edges=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj = adopt(name, mat)
    return bevel(obj, round_edges) if round_edges else obj


def torus(name, mat, major, minor, loc, rot=(0, 0, 0), segments=48):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segments,
                                     minor_segments=10, location=loc, rotation=rot)
    return adopt(name, mat)


def band(name, mat, r, width, loc, rot=ALONG_X, thickness=0.01):
    """A thin open ring hugging a tube, like a hose clamp."""
    obj = cylinder(name, mat, r, width, loc, rot, verts=48, fill="NOTHING")
    solid = obj.modifiers.new("Thickness", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 1
    apply_mods(obj)
    smooth(obj)
    return obj


def sphere(name, mat, r, loc, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=loc)
    obj = bpy.context.active_object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return adopt(name, mat)


def join(name, target, *others):
    activate(target)
    for o in others:
        o.select_set(True)
    bpy.ops.object.join()
    target.name = target.data.name = name
    return target


def origin_to(obj, point):
    activate(obj)
    bpy.context.scene.cursor.location = point
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)


# ---- Scene -----------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0      # no swampds_twin.blend1 backup next to the file
bpy.context.scene.unit_settings.system = "METRIC"

GLASS = material("Glass", (0.92, 0.96, 1.0), alpha=0.15, roughness=0.02, transmission=1.0, ior=1.49, coat=1.0)
WATER = material("Water", (0.20, 0.58, 0.84), alpha=0.75, roughness=0.03, transmission=0.9, ior=1.33)
TUBE = material("ClearTube", (0.94, 0.96, 0.98), alpha=0.3, roughness=0.12, transmission=1.0, ior=1.5, coat=1.0)
WOOD = material("Plywood", (0.66, 0.50, 0.34), roughness=0.75)
PUMP_PAINT = material("Pump_Paint", (0.07, 0.20, 0.42), metallic=0.4, roughness=0.35, coat=0.6)
CAST = material("Cast_Iron", (0.16, 0.17, 0.19), metallic=0.7, roughness=0.45)
STEEL = material("Steel", (0.72, 0.74, 0.77), metallic=1.0, roughness=0.25)
ALU = material("Aluminium", (0.80, 0.81, 0.83), metallic=1.0, roughness=0.35)
BLACK = material("Black_Plastic", (0.025, 0.025, 0.03), roughness=0.45)
BRASS = material("Brass", (0.80, 0.58, 0.22), metallic=1.0, roughness=0.22)
VINYL_RED = material("Red_Vinyl", (0.72, 0.06, 0.05), roughness=0.4, coat=0.5)
PCB = material("PCB", (0.03, 0.22, 0.55), roughness=0.5)
PRINT = material("Print_White", (0.95, 0.95, 0.95), roughness=0.6)
LED = material("LED", (0.05, 0.12, 0.06), roughness=0.2, emission=(0, 0, 0))
WIRE_RED = material("Wire_Red", (0.75, 0.05, 0.04), roughness=0.4)
WIRE_YELLOW = material("Wire_Yellow", (0.9, 0.72, 0.05), roughness=0.4)
LABEL = material("Nameplate", (0.85, 0.86, 0.88), metallic=0.8, roughness=0.3)

# Base board everything stands on (its top is z = 0).
box("Base_Board", WOOD, (BOARD_W, 2.6, 0.18), (0, 0, -0.09), round_edges=0.02)


# ---- Tanks -----------------------------------------------------------------------------------
def tank(side, x, fill, outlet_dir):
    walls = cylinder(f"Tank_{side}", GLASS, TANK_R, TANK_H - FLOOR, (x, 0, FLOOR + (TANK_H - FLOOR) / 2),
                     verts=96, fill="NOTHING")
    solid = walls.modifiers.new("Wall", "SOLIDIFY")
    solid.thickness = WALL
    solid.offset = -1
    apply_mods(walls)
    smooth(walls)
    base = cylinder(f"{side}_floor", GLASS, TANK_R, FLOOR, (x, 0, FLOOR / 2), verts=96, round_edges=0.008)
    rim = torus(f"{side}_rim", GLASS, TANK_R - WALL / 2, 0.022, (x, 0, TANK_H), segments=96)
    join(f"Tank_{side}", walls, base, rim)

    # Water: modelled full (14 cm) with its origin on the tank floor, so scaling Z sets the level.
    r = TANK_R - WALL - 0.004
    water = cylinder(f"Water_{side}", WATER, r, FULL_WATER, (x, 0, FLOOR + FULL_WATER / 2), verts=96)
    water.data.transform(Matrix.Translation((0, 0, FULL_WATER / 2)))
    water.location.z = FLOOR
    water.scale.z = fill

    # Printed level scale on the front: a tick every 1 cm, long ticks every 5 cm.
    ticks = []
    angle = math.radians(-105)
    for cm in range(0, 15):
        major = cm % 5 == 0
        length = 0.13 if major else 0.07
        ticks.append(box(f"{side}_tick{cm}", PRINT, (length, 0.004, 0.012 if major else 0.008),
                         (x + (TANK_R + 0.002) * math.cos(angle), (TANK_R + 0.002) * math.sin(angle),
                          FLOOR + cm * 0.1),
                         rot=(0, 0, angle + R90), round_edges=0))
    join(f"Tank_{side}_Scale", *ticks)

    # Bulkhead fitting where the tubing leaves the tank wall.
    fx = x + outlet_dir * (TANK_R + 0.03)
    nut = hexagon(f"{side}_nut", BLACK, 0.16, 0.06, (fx, 0, PIPE_Z), ALONG_X)
    barb = cylinder(f"{side}_barb", BLACK, 0.075, 0.2, (fx + outlet_dir * 0.1, 0, PIPE_Z), ALONG_X,
                    verts=32, round_edges=0.006)
    inner = hexagon(f"{side}_inner_nut", BLACK, 0.16, 0.05, (x + outlet_dir * (TANK_R - WALL - 0.03), 0, PIPE_Z),
                    ALONG_X)
    join(f"Fitting_{side}", nut, barb, inner)
    return fx + outlet_dir * 0.2


source_port = tank("Source", NODE_X[0], 0.9, +1)
delivery_port = tank("Delivery", NODE_X[7], 0.35, -1)

# HC-SR04 on an aluminium bracket across the delivery tank, its face 1.2 cm below the rim.
dx = NODE_X[7]
rim_top = TANK_H + 0.022
box("Sensor_Bracket", ALU, (2 * TANK_R + 0.12, 0.14, 0.03), (dx, 0, rim_top + 0.015), round_edges=0.006)
board_bottom = rim_top - 0.016
parts = [box("hc_pcb", PCB, (0.45, 0.2, 0.016), (dx, 0, board_bottom + 0.008), round_edges=0.002)]
face = TANK_H - SENSOR_DROP
for i, ex in enumerate((-0.13, 0.13)):
    parts.append(cylinder(f"hc_can{i}", STEEL, 0.08, board_bottom - face, (dx + ex, 0, (board_bottom + face) / 2),
                          verts=48, round_edges=0.004))
    parts.append(cylinder(f"hc_mesh{i}", BLACK, 0.068, 0.004, (dx + ex, 0, face - 0.001), verts=48))
parts.append(box("hc_crystal", STEEL, (0.08, 0.03, 0.02), (dx, 0.04, board_bottom - 0.012), round_edges=0.006))
join("Sensor_Level", *parts)

# ---- Pump: an inline circulator. Casing on the pipe line, motor standing up, fan on top. --------
px = NODE_X[1]
casing = cylinder("Pump_Body", CAST, 0.22, 0.46, (px, 0, PIPE_Z), ALONG_X, round_edges=0.02)
unions = [hexagon(f"pump_union{s}", BRASS, 0.14, 0.09, (px + s * 0.27, 0, PIPE_Z), ALONG_X) for s in (-1, 1)]
spigots = [cylinder(f"pump_spigot{s}", BRASS, 0.075, 0.12, (px + s * 0.36, 0, PIPE_Z), ALONG_X, verts=32,
                    round_edges=0.005) for s in (-1, 1)]
neck = cylinder("pump_neck", CAST, 0.15, 0.14, (px, 0, PIPE_Z + 0.25), round_edges=0.01)
motor_bottom = PIPE_Z + 0.32
motor_h = 0.56
motor_mid = motor_bottom + motor_h / 2
motor = cylinder("pump_motor", PUMP_PAINT, 0.26, motor_h, (px, 0, motor_mid), round_edges=0.02)
fins = []
for i in range(20):
    a = 2 * math.pi * i / 20
    fins.append(box(f"pump_fin{i}", PUMP_PAINT, (0.07, 0.014, motor_h - 0.08),
                    (px + 0.29 * math.cos(a), 0.29 * math.sin(a), motor_mid), rot=(0, 0, a), round_edges=0.004))
terminal = box("pump_terminal", PUMP_PAINT, (0.22, 0.12, 0.16), (px, -0.36, motor_mid + 0.1), round_edges=0.015)
plate = box("pump_plate", LABEL, (0.16, 0.006, 0.09), (px, -0.423, motor_mid + 0.1), round_edges=0.002)
top = motor_bottom + motor_h
shroud = cylinder("pump_shroud", PUMP_PAINT, 0.3, 0.1, (px, 0, top + 0.05), fill="NOTHING", round_edges=0.0)
join("Pump_Body", casing, *unions, *spigots, neck, motor, *fins, terminal, plate, shroud)

led = cylinder("Pump_LED", LED, 0.022, 0.02, (px + 0.06, -0.425, motor_mid + 0.165), ALONG_Y, verts=24)

feet = [box("pump_foot", CAST, (0.56, 0.42, 0.05), (px, 0, 0.025), round_edges=0.01),
        box("pump_pedestal", CAST, (0.14, 0.22, PIPE_Z - 0.2), (px, 0, (PIPE_Z - 0.2) / 2 + 0.03), round_edges=0.01)]
join("Pump_Feet", *feet)

# Cooling fan under the grille; spins about its vertical axis on the website.
fan_z = top + 0.04
hub = cylinder("Pump_Rotor", STEEL, 0.06, 0.04, (px, 0, fan_z), verts=32, round_edges=0.008)
blades = [box(f"blade{i}", BLACK, (0.17, 0.06, 0.008),
              (px + 0.15 * math.cos(2 * math.pi * i / 7), 0.15 * math.sin(2 * math.pi * i / 7), fan_z),
              rot=(math.radians(28), 0, 2 * math.pi * i / 7), round_edges=0.003) for i in range(7)]
join("Pump_Rotor", hub, *blades)
origin_to(hub, (px, 0, fan_z))

grille = [torus("Pump_Grille", STEEL, 0.29, 0.012, (px, 0, top + 0.1)),
          torus("grille_inner", STEEL, 0.17, 0.008, (px, 0, top + 0.1))]
grille += [box(f"grille_bar{i}", STEEL, (0.58, 0.012, 0.012), (px, 0, top + 0.1), rot=(0, 0, math.pi * i / 6),
               round_edges=0) for i in range(6)]
join("Pump_Grille", *grille)


# ---- YF-S201 flow sensors --------------------------------------------------------------------
def flow_sensor(name, x):
    body = cylinder(name, BLACK, 0.17, 0.34, (x, 0, PIPE_Z), ALONG_X, round_edges=0.02)
    parts = []
    for s in (-1, 1):
        parts.append(cylinder(f"{name}_thread{s}", BLACK, 0.1, 0.15, (x + s * 0.245, 0, PIPE_Z), ALONG_X,
                              verts=48, round_edges=0.005))
        parts += [torus(f"{name}_ring{s}{k}", BLACK, 0.1, 0.009, (x + s * (0.19 + 0.025 * k), 0, PIPE_Z), ALONG_X,
                        segments=32) for k in range(5)]
    parts.append(cylinder(f"{name}_hall", BLACK, 0.12, 0.12, (x, 0, PIPE_Z + 0.2), round_edges=0.01))
    parts.append(cylinder(f"{name}_cap", BLACK, 0.105, 0.02, (x, 0, PIPE_Z + 0.27), round_edges=0.005))
    for i, sx in enumerate((-0.06, 0.06)):
        parts.append(cylinder(f"{name}_screw{i}", STEEL, 0.015, 0.012, (x + sx, -0.05, PIPE_Z + 0.282), verts=16))
    # Moulded flow-direction arrow on the front.
    parts.append(box(f"{name}_arrow", PRINT, (0.13, 0.004, 0.016), (x - 0.02, -0.171, PIPE_Z), round_edges=0))
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.035, radius2=0, depth=0.004,
                                    location=(x + 0.07, -0.171, PIPE_Z), rotation=(R90, R90, 0))
    parts.append(adopt(f"{name}_tip", PRINT))
    # Lead: red, black and yellow wires into a JST plug.
    for i, (wx, mat) in enumerate(((-0.025, WIRE_RED), (0, BLACK), (0.025, WIRE_YELLOW))):
        parts.append(cylinder(f"{name}_wire{i}", mat, 0.011, 0.26, (x + wx, 0.02, PIPE_Z + 0.4), verts=12))
    parts.append(box(f"{name}_plug", BLACK, (0.1, 0.04, 0.06), (x, 0.02, PIPE_Z + 0.55), round_edges=0.006))
    return join(name, body, *parts)


flow_sensor("Sensor_F1", NODE_X[2])
flow_sensor("Sensor_F2", NODE_X[4])
flow_sensor("Sensor_F3", NODE_X[6])


# ---- Ball valves -----------------------------------------------------------------------------
def ball_valve(name, vx):
    valve = sphere(name, BRASS, 0.16, (vx, 0, PIPE_Z), scale=(1.15, 0.92, 0.92))
    vparts = [hexagon(f"{name}_hex{s}", BRASS, 0.135, 0.12, (vx + s * 0.2, 0, PIPE_Z), ALONG_X) for s in (-1, 1)]
    vparts += [cylinder(f"{name}_spigot{s}", BRASS, 0.075, 0.12, (vx + s * 0.31, 0, PIPE_Z), ALONG_X, verts=32,
                        round_edges=0.005) for s in (-1, 1)]
    vparts.append(cylinder(f"{name}_stem", BRASS, 0.032, 0.14, (vx, 0, PIPE_Z + 0.19), verts=24))
    vparts.append(hexagon(f"{name}_gland", BRASS, 0.06, 0.05, (vx, 0, PIPE_Z + 0.15)))
    join(name, valve, *vparts)

    # Lever across the pipe (closed). Its origin is on the stem, so a quarter turn opens it.
    lever_z = PIPE_Z + 0.27
    lever = box(f"{name}_Handle", STEEL, (0.07, 0.16, 0.022), (vx, -0.06, lever_z), round_edges=0.006)
    grip = box(f"{name}_grip", VINYL_RED, (0.085, 0.36, 0.04), (vx, -0.3, lever_z), round_edges=0.016)
    nut = hexagon(f"{name}_nut", STEEL, 0.045, 0.03, (vx, 0, lever_z + 0.025))
    join(f"{name}_Handle", lever, grip, nut)
    origin_to(lever, (vx, 0, lever_z))


ball_valve("Valve_A", NODE_X[3])
ball_valve("Valve_B", NODE_X[5])

# ---- Clear tubing between the parts, with hose clamps and supports ---------------------------
SENSOR_HALF, VALVE_HALF = 0.32, 0.37    # from a part's centre to the end of its spigot
ports = [
    (source_port, px - 0.42),
    (px + 0.42, NODE_X[2] - SENSOR_HALF),
    (NODE_X[2] + SENSOR_HALF, NODE_X[3] - VALVE_HALF),
    (NODE_X[3] + VALVE_HALF, NODE_X[4] - SENSOR_HALF),
    (NODE_X[4] + SENSOR_HALF, NODE_X[5] - VALVE_HALF),
    (NODE_X[5] + VALVE_HALF, NODE_X[6] - SENSOR_HALF),
    (NODE_X[6] + SENSOR_HALF, delivery_port),
]
clamps, supports = [], []
for i, (a, b) in enumerate(ports):
    cylinder(f"Pipe_{i}", TUBE, PIPE_R, b - a, ((a + b) / 2, 0, PIPE_Z), ALONG_X, verts=48)
    for end, inward in ((a, 1), (b, -1)):
        clamps.append(band(f"clamp{i}{inward}", STEEL, PIPE_R + 0.002, 0.035, (end + inward * 0.07, 0, PIPE_Z)))
        clamps.append(box(f"clamp_screw{i}{inward}", STEEL, (0.03, 0.04, 0.035),
                          (end + inward * 0.07, 0, PIPE_Z + PIPE_R + 0.025), round_edges=0.006))
    mid = (a + b) / 2
    post_h = PIPE_Z - PIPE_R
    supports.append(box(f"post{i}", ALU, (0.05, 0.12, post_h), (mid, 0, post_h / 2), round_edges=0.006))
    supports.append(box(f"post_foot{i}", ALU, (0.14, 0.18, 0.012), (mid, 0, 0.006), round_edges=0.004))
    supports.append(band(f"saddle{i}", ALU, PIPE_R + 0.002, 0.06, (mid, 0, PIPE_Z), thickness=0.012))
join("Hose_Clamps", *clamps)
join("Pipe_Supports", *supports)

# ---- Camera and lights, for looking at the model in Blender (not exported) --------------------
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
cam.data.lens = 85
cam.location = (0, -30, 4.5)
cam.rotation_euler = (math.radians(84), 0, 0)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "AREA"))
key.data.energy, key.data.size = 3000, 8
key.location, key.rotation_euler = (4, -8, 9), (math.radians(45), 0, math.radians(25))
bpy.context.scene.collection.objects.link(key)
world = bpy.data.worlds.new("World")
world.color = (0.8, 0.82, 0.85)
bpy.context.scene.world = world

# ---- Save and export -------------------------------------------------------------------------
GLB_OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
# Draco-compressed (about a tenth of the size). The website decodes it with public/draco/.
bpy.ops.export_scene.gltf(filepath=str(GLB_OUT), export_format="GLB", export_apply=True, export_yup=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7)
print(f"Saved {BLEND_OUT}\nExported {GLB_OUT}")
