"""Builds the room: models, lighting bake, glTF export. Run headless with `make room`.

    blender -b -P tools/room/build.py -- --out src/assets/room.glb [--size 2048] [--samples 32]

Everything is built from primitives here, so the room is original (ADR-0002). Lighting is baked
into one texture atlas (ADR-0004); the exported file has one mesh, one material, one JPEG.
"""
import argparse, math, random, sys, time
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--size", type=int, default=2048)
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--jpeg", type=int, default=80)
args = ap.parse_args(argv)
random.seed(8)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
objs = []

def material(name, color, rough=0.7, emit=None, strength=0.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m

M = {
    "wall": material("wall", (0.10, 0.12, 0.13)),
    "floor": material("floor", (0.07, 0.065, 0.06), 0.5),
    "wood": material("wood", (0.30, 0.17, 0.08)),
    "metal": material("metal", (0.12, 0.13, 0.14), 0.4, metal=0.8),
    "case": material("case", (0.55, 0.52, 0.42)),
    "dark": material("dark", (0.02, 0.02, 0.025)),
    "crt": material("crt", (0.45, 0.50, 0.42)),
    "screen": material("screen", (0.02, 0.1, 0.04), emit=(0.2, 1.0, 0.4), strength=2.0),
    "led": material("led", (0, 0, 0), emit=(1.0, 0.45, 0.1), strength=6.0),
    "paper": material("paper", (0.8, 0.78, 0.65)),
    "cable": material("cable", (0.5, 0.08, 0.05), 0.5),
    "cable2": material("cable2", (0.05, 0.12, 0.45), 0.5),
    "city": material("city", (0, 0, 0), emit=(1.0, 0.8, 0.5), strength=8.0),
    "cityb": material("cityb", (0, 0, 0), emit=(0.4, 0.7, 1.0), strength=8.0),
    "glass": material("glass", (0.03, 0.05, 0.07), 0.1),
}

# Positions below are written as (x, z, height) in the site's axes, where -z runs down the tour.
# Blender is z-up and glTF export maps Blender y to -z, so every location is flipped here.
def at(loc): return (loc[0], -loc[1], loc[2])

def box(name, mat, loc, size, rot=0.0):
    rot = -rot
    bpy.ops.mesh.primitive_cube_add(location=at(loc))
    o = bpy.context.object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    o.rotation_euler[2] = rot
    o.data.materials.append(M[mat])
    objs.append(o)
    return o

def cyl(name, mat, loc, r, depth, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(location=at(loc), radius=r, depth=depth, vertices=12, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(M[mat])
    objs.append(o)

# ---- shell: x -6..6, z 9..-29, height 4 ----
X0, X1, Z0, Z1, H = -6, 6, 9, -29, 4
cz, lz = (Z0 + Z1) / 2, Z0 - Z1
box("floor", "floor", (0, cz, -0.05), (12, lz, 0.1))
box("ceiling", "wall", (0, cz, H + 0.05), (12, lz, 0.1))
box("wall_l", "wall", (X0 - 0.05, cz, H / 2), (0.1, lz, H))
box("wall_r", "wall", (X1 + 0.05, cz, H / 2), (0.1, lz, H))
box("wall_front", "wall", (0, Z0 + 0.05, H / 2), (12, 0.1, H))
# back wall with a window opening (x -2.5..2.5, y 1.2..3.3)
box("back_low", "wall", (0, Z1 - 0.05, 0.6), (12, 0.1, 1.2))
box("back_high", "wall", (0, Z1 - 0.05, 3.65), (12, 0.1, 0.7))
box("back_l", "wall", (-4.25, Z1 - 0.05, 2.25), (3.5, 0.1, 2.1))
box("back_r", "wall", (4.25, Z1 - 0.05, 2.25), (3.5, 0.1, 2.1))
# window frame and a few panes of glass; the view is a dark backdrop with city lights
for x in (-2.5, 0, 2.5):
    box("mullion", "dark", (x, Z1 + 0.05, 2.25), (0.08, 0.15, 2.1))
box("sill", "wood", (0, Z1 + 0.1, 1.2), (5.4, 0.3, 0.06))
box("backdrop", "dark", (0, Z1 - 6, 2.25), (40, 0.1, 12))
for i in range(90):
    x, y = random.uniform(-14, 14), random.uniform(0.2, 6)
    s = random.uniform(0.08, 0.22)
    box("city", "city" if random.random() < 0.7 else "cityb", (x, Z1 - 5.9, y), (s, 0.05, s))

# ---- props ----
def crt(x, z, face, y=0.9):
    """CRT monitor on a surface at height y, facing +-x/+z by `face` (radians about z)."""
    c, s = math.cos(face), math.sin(face)
    def p(dx, dz): return (x + dx * c - dz * s, z + dx * s + dz * c)
    # local forward is +z rotated by face
    bx, bz = p(0, -0.08)
    box("crt_body", "crt", (bx, bz, y + 0.3), (0.62, 0.5, 0.52), face)
    sx, sz = p(0, 0.18)
    box("crt_screen", "screen", (sx, sz, y + 0.31), (0.46, 0.02, 0.36), face)
    bx2, bz2 = p(0, -0.4)
    box("crt_back", "crt", (bx2, bz2, y + 0.3), (0.34, 0.3, 0.3), face)

def pc(x, z, y):
    box("pc", "case", (x, z, y + 0.18), (0.22, 0.4, 0.36))
    box("pc_front", "dark", (x, z + 0.201, y + 0.2), (0.16, 0.01, 0.1))
    box("pc_led", "led", (x, z + 0.206, y + 0.08), (0.02, 0.01, 0.02))

def rack(x, z, with_pcs=True):
    for dx in (-0.3, 0.3):
        for dz in (-0.3, 0.3):
            box("rack_post", "metal", (x + dx, z + dz, 1.0), (0.05, 0.05, 2.0))
    for y in (0.05, 0.9, 1.75):
        box("rack_shelf", "metal", (x, z, y), (0.7, 0.7, 0.04))
    if with_pcs:
        pc(x - 0.15, z, 0.07); pc(x + 0.17, z, 0.07)
        pc(x - 0.15, z, 0.92)
        for i in range(3):  # switch with patch cables
            box("switch", "dark", (x, z + 0.3, 1.5 + i * 0.1), (0.6, 0.06, 0.07))
            box("switch_led", "led", (x + 0.2, z + 0.34, 1.5 + i * 0.1), (0.02, 0.01, 0.02))

def bench(x, z, w=2.2, d=0.8):
    box("bench_top", "wood", (x, z, 0.9), (w, d, 0.06))
    for dx in (-w / 2 + 0.06, w / 2 - 0.06):
        for dz in (-d / 2 + 0.06, d / 2 - 0.06):
            box("bench_leg", "metal", (x + dx, z + dz, 0.45), (0.06, 0.06, 0.9))
    for i in range(7):  # notes and cables on the top
        box("note", "paper", (x + random.uniform(-w / 2.6, w / 2.6), z + random.uniform(-d / 3, d / 3), 0.935),
            (0.2, 0.28, 0.005), random.uniform(-0.6, 0.6))
    for i in range(5):
        cyl("cable", "cable" if i % 2 else "cable2",
            (x + random.uniform(-w / 3, w / 3), z + random.uniform(-d / 3, d / 3), 0.95),
            0.012, random.uniform(0.4, 0.9), (math.pi / 2, 0, random.uniform(0, 3.14)))
    box("lab_notebook", "dark", (x + 0.7, z + 0.2, 0.94), (0.22, 0.3, 0.02), 0.3)

# Station positions follow the tour's greybox. Odd stations left, even right, last central.
# S0 entrance: low table in the middle.
box("entrance_table", "wood", (0, 0, 0.35), (1.4, 0.7, 0.06)); box("entrance_base", "metal", (0, 0, 0.17), (0.2, 0.2, 0.34))
bench(-3, -4);   crt(-3.4, -4.1, 0.0, 0.93); rack(-5.2, -4.0)
bench(3.6, -8);  crt(3.3, -8.1, 0.0, 0.93); rack(5.2, -8.0)
rack(-3, -12); rack(-4, -12); bench(-3.5, -13.2, 2.4); crt(-3.6, -13.3, 0.0, 0.93)
bench(3, -16);   crt(3.4, -16.1, 0.0, 0.93); rack(5.2, -16.0)
bench(-3, -20);  crt(-2.6, -20.1, 0.0, 0.93); rack(-5.2, -20.0)
bench(0, -24, 3.0); crt(-0.6, -24.1, 0.0, 0.93); crt(0.7, -24.1, 0.0, 0.93)

# ---- lights: dim cool ambient, amber lamps, window glow (city lights emit too) ----
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.01, 0.014, 0.02, 1)
for z in (0, -8, -16, -24):
    for x, e in ((-3, 120), (3, 120)):
        bpy.ops.object.light_add(type="POINT", location=at((x, z, 3.5)))
        l = bpy.context.object.data
        l.energy, l.color, l.shadow_soft_size = e, (1.0, 0.62, 0.3), 0.15
bpy.ops.object.light_add(type="AREA", location=at((0, Z1 + 0.5, 2.25)), rotation=(-math.pi / 2, 0, 0))
w = bpy.context.object.data
w.energy, w.size, w.size_y, w.color = 150, 5, 2, (0.4, 0.55, 0.9)

# ---- UVs and bake ----
for o in list(bpy.data.objects):
    if o.type == "LIGHT":
        continue
bpy.ops.object.select_all(action="DESELECT")
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
room = bpy.context.object
room.name = "room"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode="OBJECT")

img = bpy.data.images.new("lightmap", args.size, args.size)
for m in room.data.materials:
    n = m.node_tree.nodes.new("ShaderNodeTexImage")
    n.image = img
    m.node_tree.nodes.active = n

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 4
scene.render.bake.margin = 6
scene.render.bake.use_clear = True
t0 = time.time()
bpy.ops.object.bake(type="COMBINED")
bake_s = time.time() - t0

# ---- one unlit-style material with the baked image, then export ----
final = bpy.data.materials.new("baked")
final.use_nodes = True
nt = final.node_tree
b = nt.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0, 0, 0, 1)
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
b.inputs["Emission Strength"].default_value = 1.0
nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
room.data.materials.clear()
room.data.materials.append(final)
for m in list(bpy.data.materials):
    if m is not final and m.users == 0:
        bpy.data.materials.remove(m)

bpy.ops.object.select_all(action="DESELECT")
room.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=args.out, export_format="GLB", use_selection=True,
    export_image_format="JPEG", export_jpeg_quality=args.jpeg,
    export_cameras=False, export_lights=False, export_apply=True,
)
print(f"ROOM_BAKE size={args.size} samples={args.samples} bake_seconds={bake_s:.1f} out={args.out}")
