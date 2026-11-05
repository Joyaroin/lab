"""Builds the room: models, lighting bake, glTF export. Run headless with `make room`.

    blender -b -P tools/room/build.py -- --out src/assets/room.glb [--size 4096] [--samples 256]
    blender -b -P tools/room/build.py -- --preview /tmp/shots [--samples 32]   # camera renders, no bake

One small late-night home lab, modelled from primitives here so it is original (ADR-0002). The
only light comes from things in the room: CRTs, the nixie meter, machine LEDs, a bench lamp and
the city through the window. Lighting is baked into a few texture atlases (ADR-0004), one per
group of surfaces, so close-up props get more texels than the walls. Where each CRT sits, and
where the camera stops to face it, comes from src/room-layout.json, shared with the site.
"""
import argparse, json, math, os, random, sys, time
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out")
ap.add_argument("--preview", help="render each camera stop into this directory instead of baking")
ap.add_argument("--size", type=int, default=4096, help="size of each atlas: surface colour and glow")
ap.add_argument("--light-size", type=int, default=2048, help="size the lighting is baked at (the walls get half)")
ap.add_argument("--samples", type=int, default=192, help="samples for the lighting bake")
ap.add_argument("--blur", type=float, default=1.2, help="smoothing of the lighting bake, in its pixels")
ap.add_argument("--jpeg", type=int, default=88)
args = ap.parse_args(argv)
if not args.out and not args.preview:
    ap.error("give --out or --preview")
random.seed(23)

HERE = os.path.dirname(os.path.abspath(__file__))
LAYOUT = json.load(open(os.path.join(HERE, "..", "..", "src", "room-layout.json")))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
groups = {"shell": [], "furniture": [], "props": []}

# ---------------------------------------------------------------- materials
# Lighting is baked as diffuse only (no reflections, which depend on where the viewer is), so
# metals are modelled as dark, slightly varied diffuse surfaces. Procedural textures give every
# large surface visible variation, which the bake captures at full atlas resolution.

def _nodes(m):
    nt = m.node_tree
    return nt, nt.nodes["Principled BSDF"]

def _world_pos(nt):
    g = nt.nodes.new("ShaderNodeNewGeometry")
    return g.outputs["Position"]

def material(name, color, rough=0.7, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt, b = _nodes(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m

def varied(name, c1, c2, scale=6.0, detail=8.0, bump=0.15, bump_scale=None, stripes=None):
    """A surface that drifts between two colours with noise, plus a little bump.
    `stripes` = (scale, axis) adds wood-like grain bands along an axis."""
    m = material(name, c1)
    nt, b = _nodes(m)
    pos = _world_pos(nt)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    nt.links.new(pos, noise.inputs["Vector"])
    fac = noise.outputs["Fac"]
    if stripes:
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.bands_direction = stripes[1]
        wave.inputs["Scale"].default_value = stripes[0]
        wave.inputs["Distortion"].default_value = 6.0
        wave.inputs["Detail"].default_value = 4.0
        nt.links.new(pos, wave.inputs["Vector"])
        mix = nt.nodes.new("ShaderNodeMath"); mix.operation = "MULTIPLY"
        nt.links.new(fac, mix.inputs[0]); nt.links.new(wave.outputs["Fac"], mix.inputs[1])
        add = nt.nodes.new("ShaderNodeMath"); add.operation = "ADD"
        nt.links.new(mix.outputs[0], add.inputs[0]); add.inputs[1].default_value = 0.2
        fac = add.outputs[0]
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*c1, 1)
    ramp.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(fac, ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    if bump:
        bn = nt.nodes.new("ShaderNodeTexNoise")
        bn.inputs["Scale"].default_value = bump_scale or scale * 12
        bn.inputs["Detail"].default_value = 6
        nt.links.new(pos, bn.inputs["Vector"])
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.002
        nt.links.new(bn.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m

def planks(name, c1, c2):
    """Floorboards: strips 14 cm wide with dark seams, grain along each board."""
    m = varied(name, c1, c2, scale=3.0, stripes=(1.6, "Y"), bump=0.1)
    nt, b = _nodes(m)
    pos = _world_pos(nt)
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.37
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Mortar Size"].default_value = 0.004
    brick.inputs["Brick Width"].default_value = 1.4
    brick.inputs["Row Height"].default_value = 0.14
    brick.inputs["Color1"].default_value = (1, 1, 1, 1)
    brick.inputs["Color2"].default_value = (0.82, 0.82, 0.82, 1)
    brick.inputs["Mortar"].default_value = (0.08, 0.08, 0.08, 1)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(pos, sep.inputs[0])
    nt.links.new(sep.outputs["Y"], comb.inputs["X"]); nt.links.new(sep.outputs["X"], comb.inputs["Y"])
    nt.links.new(comb.outputs[0], brick.inputs["Vector"])
    ramp_out = b.inputs["Base Color"].links[0].from_socket
    mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(ramp_out, mul.inputs["A"]); nt.links.new(brick.outputs["Color"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], b.inputs["Base Color"])
    return m

def ruled(name, paper, ink):
    """Paper with faint ruled lines and a scrawl of noise, for notes and pinned sheets."""
    m = material(name, paper)
    nt, b = _nodes(m)
    pos = _world_pos(nt)
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.bands_direction = "Z"; wave.wave_profile = "SAW"
    wave.inputs["Scale"].default_value = 60
    nt.links.new(pos, wave.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 140
    nt.links.new(pos, noise.inputs["Vector"])
    lines = nt.nodes.new("ShaderNodeMath"); lines.operation = "GREATER_THAN"
    nt.links.new(wave.outputs["Fac"], lines.inputs[0]); lines.inputs[1].default_value = 0.93
    scrawl = nt.nodes.new("ShaderNodeMath"); scrawl.operation = "GREATER_THAN"
    nt.links.new(noise.outputs["Fac"], scrawl.inputs[0]); scrawl.inputs[1].default_value = 0.66
    both = nt.nodes.new("ShaderNodeMath"); both.operation = "MAXIMUM"
    nt.links.new(lines.outputs[0], both.inputs[0]); nt.links.new(scrawl.outputs[0], both.inputs[1])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (*paper, 1); mix.inputs["B"].default_value = (*ink, 1)
    nt.links.new(both.outputs[0], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    return m

M = {
    "wall": varied("wall", (0.11, 0.115, 0.12), (0.06, 0.065, 0.07), scale=4, bump=0.25, bump_scale=90),
    "ceiling": varied("ceiling", (0.10, 0.10, 0.10), (0.07, 0.07, 0.075), scale=3, bump=0.2),
    "floor": planks("floor", (0.20, 0.12, 0.07), (0.11, 0.065, 0.04)),
    "rug": varied("rug", (0.16, 0.05, 0.04), (0.07, 0.03, 0.03), scale=30, bump=0.3, bump_scale=400),
    "wood": varied("wood", (0.36, 0.22, 0.12), (0.20, 0.11, 0.05), scale=4, stripes=(3.0, "X")),
    "plywood": varied("plywood", (0.45, 0.34, 0.20), (0.30, 0.21, 0.12), scale=5, stripes=(5.0, "Z")),
    "steel": varied("steel", (0.16, 0.17, 0.18), (0.09, 0.10, 0.11), scale=20, bump=0.05),
    "black": varied("black", (0.03, 0.03, 0.035), (0.015, 0.015, 0.02), scale=30, bump=0.05),
    "beige": varied("beige", (0.52, 0.48, 0.38), (0.42, 0.38, 0.29), scale=12, bump=0.08),
    "grey": varied("grey", (0.30, 0.30, 0.29), (0.22, 0.22, 0.22), scale=15, bump=0.05),
    "pegboard": varied("pegboard", (0.32, 0.24, 0.15), (0.24, 0.17, 0.10), scale=8, bump=0.0),
    "cork": varied("cork", (0.45, 0.30, 0.16), (0.30, 0.18, 0.09), scale=60, bump=0.4, bump_scale=300),
    "cardboard": varied("cardboard", (0.42, 0.29, 0.16), (0.33, 0.22, 0.12), scale=10, bump=0.1),
    "paper": ruled("paper", (0.78, 0.76, 0.68), (0.18, 0.2, 0.3)),
    "sticky": ruled("sticky", (0.85, 0.75, 0.25), (0.25, 0.2, 0.1)),
    "pinkslip": ruled("pinkslip", (0.82, 0.48, 0.5), (0.25, 0.1, 0.15)),
    "mug": material("mug", (0.55, 0.08, 0.06)),
    "coffee": material("coffee", (0.05, 0.025, 0.01)),
    "fabric": varied("fabric", (0.06, 0.06, 0.07), (0.03, 0.03, 0.035), scale=80, bump=0.3, bump_scale=500),
    "red": material("red", (0.45, 0.05, 0.04)),
    "blue": material("blue", (0.04, 0.10, 0.40)),
    "yellow": material("yellow", (0.60, 0.45, 0.05)),
    "green": material("green", (0.05, 0.30, 0.08)),
    "orange": material("orange", (0.70, 0.25, 0.04)),
    "pcb": varied("pcb", (0.04, 0.22, 0.10), (0.02, 0.12, 0.05), scale=50, bump=0.2),
    "copper": material("copper", (0.45, 0.22, 0.10)),
    "screen": material("screen", (0.0, 0.02, 0.01), emit=(0.2, 1.0, 0.4), strength=0.55),
    "scope": material("scope", (0.0, 0.02, 0.02), emit=(0.2, 0.9, 1.0), strength=1.2),
    "nixie": material("nixie", (0.0, 0.0, 0.0), emit=(1.0, 0.45, 0.1), strength=6.0),
    "tube": material("tube", (0.012, 0.01, 0.009), emit=(1.0, 0.38, 0.06), strength=0.015),
    "led_g": material("led_g", (0, 0, 0), emit=(0.2, 1.0, 0.3), strength=12.0),
    "led_a": material("led_a", (0, 0, 0), emit=(1.0, 0.5, 0.1), strength=12.0),
    "led_b": material("led_b", (0, 0, 0), emit=(0.3, 0.55, 1.0), strength=12.0),
    "led_r": material("led_r", (0, 0, 0), emit=(1.0, 0.1, 0.05), strength=10.0),
    "lampbulb_dim": material("lampbulb_dim", (0, 0, 0), emit=(1.0, 0.65, 0.3), strength=6.0),
    "lampbulb": material("lampbulb", (0, 0, 0), emit=(1.0, 0.72, 0.42), strength=30.0),
    "sky": material("sky", (0, 0, 0), emit=(0.10, 0.16, 0.30), strength=0.6),
    "building": varied("building", (0.012, 0.014, 0.02), (0.006, 0.007, 0.01), scale=3, bump=0.0),
    "citywin": material("citywin", (0, 0, 0), emit=(1.0, 0.78, 0.5), strength=5.0),
    "citywin_b": material("citywin_b", (0, 0, 0), emit=(0.5, 0.75, 1.0), strength=5.0),
}

# ---------------------------------------------------------------- shapes
# Positions are written in site axes (x across, y up, +z toward the door). Blender is z-up and
# glTF export maps Blender -y to site +z, so site (x, y, z) is Blender (x, -z, y).
def B(p): return (p[0], -p[2], p[1])

def frame(origin, yaw):
    """Map a point given in an object's own frame (right, up, forward) to site axes."""
    c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    def f(dx, dy, dz):
        return (origin[0] + dx * c + dz * s, origin[1] + dy, origin[2] - dx * s + dz * c)
    return f

def _add(o, mat, group, bevel):
    o.data.materials.append(M[mat])
    o["bevel"] = bevel
    groups[group].append(o)
    return o

def box(mat, center, size, yaw=0.0, group="props", bevel=0.004, tilt=(0.0, 0.0)):
    """A box: size is (width, height, depth) in its own frame, turned by yaw degrees."""
    bpy.ops.mesh.primitive_cube_add(location=B(center))
    o = bpy.context.object
    o.scale = (size[0] / 2, size[2] / 2, size[1] / 2)
    o.rotation_euler = (math.radians(tilt[0]), math.radians(tilt[1]), math.radians(yaw))
    return _add(o, mat, group, bevel)

def cyl(mat, center, r, length, axis="y", group="props", verts=20, bevel=0.0, yaw=0.0, r2=None):
    """A cylinder (or cone, with r2) along a site axis."""
    rot = {"y": (0, 0, 0), "x": (0, math.pi / 2, 0), "z": (math.pi / 2, 0, 0)}[axis]
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(location=B(center), radius=r, depth=length, vertices=verts, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(location=B(center), radius1=r, radius2=r2, depth=length, vertices=verts, rotation=rot)
    o = bpy.context.object
    o.rotation_euler[2] += math.radians(yaw)
    return _add(o, mat, group, bevel)

def cable(points, r=0.006, mat="black", group="props", sag=0.0):
    """A cable through site points, optionally sagging between them."""
    pts = []
    for a, b in zip(points, points[1:]):
        for k in range(8):
            t = k / 8
            p = [a[i] + (b[i] - a[i]) * t for i in range(3)]
            p[1] -= sag * 4 * t * (1 - t)
            pts.append(p)
    pts.append(points[-1])
    cu = bpy.data.curves.new("cable", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*B(p), 1)
    o = bpy.data.objects.new("cable", cu)
    scene.collection.objects.link(o)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    return _add(o, mat, group, 0.0)

# ---------------------------------------------------------------- the room shell
# A bedroom-sized room, 3.8 m square and 2.5 m high. Door in the front wall on the left,
# window in the back wall, left of centre.
X0, X1, Z0, Z1, H = -1.9, 1.9, 1.9, -1.9, 2.5
W, D = X1 - X0, Z0 - Z1
T = 0.1
DOOR = (-1.5, -0.7, 2.05)          # x from, x to, height
WIN = (-1.05, 0.2, 1.0, 2.1)      # x from, x to, y from, y to

def shell(mat, c, s): return box(mat, c, s, group="shell", bevel=0.0)
shell("floor", (0, -T / 2, 0), (W + 2 * T, T, D + 2 * T))
shell("ceiling", (0, H + T / 2, 0), (W + 2 * T, T, D + 2 * T))
shell("wall", (X0 - T / 2, H / 2, 0), (T, H, D))
shell("wall", (X1 + T / 2, H / 2, 0), (T, H, D))
# front wall around the door
shell("wall", ((X0 + DOOR[0]) / 2, H / 2, Z0 + T / 2), (DOOR[0] - X0, H, T))
shell("wall", ((DOOR[1] + X1) / 2, H / 2, Z0 + T / 2), (X1 - DOOR[1], H, T))
shell("wall", ((DOOR[0] + DOOR[1]) / 2, (DOOR[2] + H) / 2, Z0 + T / 2), (DOOR[1] - DOOR[0], H - DOOR[2], T))
# back wall around the window
shell("wall", ((X0 + WIN[0]) / 2, H / 2, Z1 - T / 2), (WIN[0] - X0, H, T))
shell("wall", ((WIN[1] + X1) / 2, H / 2, Z1 - T / 2), (X1 - WIN[1], H, T))
shell("wall", ((WIN[0] + WIN[1]) / 2, WIN[2] / 2, Z1 - T / 2), (WIN[1] - WIN[0], WIN[2], T))
shell("wall", ((WIN[0] + WIN[1]) / 2, (WIN[3] + H) / 2, Z1 - T / 2), (WIN[1] - WIN[0], H - WIN[3], T))
# skirting boards
for c, s in (((X0 + 0.01, 0.05, 0), (0.02, 0.1, D)), ((X1 - 0.01, 0.05, 0), (0.02, 0.1, D)),
             ((0, 0.05, Z1 + 0.01), (W, 0.1, 0.02))):
    box("wood", c, s, group="furniture", bevel=0.002)
# door frame and the dark hallway beyond it
for x in (DOOR[0] - 0.03, DOOR[1] + 0.03):
    box("wood", (x, DOOR[2] / 2, Z0 + 0.02), (0.06, DOOR[2], 0.16), group="furniture")
box("wood", ((DOOR[0] + DOOR[1]) / 2, DOOR[2] + 0.03, Z0 + 0.02), (DOOR[1] - DOOR[0] + 0.12, 0.06, 0.16), group="furniture")
box("black", ((DOOR[0] + DOOR[1]) / 2, 1.2, Z0 + 1.6), (3, 2.6, 0.1), group="shell", bevel=0)
box("black", ((DOOR[0] + DOOR[1]) / 2, -0.05, Z0 + 0.8), (1.2, 0.1, 1.6), group="shell", bevel=0)
# window: frame, mullion, sill, and the city outside
wx, wy = (WIN[0] + WIN[1]) / 2, (WIN[2] + WIN[3]) / 2
ww, wh = WIN[1] - WIN[0], WIN[3] - WIN[2]
for x in (WIN[0] + 0.025, WIN[1] - 0.025, wx):
    box("grey", (x, wy, Z1 - 0.05), (0.05, wh, 0.06), group="furniture")
for y in (WIN[2] + 0.025, WIN[3] - 0.025, wy + 0.1):
    box("grey", (wx, y, Z1 - 0.05), (ww, 0.04, 0.06), group="furniture")
box("wood", (wx, WIN[2] - 0.02, Z1 + 0.06), (ww + 0.12, 0.04, 0.16), group="furniture")
box("sky", (wx, 1.5, Z1 - 9), (16, 9, 0.1), group="shell", bevel=0)
for i in range(16):  # building silhouettes, lit windows on their faces
    bx = -6 + i * 0.8 + random.uniform(-0.2, 0.2)
    bz = Z1 - random.uniform(3.5, 8)
    bh = random.uniform(1.5, 6.5)
    bw = random.uniform(0.5, 1.0)
    box("building", (bx, bh / 2 - 2.5, bz), (bw, bh, 0.6), group="shell", bevel=0)
    for k in range(int(bh * 5)):
        if random.random() < 0.35:
            box("citywin" if random.random() < 0.75 else "citywin_b",
                (bx + random.uniform(-bw / 2.6, bw / 2.6), random.uniform(-2.3, bh - 2.6), bz + 0.31),
                (0.06, 0.08, 0.01), group="shell", bevel=0)

# ---------------------------------------------------------------- furniture
DESK_Y = 0.76  # desk top surface

def desk(x0, x1, z0, z1, y=DESK_Y, legs=True):
    box("wood", ((x0 + x1) / 2, y - 0.02, (z0 + z1) / 2), (x1 - x0, 0.04, z0 - z1), group="furniture", bevel=0.006)
    if legs:
        for x in (x0 + 0.04, x1 - 0.04):
            for z in (z0 - 0.04, z1 + 0.04):
                box("steel", (x, (y - 0.04) / 2, z), (0.04, y - 0.04, 0.04), group="furniture")

# L-shaped desk: along the back wall and down the left wall
desk(X0, 0.62, -1.15, Z1)
desk(X0, -1.15, 0.32, -1.15)
box("wood", (-1.6, 0.14, -0.9), (0.42, 0.04, 0.5), group="furniture")       # low shelf under the left desk
box("wood", (0.25, 0.12, -1.6), (0.6, 0.04, 0.5), group="furniture")        # and under the back desk

# pinboard above the left desk, with notes and printouts
box("cork", (X0 + 0.015, 1.5, -0.5), (0.03, 0.7, 1.1), group="furniture")
for i in range(14):
    z = -0.5 + random.uniform(-0.45, 0.45); y = 1.5 + random.uniform(-0.25, 0.25)
    mat = random.choice(["paper", "paper", "sticky", "pinkslip"])
    s = (0.003, 0.21, 0.15) if mat == "paper" else (0.003, 0.08, 0.08)
    box(mat, (X0 + 0.034 + i * 0.0005, y, z), s, tilt=(random.uniform(-8, 8), 0), bevel=0)
    box(random.choice(["red", "blue", "yellow"]), (X0 + 0.04 + i * 0.0005, y + s[1] / 2 - 0.015, z), (0.008, 0.012, 0.012), bevel=0)

# shelf of parts high on the left wall, over the back desk
box("plywood", (X0 + 0.13, 1.72, -1.45), (0.26, 0.025, 0.85), group="furniture")
for z in (-1.8, -1.1):
    box("steel", (X0 + 0.1, 1.66, z), (0.2, 0.1, 0.02), group="furniture")

# right-wall workbench: standing height, pegboard and a shelf of bins above
BENCH_Y = 0.93
desk(1.2, X1, 0.62, -0.92, y=BENCH_Y)
box("plywood", (1.55, 0.25, -0.15), (0.65, 0.025, 1.5), group="furniture")
box("pegboard", (X1 - 0.012, 1.35, -0.15), (0.024, 0.75, 1.5), group="furniture")
box("plywood", (X1 - 0.14, 1.82, -0.15), (0.28, 0.025, 1.5), group="furniture")

# front-right corner: a tall open shelf unit full of parts
SH = (1.32, X1, 1.85, 0.95)
for x in (SH[0] + 0.015, SH[1] - 0.015):
    for z in (SH[2] - 0.015, SH[3] + 0.015):
        box("steel", (x, 1.05, z), (0.03, 2.1, 0.03), group="furniture")
for y in (0.08, 0.81, 1.36, 1.8, 2.1):
    box("plywood", ((SH[0] + SH[1]) / 2, y - 0.012, (SH[2] + SH[3]) / 2), (SH[1] - SH[0], 0.025, SH[2] - SH[3]), group="furniture")

# the home lab rack: a small open 10-inch rack on castors, back right, beside the window wall
RK = (1.45, -1.62)   # centre x, z
RW, RD, RH = 0.5, 0.44, 0.98
for dx in (-RW / 2 + 0.015, RW / 2 - 0.015):
    for dz in (-RD / 2 + 0.015, RD / 2 - 0.015):
        box("black", (RK[0] + dx, RH / 2 + 0.04, RK[1] + dz), (0.03, RH - 0.04, 0.03), group="furniture", bevel=0.003)
        cyl("black", (RK[0] + dx, 0.02, RK[1] + dz), 0.02, 0.04, group="furniture")
for y in (0.06, RH):
    box("black", (RK[0], y, RK[1]), (RW, 0.02, RD), group="furniture")

# office chair, turned toward the left desk
CH = (-0.1, 0.35)
cyl("black", (CH[0], 0.06, CH[1]), 0.3, 0.03, group="furniture", verts=5)
cyl("steel", (CH[0], 0.27, CH[1]), 0.025, 0.4, group="furniture")
box("fabric", (CH[0], 0.5, CH[1]), (0.48, 0.08, 0.46), yaw=90, group="furniture", bevel=0.03)
cf = frame((CH[0], 0.0, CH[1]), 90)
box("fabric", cf(0, 0.86, 0.24), (0.44, 0.6, 0.07), yaw=90, tilt=(-8, 0), group="furniture", bevel=0.03)
box("black", cf(0, 0.6, 0.2), (0.06, 0.2, 0.04), yaw=90, group="furniture")
for side in (-0.26, 0.26):
    box("black", cf(side, 0.68, -0.02), (0.05, 0.03, 0.26), yaw=90, group="furniture")
# jacket thrown over the back
box("blue", cf(0.05, 1.12, 0.28), (0.4, 0.08, 0.16), yaw=90, tilt=(10, 0), group="furniture", bevel=0.03)

# rug under the chair
box("rug", (-0.35, 0.005, 0.05), (1.3, 0.01, 1.6), yaw=8, group="furniture", bevel=0)

# ---------------------------------------------------------------- props
def crt(spec):
    """A beige CRT monitor whose glass centre is at `screen`, facing `yaw`."""
    f = frame(spec["screen"], spec["yaw"])
    y = spec["yaw"]
    box("beige", f(0, 0, -0.04), (0.58, 0.48, 0.08), yaw=y, bevel=0.015)          # bezel
    box("screen", f(0, 0, 0.0), (0.46, 0.36, 0.01), yaw=y, bevel=0.01)          # glass
    box("beige", f(0, -0.01, -0.24), (0.5, 0.42, 0.34), yaw=y, bevel=0.03)        # body
    box("beige", f(0, -0.03, -0.43), (0.3, 0.26, 0.1), yaw=y, bevel=0.02)         # neck
    box("beige", f(0, -0.255, -0.22), (0.3, 0.03, 0.26), yaw=y, bevel=0.01)       # stand
    box("black", f(0.2, -0.205, 0.0), (0.04, 0.015, 0.012), yaw=y, bevel=0.002)   # power button
    box("led_g", f(0.24, -0.205, 0.004), (0.01, 0.01, 0.006), yaw=y, bevel=0)
    for i in range(4):  # vents on top
        box("grey", f(0, 0.2, -0.12 - i * 0.05), (0.36, 0.006, 0.012), yaw=y, bevel=0)
    # sticky note on the bezel corner
    box(random.choice(["sticky", "pinkslip"]), f(-0.24, 0.15, 0.003), (0.07, 0.07, 0.002), yaw=y, tilt=(0, 0), bevel=0)
    # keyboard in front, a cable off the back
    if spec.get("keyboard", True) is False:
        cable([f(0, -0.2, -0.48), f(0.1, -0.27, -0.55)], r=0.006)
        return f
    kx = f(0.02, -0.255 + 0.012, 0.25)
    box("beige", kx, (0.44, 0.025, 0.15), yaw=y + random.uniform(-6, 6), bevel=0.006)
    kf = frame(kx, y)
    for row in range(4):
        box("grey", kf(0, 0.016, -0.05 + row * 0.033), (0.4, 0.01, 0.026), yaw=y, bevel=0.002)
    back = f(0, -0.2, -0.48)
    cable([back, f(0.1, -0.27, -0.55)], r=0.006)
    return f

for spec in LAYOUT["crts"]:
    crt(spec)

def mug(p, mat="mug"):
    cyl(mat, (p[0], p[1] + 0.05, p[2]), 0.04, 0.1, verts=24)
    cyl("coffee", (p[0], p[1] + 0.096, p[2]), 0.036, 0.004, verts=24)
    box(mat, (p[0] + 0.05, p[1] + 0.05, p[2]), (0.02, 0.06, 0.012), bevel=0.004)

def book(p, size, yaw=0.0, mat=None):
    box(mat or random.choice(["red", "blue", "green", "black", "beige", "orange"]), p, size, yaw=yaw, bevel=0.003)

def stack(p, n, yaw=0.0):
    y = p[1]
    for i in range(n):
        h = random.uniform(0.025, 0.05)
        book((p[0] + random.uniform(-0.01, 0.01), y + h / 2, p[2]), (0.24, h, 0.17), yaw=yaw + random.uniform(-10, 10))
        y += h

# work desk (left): mug, notes, a stack of manuals, headphones
mug((-1.6, DESK_Y, 0.1))
for i in range(5):
    box("paper", (-1.45 + random.uniform(-0.1, 0.1), DESK_Y + 0.002 + i * 0.001, 0.05 + random.uniform(-0.12, 0.12)),
        (0.21, 0.002, 0.3), yaw=random.uniform(-25, 25), bevel=0)
stack((-1.7, DESK_Y, -0.95), 5, yaw=90)
cyl("black", (-1.25, DESK_Y + 0.02, 0.2), 0.08, 0.04, verts=24)                 # headphones, lying flat
box("black", (-1.32, DESK_Y + 0.004, -0.75), (0.12, 0.008, 0.2), bevel=0.003)  # mouse mat
box("grey", (-1.32, DESK_Y + 0.018, -0.75), (0.06, 0.03, 0.1), bevel=0.012)    # mouse

# the nixie meter: our own design, a walnut case with seven tubes, at the near end of the left desk
NX = (-1.55, DESK_Y, 0.26)
box("wood", (NX[0], NX[1] + 0.04, NX[2]), (0.44, 0.08, 0.13), yaw=70, bevel=0.01)
nf = frame((NX[0], NX[1], NX[2]), 70)
SEGMENTS = {"0": "abcdef", "9": "abcdfg"}  # seven-segment digits: a top, then clockwise, g middle
SEG = {"a": (0, 0.025, 1), "b": (0.011, 0.0125, 0), "c": (0.011, -0.0125, 0), "d": (0, -0.025, 1),
       "e": (-0.011, -0.0125, 0), "f": (-0.011, 0.0125, 0), "g": (0, 0, 1)}
for i, ch in enumerate("0000009"):
    tx = -0.18 + i * 0.06
    cyl("tube", nf(tx, 0.135, 0.0), 0.022, 0.11, verts=20)
    cyl("black", nf(tx, 0.08 + 0.006, 0.0), 0.025, 0.012, verts=20)
    for seg in SEGMENTS[ch]:
        dx, dy, horiz = SEG[seg]
        box("nixie", nf(tx + dx, 0.135 + dy, 0.0225), (0.018, 0.003, 0.002) if horiz else (0.003, 0.022, 0.002), yaw=70, bevel=0)
box("nixie", nf(-0.15, 0.108, 0.0225), (0.004, 0.004, 0.002), yaw=70, bevel=0)  # decimal point
box("black", nf(0, 0.03, 0.066), (0.3, 0.02, 0.004), yaw=70, bevel=0)  # nameplate

# corner (MediaSafe): a laptop closed under papers, a desk fan, a stack of drives
box("grey", (-1.62, DESK_Y + 0.012, -0.8), (0.32, 0.024, 0.23), yaw=80, bevel=0.006)
for i in range(4):
    box("black", (-0.85, DESK_Y + 0.013 + i * 0.026, -1.75), (0.1, 0.025, 0.15), yaw=8, bevel=0.003)
box("led_b", (-0.80, DESK_Y + 0.02, -1.676), (0.006, 0.006, 0.004), yaw=8, bevel=0)
stack((-1.75, DESK_Y, -1.75), 3)
cyl("grey", (-1.0, DESK_Y + 0.1, -1.72), 0.012, 0.2)
cyl("black", (-1.0, DESK_Y + 0.25, -1.71), 0.09, 0.04, axis="z", verts=24)

# back desk, contact corner: a tangle of patch cables, a soldered board, a mug, a rubber duck
mug((0.45, DESK_Y, -1.2), mat="beige")
box("pcb", (-0.35, DESK_Y + 0.004, -1.35), (0.16, 0.006, 0.1), yaw=20, bevel=0)
for i in range(8):
    box(random.choice(["black", "copper", "grey"]), (-0.35 + random.uniform(-0.06, 0.06), DESK_Y + 0.014, -1.35 + random.uniform(-0.04, 0.04)),
        (0.012, 0.012, 0.02), yaw=20, bevel=0)
box("yellow", (-0.15, DESK_Y + 0.03, -1.3), (0.06, 0.05, 0.08), yaw=-30, bevel=0.02)
box("yellow", (-0.15, DESK_Y + 0.07, -1.32), (0.04, 0.04, 0.04), yaw=-30, bevel=0.015)
for i in range(4):
    a = (-0.7 + i * 0.08, DESK_Y + 0.006, -1.75)
    cable([a, (a[0] + 0.1, DESK_Y + 0.006, -1.45), (a[0] - 0.05, DESK_Y + 0.006, -1.25)],
          r=0.004, mat=["blue", "yellow", "red", "green"][i])
# window sill clutter
box("green", (-0.85, WIN[2] + 0.06, Z1 + 0.05), (0.08, 0.1, 0.08), bevel=0.01)  # a pot
for i in range(5):
    box("green", (-0.85 + random.uniform(-0.03, 0.03), WIN[2] + 0.14 + i * 0.02, Z1 + 0.05 + random.uniform(-0.03, 0.03)),
        (0.08, 0.01, 0.03), yaw=random.uniform(0, 180), tilt=(random.uniform(-30, 30), 0), bevel=0)

# cardboard boxes under the back desk, a power strip on the floor
box("cardboard", (-1.5, 0.15, -1.6), (0.4, 0.3, 0.4), yaw=10, bevel=0.005)
box("cardboard", (-1.5, 0.39, -1.6), (0.3, 0.18, 0.3), yaw=-5, bevel=0.005)
box("beige", (-0.1, 0.02, -1.75), (0.3, 0.04, 0.06), bevel=0.006)
for i in range(4):
    box("led_r" if i == 0 else "black", (-0.2 + i * 0.07, 0.042, -1.75), (0.02, 0.004, 0.02), bevel=0)

# the home lab itself: two small PCs, a switch and a patch panel in the rack, UPS underneath
rf = frame((RK[0], 0.0, RK[1]), 0)
FZ = RD / 2  # front of the rack
def unit(y, h, mat="black"):
    box(mat, rf(0, y, 0), (RW - 0.06, h, RD - 0.06), bevel=0.003)
    box("steel", rf(0, y, FZ - 0.02), (RW - 0.02, h, 0.01), bevel=0.002)
# patch panel with patch cables arcing down to the switch
unit(0.9, 0.044)
for i in range(12):
    box("black" if i % 3 else "grey", rf(-0.17 + i * 0.03, 0.9, FZ - 0.014), (0.016, 0.014, 0.004), bevel=0)
unit(0.83, 0.044)
for i in range(8):
    box("grey", rf(-0.15 + i * 0.03, 0.83, FZ - 0.014), (0.016, 0.014, 0.004), bevel=0)
    box("led_g" if i % 3 else "led_a", rf(-0.15 + i * 0.03, 0.845, FZ - 0.013), (0.006, 0.004, 0.004), bevel=0)
for i, col in enumerate(["blue", "yellow", "blue", "red", "green", "blue"]):
    a = rf(-0.17 + i * 0.06, 0.9, FZ - 0.01)
    b = rf(-0.15 + i * 0.03, 0.83, FZ - 0.01)
    cable([a, rf(a[0] - RK[0], 0.87, FZ + 0.06), b], r=0.003, mat=col, sag=0.0)
# shelf, then the two small PCs, one above the other, each with a power LED and a paper label
box("black", rf(0, 0.74, 0), (RW - 0.04, 0.012, RD - 0.04), bevel=0.002)
box("black", rf(0, 0.54, 0), (RW - 0.04, 0.012, RD - 0.04), bevel=0.002)
for y in (0.765, 0.565):
    box("beige", rf(-0.04, y, 0.1), (0.19, 0.036, 0.19), bevel=0.004)
    box("black", rf(-0.04, y, 0.196), (0.17, 0.026, 0.004), bevel=0)
    box("led_b", rf(0.03, y + 0.008, 0.199), (0.006, 0.006, 0.004), bevel=0)
    box("led_a", rf(0.045, y + 0.008, 0.199), (0.004, 0.004, 0.004), bevel=0)
    box("paper", rf(-0.09, y + 0.006, 0.199), (0.05, 0.012, 0.002), bevel=0)
    box("black", rf(0.16, y - 0.0, 0.03), (0.07, 0.025, 0.1), bevel=0.003)  # power brick
    cable([rf(-0.04, y, -0.08), rf(0.0, y - 0.02, -0.2), rf(0.1, 0.3, -0.21)], r=0.004)
# a USB stick hanging out, a strip of tape with a label on the frame
box("red", rf(0.05, 0.565, 0.21), (0.015, 0.008, 0.03), bevel=0.002)
box("paper", rf(-RW / 2 + 0.015, 0.96, FZ + 0.0), (0.03, 0.02, 0.003), bevel=0)
# UPS on the bottom shelf
box("black", rf(0, 0.2, -0.02), (0.36, 0.26, 0.36), bevel=0.01)
box("led_g", rf(0.1, 0.28, 0.161), (0.01, 0.01, 0.004), bevel=0)
box("grey", rf(-0.05, 0.26, 0.161), (0.12, 0.05, 0.004), bevel=0)
# cable bundle down the rack's back to the floor and across to the desk
cable([rf(0.1, 0.95, -0.2), rf(0.12, 0.3, -0.24), rf(0.0, 0.01, -0.3), (0.6, 0.01, -1.5), (0.3, 0.01, -1.6)], r=0.009)
cable([rf(0.12, 0.95, -0.2), rf(0.14, 0.3, -0.25), rf(0.02, 0.012, -0.32), (0.6, 0.012, -1.45), (-0.1, 0.012, -1.7)], r=0.006, mat="blue")
cable([(-0.05, 0.02, -1.74), (-0.6, 0.01, -1.3), (-1.2, 0.01, -0.6), (-1.6, DESK_Y - 0.05, -0.4)], r=0.006, mat="black", sag=-0.02)

# workbench (Order Tracker): oscilloscope, soldering station, multimeter, tools, a lamp
osc = frame((1.62, BENCH_Y, 0.3), -90)
box("grey", osc(0, 0.12, 0), (0.34, 0.24, 0.3), yaw=-90, bevel=0.01)
box("scope", osc(-0.05, 0.13, 0.151), (0.15, 0.11, 0.004), yaw=-90, bevel=0)
for i in range(6):
    cyl("black", osc(0.08 + (i % 2) * 0.04, 0.07 + (i // 2) * 0.05, 0.16), 0.012, 0.02, axis="z", verts=12, yaw=-90)
box("led_g", osc(0.12, 0.21, 0.152), (0.008, 0.008, 0.004), yaw=-90, bevel=0)
cable([osc(0.1, 0.06, 0.16), (1.35, BENCH_Y + 0.005, 0.1), (1.4, BENCH_Y + 0.005, -0.05)], r=0.004, mat="blue")
# soldering station and iron in its stand
box("blue", (1.7, BENCH_Y + 0.05, -0.92 + 0.2), (0.14, 0.1, 0.16), yaw=-80, bevel=0.01)
box("led_r", (1.62, BENCH_Y + 0.08, -0.7), (0.004, 0.012, 0.03), yaw=-80, bevel=0)
cyl("steel", (1.55, BENCH_Y + 0.06, -0.85), 0.03, 0.04, verts=16)
cyl("black", (1.5, BENCH_Y + 0.11, -0.82), 0.012, 0.14, axis="x", verts=12, yaw=30)
cable([(1.7, BENCH_Y + 0.04, -0.72), (1.55, BENCH_Y + 0.01, -0.76), (1.45, BENCH_Y + 0.1, -0.82)], r=0.004, mat="grey")
# multimeter, probes, a board under test, screwdrivers, a reel of solder
box("yellow", (1.3, BENCH_Y + 0.018, -0.1), (0.09, 0.035, 0.17), yaw=-70, bevel=0.012)
box("black", (1.3, BENCH_Y + 0.037, -0.13), (0.06, 0.002, 0.05), yaw=-70, bevel=0)
cable([(1.32, BENCH_Y + 0.02, -0.03), (1.29, BENCH_Y + 0.004, 0.08), (1.38, BENCH_Y + 0.004, 0.12)], r=0.002, mat="red")
cable([(1.28, BENCH_Y + 0.02, -0.03), (1.25, BENCH_Y + 0.004, 0.07), (1.3, BENCH_Y + 0.004, 0.15)], r=0.002, mat="black")
box("pcb", (1.33, BENCH_Y + 0.004, -0.72), (0.12, 0.006, 0.09), yaw=-15, bevel=0)
for i in range(4):
    cyl(["red", "yellow", "blue", "black"][i], (1.3 + i * 0.015, BENCH_Y + 0.01, -0.55), 0.006, 0.16, axis="z", verts=10, yaw=random.uniform(-10, 10))
cyl("copper", (1.32, BENCH_Y + 0.02, 0.45), 0.04, 0.04, verts=20)
# tools hanging on the pegboard
for i, (z, h) in enumerate([(-0.75, 0.22), (-0.62, 0.18), (-0.5, 0.26), (0.3, 0.2), (0.42, 0.24), (0.52, 0.16)]):
    box(["red", "black", "yellow", "blue", "black", "red"][i], (X1 - 0.035, 1.35, z), (0.02, h, 0.025), bevel=0.004)
for i in range(3):  # coils of wire on hooks
    cyl(["red", "green", "blue"][i], (X1 - 0.05, 1.5, 0.0 + i * 0.1), 0.045, 0.03, axis="x", verts=20)
# parts bins on the shelf above
for i in range(8):
    z = -0.85 + i * 0.18
    box(["blue", "red", "yellow", "blue", "grey", "red", "blue", "yellow"][i], (X1 - 0.14, 1.88, z), (0.2, 0.1, 0.15), bevel=0.008)
    box("paper", (X1 - 0.241, 1.88, z), (0.002, 0.03, 0.08), bevel=0)
# bench lamp: a weighted base, an arm reaching over the bench, a shade with a warm bulb
LAMP = (1.78, BENCH_Y, -0.62)
cyl("black", (LAMP[0], LAMP[1] + 0.015, LAMP[2]), 0.07, 0.03, verts=24)
cable([(LAMP[0], LAMP[1] + 0.03, LAMP[2]), (LAMP[0] - 0.05, LAMP[1] + 0.38, LAMP[2] + 0.02),
       (LAMP[0] - 0.25, LAMP[1] + 0.5, LAMP[2] - 0.08)], r=0.01, mat="black")
LAMP_HEAD = (LAMP[0] - 0.27, LAMP[1] + 0.48, LAMP[2] - 0.1)
cyl("black", LAMP_HEAD, 0.075, 0.1, verts=24, r2=0.03)
cyl("lampbulb", (LAMP_HEAD[0], LAMP_HEAD[1] - 0.045, LAMP_HEAD[2]), 0.035, 0.01, verts=16)
# boxes and a spare monitor under the bench
box("cardboard", (1.55, 0.15, 0.3), (0.45, 0.3, 0.5), yaw=4, bevel=0.005)
box("beige", (1.6, 0.42, -0.5), (0.4, 0.3, 0.35), yaw=-95, bevel=0.02)

# shelf unit (wc2026-predictor): stacks of parts, a radio, boxes, a football
shf = (SH[0] + SH[1]) / 2
stack((shf, 0.08, 1.7), 4, yaw=90)
box("cardboard", (shf, 0.24, 1.15), (0.4, 0.3, 0.3), yaw=5, bevel=0.005)
box("wood", (shf + 0.02, 0.81 + 0.08, 1.75), (0.3, 0.16, 0.14), yaw=-90, bevel=0.01)   # old radio
cyl("black", (shf - 0.13, 0.81 + 0.08, 1.75), 0.04, 0.01, axis="x", verts=20)
for i in range(3):
    box(["grey", "black", "beige"][i], (shf, 1.36 + 0.03 + i * 0.06, 1.4), (0.4, 0.06, 0.3), yaw=random.uniform(-6, 6), bevel=0.006)
box("led_a", (shf - 0.2, 1.36 + 0.03, 1.32), (0.004, 0.006, 0.006), bevel=0)
SHF_ROUTER = (shf, 1.36, 1.6)
box("black", (shf, 1.36 + 0.02, 1.62), (0.3, 0.035, 0.2), yaw=-90, bevel=0.006)
for i in range(6):
    box("led_g" if i % 2 else "led_a", (shf - 0.151, 1.385, 1.55 + i * 0.025), (0.004, 0.005, 0.008), bevel=0)
for k in (-1, 1):
    cyl("black", (shf + 0.1, 1.48, 1.62 + k * 0.08), 0.006, 0.18, verts=8)
bpy.ops.mesh.primitive_uv_sphere_add(location=B((shf + 0.02, 1.36 + 0.11, 1.1)), radius=0.11, segments=16, ring_count=10)
_add(bpy.context.object, "beige", "props", 0.0)
for i in range(6):
    box(random.choice(["cardboard", "black", "grey", "blue"]), (shf + random.uniform(-0.05, 0.05), 1.8 + 0.08, 1.0 + i * 0.14),
        (0.3, random.uniform(0.08, 0.2), 0.12), yaw=random.uniform(-5, 5), bevel=0.005)
for i in range(3):
    box("paper", (shf, 2.1 + 0.01 + i * 0.012, 1.4 + random.uniform(-0.1, 0.1)), (0.3, 0.01, 0.22), yaw=random.uniform(-20, 20), bevel=0)
# a wall calendar and a poster of a circuit by the door, notes taped beside the window
box("paper", (-0.2, 1.55, Z0 - 0.005), (0.3, 0.42, 0.004), bevel=0)
box("paper", (0.95, 1.45, Z0 - 0.005), (0.6, 0.42, 0.004), bevel=0)  # a tournament bracket, filled in by hand
for side in (-1, 1):
    for r, n in enumerate((8, 4, 2)):
        for k in range(n):
            y = 1.45 + (k - (n - 1) / 2) * (0.38 / n)
            box("black", (0.95 + side * (0.26 - r * 0.07), y, Z0 - 0.008), (0.06, 0.003, 0.001), bevel=0)
box("red", (0.95, 1.45, Z0 - 0.008), (0.05, 0.02, 0.001), bevel=0)
for i in range(4):
    box(random.choice(["sticky", "pinkslip", "paper"]), (WIN[1] + 0.08 + random.uniform(0, 0.15), 1.4 + i * 0.13, Z1 + 0.003),
        (0.08, 0.08, 0.002), bevel=0)
# a whiteboard with a network sketch on the wall between the window and the rack
box("paper", (0.68, 1.55, Z1 + 0.012), (0.62, 0.45, 0.012), group="furniture", bevel=0.003)
box("grey", (0.68, 1.31, Z1 + 0.03), (0.6, 0.02, 0.04), bevel=0.003)
for (x0, y0, x1, y1) in [(0.45, 1.68, 0.68, 1.68), (0.68, 1.68, 0.68, 1.5), (0.68, 1.5, 0.55, 1.42), (0.68, 1.5, 0.82, 1.42),
                         (0.82, 1.68, 0.9, 1.6), (0.45, 1.68, 0.5, 1.52)]:
    L = math.hypot(x1 - x0, y1 - y0)
    box(random.choice(["blue", "red", "black"]), ((x0 + x1) / 2, (y0 + y1) / 2, Z1 + 0.0195), (L, 0.004, 0.001),
        tilt=(0, -math.degrees(math.atan2(y1 - y0, x1 - x0))), bevel=0)
for (x, y) in [(0.45, 1.68), (0.68, 1.68), (0.55, 1.42), (0.82, 1.42), (0.9, 1.6)]:
    box("black", (x, y, Z1 + 0.02), (0.05, 0.03, 0.001), bevel=0)
# fairy lights strung along the top of the shelf unit and over the window
FAIRY = []
def fairy(a, b, n, sag):
    cable([a, b], r=0.002, mat="black", sag=sag)
    for i in range(n):
        t = (i + 0.5) / n
        p = [a[j] + (b[j] - a[j]) * t for j in range(3)]
        p[1] -= sag * 4 * t * (1 - t) + 0.012
        FAIRY.append((tuple(p), None))
        bpy.ops.mesh.primitive_uv_sphere_add(location=B(p), radius=0.011, segments=12, ring_count=8)
        _add(bpy.context.object, "lampbulb_dim", "props", 0.0)
fairy((SH[0], 2.12, SH[2] - 0.02), (SH[0], 2.12, SH[3] + 0.02), 10, 0.08)
fairy((SH[0], 2.12, SH[3] + 0.02), (X1 - 0.02, 2.2, -0.6), 12, 0.15)
fairy((WIN[0] - 0.05, 2.2, Z1 + 0.02), (WIN[1] + 0.05, 2.2, Z1 + 0.02), 14, 0.12)
# a dead ceiling fitting, unlit
cyl("grey", (0, H - 0.04, 0), 0.15, 0.06, verts=24)

# ---------------------------------------------------------------- lights
# Only practical sources. World is near-black.
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.0004, 0.0006, 0.001, 1)

def area(p, normal_yaw, size, energy, color, tilt=0.0):
    bpy.ops.object.light_add(type="AREA", location=B(p))
    o = bpy.context.object
    # an area light shines down its -z; turn it to face the yaw direction (and tilt down)
    o.rotation_euler = (math.radians(90 - tilt), 0, math.radians(normal_yaw + 180))
    l = o.data
    l.shape = "RECTANGLE"; l.size, l.size_y = size
    l.energy, l.color = energy, color
    return o

def point(p, energy, color, radius=0.02):
    bpy.ops.object.light_add(type="POINT", location=B(p))
    l = bpy.context.object.data
    l.energy, l.color, l.shadow_soft_size = energy, color, radius

GREEN = (0.35, 1.0, 0.5)
for spec in LAYOUT["crts"]:
    f = frame(spec["screen"], spec["yaw"])
    area(f(0, 0, 0.012), spec["yaw"], (0.44, 0.34), 0.55, GREEN)
point(nf(0, 0.12, 0.16), 0.22, (1.0, 0.42, 0.1), radius=0.06)
area((wx, wy, Z1 - 0.02), 0, (ww, wh), 2.0, (0.45, 0.6, 1.0))
# the LED strip under the rack's top plate, washing down over the two PCs
area(rf(0, RH - 0.03, FZ - 0.03), 0, (RW - 0.06, 0.02), 3.0, (0.75, 0.85, 1.0), tilt=70)
for k, (p, col) in enumerate(FAIRY):
    if k % 3 == 0:
        point((p[0], p[1] - 0.04, p[2]), 0.06, (1.0, 0.7, 0.35), radius=0.03)
point((RK[0] + 0.05, 0.86, RK[1] + RD / 2 + 0.03), 0.3, (0.4, 1.0, 0.5), radius=0.06)
point((RK[0], 0.6, RK[1] + RD / 2 + 0.04), 0.25, (0.4, 0.6, 1.0), radius=0.06)
point((RK[0] + 0.1, 0.3, RK[1] + RD / 2 + 0.04), 0.1, (0.4, 1.0, 0.5), radius=0.06)
point((SHF_ROUTER[0] - 0.2, SHF_ROUTER[1] + 0.04, SHF_ROUTER[2]), 0.2, (0.4, 1.0, 0.5), radius=0.05)
point((1.45, BENCH_Y + 0.13, 0.15), 0.25, (0.3, 0.9, 1.0), radius=0.05)  # scope glow
bpy.ops.object.light_add(type="SPOT", location=B((LAMP_HEAD[0], LAMP_HEAD[1] - 0.06, LAMP_HEAD[2])))
o = bpy.context.object
o.rotation_euler = (0, 0, 0)  # spots point down Blender -z, which is straight down
o.data.energy, o.data.color, o.data.spot_size, o.data.spot_blend, o.data.shadow_soft_size = 9.0, (1.0, 0.66, 0.36), math.radians(95), 0.6, 0.03

# ---------------------------------------------------------------- render settings
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 3
scene.cycles.glossy_bounces = 0
scene.cycles.use_denoising = bool(args.preview)
scene.view_settings.view_transform = "Standard"

objs = [o for g in groups.values() for o in g]
bpy.ops.object.select_all(action="DESELECT")
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in objs:
    if o["bevel"] > 0:
        md = o.modifiers.new("bevel", "BEVEL")
        md.width = o["bevel"]; md.segments = 2; md.limit_method = "ANGLE"
bpy.ops.object.convert(target="MESH")
for m in M.values():  # diffuse-only bake: no metals or specular
    m.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.0

if args.preview:
    os.makedirs(args.preview, exist_ok=True)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(55)
    cam.data.clip_start = 0.02
    scene.render.resolution_x, scene.render.resolution_y = 640, 360
    from mathutils import Vector
    stops = [("entrance", LAYOUT["entrance"])] + [(c["id"], c) for c in LAYOUT["crts"]]
    for name, s in stops:
        cam.location = Vector(B(s["camera"]))
        d = Vector(B(s["look"])) - cam.location
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(args.preview, f"{name}.png")
        bpy.ops.render.render(write_still=True)
    print("ROOM_PREVIEW done", args.preview)
    sys.exit(0)

# ---------------------------------------------------------------- join, unwrap and bake per atlas
# Each atlas is baked in three parts, then combined: colour (sharp, few samples), lighting
# (smooth, many samples at lower size, then lightly blurred to remove noise: this Blender has
# no denoiser) and glow. Final = colour x lighting + glow, written as sRGB.
LIGHT = {"shell": args.light_size // 2, "furniture": args.light_size, "props": args.light_size}
meshes = {}
for g, objs_g in groups.items():
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs_g:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs_g[0]
    bpy.ops.object.join()
    m = bpy.context.object
    m.name = g
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    meshes[g] = m

import numpy as np
bk = scene.render.bake
bk.use_clear = True

def bake(m, kind, size, samples, margin, filt):
    img = bpy.data.images.new(f"{m.name}_{kind}_{size}", size, size, alpha=True, float_buffer=True)
    img.generated_color = (0, 0, 0, 0)
    for mat in m.data.materials:
        n = mat.node_tree.nodes.get("bake_target") or mat.node_tree.nodes.new("ShaderNodeTexImage")
        n.name = "bake_target"
        n.image = img
        mat.node_tree.nodes.active = n
    bpy.ops.object.select_all(action="DESELECT")
    m.select_set(True)
    bpy.context.view_layer.objects.active = m
    scene.cycles.samples = samples
    bk.margin = margin
    bk.use_pass_direct, bk.use_pass_indirect, bk.use_pass_color = filt
    bpy.ops.object.bake(type=kind)
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(size, size, 4)

def blur(a, sigma):
    """Separable gaussian blur over the first two axes."""
    r = max(1, int(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2).astype(np.float32)
    k /= k.sum()
    for axis in (0, 1):
        pad = [(r, r) if i == axis else (0, 0) for i in range(a.ndim)]
        p = np.pad(a, pad, mode="edge")
        out = np.zeros_like(a)
        for i, w in enumerate(k):
            out += w * (p[i:i + a.shape[0]] if axis == 0 else p[:, i:i + a.shape[1]])
        a = out
    return a

def upscale(a, size):
    """Bilinear resize of a square HxWxC array to size x size."""
    n = a.shape[0]
    x = np.clip((np.arange(size) + 0.5) * n / size - 0.5, 0, n - 1)
    i0 = np.floor(x).astype(int); i1 = np.minimum(i0 + 1, n - 1); w = (x - i0).astype(np.float32)
    a = a[i0] * (1 - w)[:, None, None] + a[i1] * w[:, None, None]
    return a[:, i0] * (1 - w)[None, :, None] + a[:, i1] * w[None, :, None]

def srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)

images, timings = {}, {}
for g, m in meshes.items():
    t0 = time.time()
    light = bake(m, "DIFFUSE", LIGHT[g], args.samples, 4, (True, True, False))
    mask = light[..., 3:4]
    light = blur(light[..., :3] * mask, args.blur) / np.maximum(blur(mask, args.blur), 1e-4)
    light = upscale(light, args.size)
    color = bake(m, "DIFFUSE", args.size, 4, 8, (False, False, True))
    glow = bake(m, "EMIT", args.size, 4, 8, (False, False, False))
    final = np.ones((args.size, args.size, 4), dtype=np.float32)
    final[..., :3] = srgb(color[..., :3] * light + glow[..., :3])
    del light, color, glow
    img = bpy.data.images.new(f"room_{g}", args.size, args.size, alpha=False)
    img.pixels.foreach_set(final.ravel())
    del final
    images[g] = img
    timings[g] = time.time() - t0
    print(f"ROOM_BAKE_GROUP {g} {args.size}px light {LIGHT[g]}px {timings[g]:.1f}s", flush=True)

# ---------------------------------------------------------------- one baked material per atlas, export
for g, m in meshes.items():
    final = bpy.data.materials.new(f"baked_{g}")
    final.use_nodes = True
    nt = final.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = images[g]
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.0
    m.data.materials.clear()
    m.data.materials.append(final)

bpy.ops.object.select_all(action="DESELECT")
for m in meshes.values():
    m.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=args.out, export_format="GLB", use_selection=True,
    export_image_format="JPEG", export_jpeg_quality=args.jpeg,
    export_cameras=False, export_lights=False, export_apply=True, export_normals=False,
)
total = sum(timings.values())
print(f"ROOM_BAKE size={args.size} light={args.light_size} samples={args.samples} bake_seconds={total:.1f} out={args.out}")
