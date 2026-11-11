# Lab

A 3D late-night home lab where Adham Sedik shows his work. The room is the site: you open on an overview of a
desk and five lit monitors, click a monitor (or a link at the top) to fly to its station, and read what he has built there.
A nixie-tube meter on the desk counts how many MediaSafe staging deploys have landed since the last promotion to
production. It shows that live count only at the overview; each station has its own fixed reading. The site is static
files served by nginx, with no server code.

Live: https://lab.mediasafe.space

## How it was built

An AI software factory built this site. Adham plans a feature with an orchestrator agent, which cuts it into small
tickets. Builder agents write each ticket test-first and open a pull request, full CI runs on every one, and a
fresh reviewer agent decides whether it merges by itself, needs him, or goes back for a rebuild. Adham promotes to
production by hand. The "Software factory" station in the room tells the story, so it is not repeated here.

## Run it

You need Node 22 (the Dockerfile uses it) and npm.

```
npm ci
npm run dev
```

`npm test` runs the unit tests. `npm run build` saves today's live gap, type-checks, makes the production build and
checks the size budget. `make frontend` runs `npm ci`, the type check, `npm test` and `npm run build`, in that order.
`make facts` checks that the paths, commands and tags the docs name exist. The room's 3D model is committed, so you
don't need Blender unless you rebuild it (below).

## Rebuilding the room

`make room` runs `tools/room/build.py` in headless Blender (5.x) and rewrites `src/assets/room.glb`.
The room is modelled from primitives in that script and lit only by things in it (CRTs, the nixie
meter, LEDs, a bench lamp, fairy lights, the city through the window). Each of three atlases (walls,
furniture, props) is baked as sharp surface colour at 4096 px, plus lighting at 2048 px (1024 for the
walls) with 192 samples. The Makefile then runs `tools/room/resize.py`, which shrinks the atlases to
2048 px, so the site ships 2048 px textures: three 4096 px ones need too much GPU memory for phones. The lighting is lightly blurred to remove noise, because this Blender build
has no denoiser. The output is committed (ADR-0004), so re-bake on purpose.

Where each CRT sits is in `src/room-layout.json`, which the script and the site both read. The file
also holds the overview and the pulled-back portrait (phone) views. The desktop stops are
not in it: `src/stop.ts` works them out from each CRT's place and the window. To check composition
without baking, run `blender -b -P tools/room/build.py -- --preview /tmp/shots` to render a camera
view of each TV (the five stations and the bench TV) and of the overview at 16:9 and 16:10 (the desktop stops are not among them). For a quick
test bake, pass `--size 1024 --light-size 512 --samples 64` after `--`. Draco mesh compression isn't
used, because this Blender build lacks the library.

## Rendering the meter bar's images

`make meter` renders the meter bar's images: a walnut case with seven glass nixie tubes and legend keys, drawn as
layers (the unlit device, the tubes' light on the case, ten lit numerals, the decimal point and four keys). It
serves `tools/meter/` through Vite and opens it in Playwright's Chromium, which has WebGL, so no CDN is fetched,
and writes the layers to `src/assets/meter/`. Run it on the Mac, through `heavy`: `heavy make meter`. The wood
grain uses a fixed seed, so rendering again at the same commit writes the same files. `src/meter-layers.ts` lists
the layers with their places and sizes on the 840 px wide device. The key words come from `src/content.ts`, so a
change to one means rendering again. The images are committed (ADR-0006), and CI never runs it.
