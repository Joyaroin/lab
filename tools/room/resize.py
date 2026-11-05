"""Shrinks the baked atlases inside room.glb to the size the site ships, without re-baking.

    blender -b -P tools/room/resize.py -- src/assets/room.glb --size 2048 [--jpeg 90]

The bake runs at 4096 px so its detail is sharp, but three 4096 px textures need about 270 MB of
GPU memory once mipmapped, which is too much for phones and stalls software WebGL. Each halving
averages 2x2 blocks in linear light, so the result matches what the GPU's own mipmaps would show
at that size. Only the image bytes change: meshes, UVs and materials are copied as they are.
"""
import argparse, json, os, struct, sys, tempfile
import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("glb")
ap.add_argument("--size", type=int, default=2048)
ap.add_argument("--jpeg", type=int, default=90)
args = ap.parse_args(argv)

def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)

def shrink(jpeg, size, tmp):
    """JPEG bytes in, JPEG bytes out at size x size."""
    src = os.path.join(tmp, "in.jpg")
    open(src, "wb").write(jpeg)
    img = bpy.data.images.load(src)
    n = img.size[0]
    if n <= size:
        bpy.data.images.remove(img)
        return jpeg, n
    px = np.empty(n * n * 4, dtype=np.float32)
    img.pixels.foreach_get(px)  # sRGB values, as stored
    bpy.data.images.remove(img)
    a = to_linear(px.reshape(n, n, 4)[..., :3].astype(np.float64))
    while a.shape[0] > size:
        a = (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) / 4
    m = a.shape[0]
    out = np.ones((m, m, 4), dtype=np.float32)
    out[..., :3] = to_srgb(a)
    new = bpy.data.images.new("shrunk", m, m, alpha=False)
    new.pixels.foreach_set(out.ravel())
    dst = os.path.join(tmp, "out.jpg")
    new.file_format = "JPEG"
    new.save(filepath=dst, quality=args.jpeg)
    bpy.data.images.remove(new)
    return open(dst, "rb").read(), n

data = open(args.glb, "rb").read()
magic, version, _ = struct.unpack("<4sII", data[:12])
assert magic == b"glTF" and version == 2, "not a glTF 2 binary"
jlen, jtype = struct.unpack("<II", data[12:20])
gltf = json.loads(data[20:20 + jlen])
blen, btype = struct.unpack("<II", data[20 + jlen:28 + jlen])
assert jtype == 0x4E4F534A and btype == 0x004E4942, "unexpected GLB chunks"
bin_in = data[28 + jlen:28 + jlen + blen]

views = gltf["bufferViews"]
new_bytes = {v["bufferView"]: None for v in gltf["images"]}
with tempfile.TemporaryDirectory() as tmp:
    for im in gltf["images"]:
        v = views[im["bufferView"]]
        old = bin_in[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
        new_bytes[im["bufferView"]], was = shrink(old, args.size, tmp)
        print(f"ROOM_RESIZE {im.get('name')} {was}px -> {args.size}px "
              f"{len(old)} B -> {len(new_bytes[im['bufferView']])} B", flush=True)

# Repack the binary chunk in bufferView order, keeping each view 4-byte aligned.
out = bytearray()
for i, v in enumerate(views):
    chunk = new_bytes.get(i) or bin_in[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
    out += b"\0" * (-len(out) % 4)
    v["byteOffset"], v["byteLength"] = len(out), len(chunk)
    out += chunk
out += b"\0" * (-len(out) % 4)
gltf["buffers"][0]["byteLength"] = len(out)

js = json.dumps(gltf, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
total = 12 + 8 + len(js) + 8 + len(out)
with open(args.glb, "wb") as f:
    f.write(struct.pack("<4sII", b"glTF", 2, total))
    f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
    f.write(struct.pack("<II", len(out), 0x004E4942) + out)
print(f"ROOM_RESIZE wrote {args.glb} {total} B")
