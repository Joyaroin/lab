# Project name

What it does and who it's for.

## Run it

Setup steps.

## Live demo

Link.

## Rebuilding the room

`make room` runs `tools/room/build.py` in headless Blender (5.x) and rewrites `src/assets/room.glb`
(about 1 minute on 4 CPUs). The room is modelled from primitives in that script, lighting is baked
into one 2048 px JPEG, and the output is committed (ADR-0004). Re-bake on purpose. Options go after
`--`, for example `--size 1024 --samples 8` for a quick test. Draco mesh compression isn't used:
this Blender build lacks the library, and the mesh is tiny next to the texture.
