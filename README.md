# Lab

A 3D late-night home lab that hiring teams tour to learn what Adham does. The room is the site: you
open on an overview and click a monitor, or a HUD link, to fly to its station, and a nixie-tube meter on the desk shows how many
MediaSafe staging deploys have landed since the last promotion to prod. It shows that gap only at the
overview; each station has its own fixed reading. It is static files served by
nginx, with no server code.

## Run it

You need Node 22 (the Dockerfile uses it) and npm.

```
npm ci
npm run dev
```

`npm test` runs the unit tests. `npm run build` saves the live gap, type-checks, makes the production
build and checks the size budget. `make frontend` runs both, after `npm ci` and a type check. The room's
3D model is committed, so you don't need Blender unless you rebuild it (below).

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
also holds the overview and the pulled-back portrait (phone) views. The desktop stops are
not in it: `src/stop.ts` works them out from each CRT's place and the window. To check composition
without baking, run `blender -b -P tools/room/build.py -- --preview /tmp/shots` to render every camera
view in the layout, the overview at 16:9 and 16:10 included (the desktop stops are not among them). For a quick
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

## Building the résumé

`make resume` builds `public/resume.pdf` from `resume/resume.tex` with [tectonic](https://tectonic-typesetting.github.io/). Run it on the Mac: the first run downloads a TeX bundle, so it needs the network. The PDF is committed, and CI never runs it. The résumé must stay one page: check with `pdfinfo public/resume.pdf`, which shows `Pages: 1`. If the text spills, tighten spacing (margins, gaps between sections) before changing words. The source holds no phone number, and `src/resume.test.ts` checks that.
