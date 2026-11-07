# Lab

A 3D late-night home lab that hiring teams tour to learn what Adham does. The room is the site: you
scroll along a fixed camera path through stations, and a nixie-tube meter on the desk shows how many
MediaSafe staging deploys have landed since the last promotion to prod. It is static files served by
nginx, with no server code.

## Run it

You need Node and npm.

```
npm ci
npm run dev
```

`npm test` runs the unit tests and `npm run build` makes the production build. `make frontend` does
both, after a type check. The room's 3D model is committed, so you don't need Blender unless you
rebuild it (below).

## Live demo

https://lab.mediasafe.space

## Rebuilding the room

`make room` runs `tools/room/build.py` in headless Blender (5.x) and rewrites `src/assets/room.glb`.
The room is modelled from primitives in that script and lit only by things in it (CRTs, the nixie
meter, LEDs, a bench lamp, fairy lights, the city through the window). Each of three atlases (walls,
furniture, props) is baked as sharp surface colour at 4096 px, plus lighting at 2048 px (1024 for the
walls) with 192 samples. The Makefile then runs `tools/room/resize.py`, which shrinks the atlases to
2048 px, so the site ships 2048 px textures: three 4096 px ones need too much GPU memory for phones. The lighting is lightly blurred to remove noise, because this Blender build
has no denoiser. The output is committed (ADR-0004), so re-bake on purpose.

Where each CRT sits is in `src/room-layout.json`, which the script and the site both read. The file
also holds the entrance, the arcs and the pulled-back portrait (phone) views. The desktop stops are
not in it: `src/stop.ts` works them out from each CRT's place and the window. To check composition
without baking, run `blender -b -P tools/room/build.py -- --preview /tmp/shots` to render every camera
view in the layout (the desktop stops are not among them). For a quick
test bake, pass `--size 1024 --light-size 512 --samples 64` after `--`. Draco mesh compression isn't
used, because this Blender build lacks the library.
