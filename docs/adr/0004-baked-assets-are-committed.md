# Baked room assets are committed

The room is built by Blender scripts, and its lighting is baked into textures. Baking is slow and
needs Blender, which CI doesn't have, so the scripts and their compressed output are both committed
and CI only checks size. Every re-bake adds megabytes to history on a small Forgejo and the public
mirror, so re-bake on purpose, not on every change.
