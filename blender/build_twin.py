"""
Builds the SWAMPDS digital-twin model and exports it for the website.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python blender/build_twin.py

Writes:
    blender/swampds_twin.blend      - open this to refine the model by hand
    public/models/swampds.glb       - what the 3D view (src/twin/Twin3D.jsx) loads

The website finds parts by NAME, so keep these names when you edit the model:
    Tank_Source, Tank_Delivery      glass tanks (shown see-through)
    Water_Source, Water_Delivery    water; origin at the bottom, modelled at 100 %, scaled up/down by the level
    Pump_Body, Pump_Rotor           body turns green when ON; rotor spins about its front-facing axis
    Pump_Feet                       (decoration; anything named Pump* is clickable)
    Sensor_F1, Sensor_F2            flow sensors (YF-S201)
    Valve_A, Valve_A_Handle         leak valve; handle turns a quarter and goes amber when open
    Pipe_0 .. Pipe_4                pipe runs left to right; Pipe_2 and Pipe_3 are monitored segment A
    Sensor_Level                    HC-SR04 inside the delivery tank (decoration)

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
SENSOR_DROP = 0.12      # HC-SR04 face 1.2 cm below the rim
FULL_WATER = 1.4        # 14 cm of water = 100 %
PIPE_Z = 0.45           # pipe centre height
PIPE_R = 0.1
NODE_X = [-5, -3, -1, 1, 3, 5]   # source, pump, F1, valve A, F2, delivery (same as Twin3D.jsx)

# ---- Helpers ---------------------------------------------------------------------------------
def material(name, rgb, alpha=1.0, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, alpha)
    bsdf = m.node_tree.nodes.get("Principled BSDF") if m.node_tree else None
    if bsdf is None:
        try:
            m.use_nodes = True
        except AttributeError:
            pass
        bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Alpha"].default_value = alpha
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1.0:
        for attr, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, value)
            except (AttributeError, TypeError):
                pass
    return m


def finish(obj, name, mat, smooth=True):
    obj.name = name
    obj.data.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    if smooth:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except (AttributeError, RuntimeError, TypeError):
            bpy.ops.object.shade_smooth()
    return obj


def cylinder(name, mat, r, depth, loc, rot=(0, 0, 0), fill="NGON", verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, end_fill_type=fill,
                                        location=loc, rotation=rot)
    return finish(bpy.context.active_object, name, mat)


def box(name, mat, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat, smooth=False)


def join(target, *others):
    bpy.ops.object.select_all(action="DESELECT")
    for o in (target, *others):
        o.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    return target


# ---- Scene -----------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = "METRIC"

GLASS = material("Glass", (0.80, 0.90, 1.00), alpha=0.22, roughness=0.05)
WATER = material("Water", (0.22, 0.74, 0.97), alpha=0.85, roughness=0.1)
PVC = material("PVC", (0.86, 0.88, 0.91), roughness=0.45)
PUMP = material("Pump", (0.45, 0.52, 0.60), metallic=0.3, roughness=0.4)
STEEL = material("Steel", (0.25, 0.27, 0.30), metallic=0.8, roughness=0.3)
PLASTIC = material("Black_Plastic", (0.06, 0.06, 0.07), roughness=0.5)
BRASS = material("Brass", (0.78, 0.60, 0.25), metallic=0.85, roughness=0.3)
HANDLE = material("Handle", (0.80, 0.16, 0.16), roughness=0.4)
PCB = material("PCB", (0.08, 0.30, 0.65), roughness=0.6)


def tank(side, x, water_pct):
    walls = cylinder(f"Tank_{side}", GLASS, TANK_R, TANK_H, (x, 0, TANK_H / 2), fill="NOTHING", verts=64)
    solid = walls.modifiers.new("Wall", "SOLIDIFY")
    solid.thickness = 0.03
    base = cylinder(f"Tank_{side}_Base", GLASS, TANK_R, 0.04, (x, 0, 0.02), verts=64)
    join(walls, base)
    walls.name = walls.data.name = f"Tank_{side}"

    # Water modelled at 100 % (14 cm) with its origin on the tank floor.
    w = cylinder(f"Water_{side}", WATER, TANK_R - 0.04, FULL_WATER, (x, 0, 0.04 + FULL_WATER / 2), verts=64)
    w.data.transform(Matrix.Translation((0, 0, FULL_WATER / 2)))
    w.location.z = 0.04
    w.scale.z = water_pct
    return walls


tank("Source", NODE_X[0], 0.9)
delivery = tank("Delivery", NODE_X[5], 0.35)

# HC-SR04 inside the delivery tank, its face 1.2 cm below the rim, looking down at the water.
face_z = TANK_H - SENSOR_DROP
board = box("Sensor_Level", PCB, (0.45, 0.2, 0.02), (NODE_X[5], 0, face_z + 0.12))
eyes = [cylinder(f"eye{i}", STEEL, 0.07, 0.12, (NODE_X[5] + dx, 0, face_z + 0.06), verts=32)
        for i, dx in enumerate((-0.13, 0.13))]
join(board, *eyes)
board.name = board.data.name = "Sensor_Level"

# Pump: motor body facing the camera (Blender -Y), with a fan (the rotor) on its front.
px = NODE_X[1]
cylinder("Pump_Body", PUMP, 0.42, 0.7, (px, 0.05, PIPE_Z), rot=(math.radians(90), 0, 0))
box("Pump_Feet", STEEL, (0.7, 0.55, 0.08), (px, 0.05, 0.04))

blades = [box(f"blade{i}", STEEL, (0.62, 0.05, 0.1), (px, -0.33, PIPE_Z), rot=(0, math.radians(60 * i), 0))
          for i in range(3)]
hub = cylinder("hub", STEEL, 0.08, 0.08, (px, -0.34, PIPE_Z), rot=(math.radians(90), 0, 0), verts=24)
rotor = join(hub, *blades)
rotor.name = rotor.data.name = "Pump_Rotor"
# No leftover rotation, and the origin on the shaft, so the website can spin it in place.
bpy.ops.object.select_all(action="DESELECT")
rotor.select_set(True)
bpy.context.view_layer.objects.active = rotor
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bpy.context.scene.cursor.location = (px, -0.34, PIPE_Z)
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def flow_sensor(name, x):
    s = cylinder(name, PLASTIC, 0.2, 0.55, (x, 0, PIPE_Z), rot=(0, math.radians(90), 0))
    cap = box(f"{name}_cap", PLASTIC, (0.22, 0.26, 0.16), (x, 0, PIPE_Z + 0.24))
    threads = [cylinder(f"{name}_end{i}", PLASTIC, 0.13, 0.12, (x + dx, 0, PIPE_Z), rot=(0, math.radians(90), 0))
               for i, dx in enumerate((-0.33, 0.33))]
    join(s, cap, *threads)
    s.name = s.data.name = name
    return s


flow_sensor("Sensor_F1", NODE_X[2])
flow_sensor("Sensor_F2", NODE_X[4])

# Ball valve with a lever handle; the handle's origin sits on the stem so it turns about it.
vx = NODE_X[3]
valve = cylinder("Valve_A", BRASS, 0.17, 0.5, (vx, 0, PIPE_Z), rot=(0, math.radians(90), 0))
ball = cylinder("Valve_A_ball", BRASS, 0.24, 0.3, (vx, 0, PIPE_Z), verts=6)
stem = cylinder("Valve_A_stem", BRASS, 0.05, 0.22, (vx, 0, PIPE_Z + 0.25), verts=16)
join(valve, ball, stem)
valve.name = valve.data.name = "Valve_A"
handle = box("Valve_A_Handle", HANDLE, (0.6, 0.1, 0.05), (vx + 0.25, 0, PIPE_Z + 0.37))
bpy.ops.object.select_all(action="DESELECT")
handle.select_set(True)
bpy.context.view_layer.objects.active = handle
bpy.context.scene.cursor.location = (vx, 0, PIPE_Z + 0.37)
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

# Pipes between the parts, left to right. Runs touching a tank stop at its wall.
ends = [x + TANK_R if i == 0 else x - TANK_R if i == len(NODE_X) - 1 else x for i, x in enumerate(NODE_X)]
for i in range(len(NODE_X) - 1):
    a, b = ends[i], ends[i + 1]
    cylinder(f"Pipe_{i}", PVC, PIPE_R, b - a, ((a + b) / 2, 0, PIPE_Z), rot=(0, math.radians(90), 0), verts=32)

bpy.context.scene.cursor.location = (0, 0, 0)

# ---- Save and export -------------------------------------------------------------------------
GLB_OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
bpy.ops.export_scene.gltf(filepath=str(GLB_OUT), export_format="GLB", export_apply=True, export_yup=True)
print(f"Saved {BLEND_OUT}\nExported {GLB_OUT}")
