# Testing facts

Checked against the code on 2026-11-10, at 0cdc4d7: each line confirmed against the code there, and `make facts` run.

## Kinds of test
| Kind | How to select it | Where it runs |
|---|---|---|
| Unit | `npm test` | Builder and CI |
| Light browser | `make browser-light PW_ARGS=<spec>` for the specs it touched. `make browser-light` alone only for a change to shared code, through `heavy` | Builder and CI |
| Timing | `@timing` | CI only. In the session only to measure or break-check, through `heavy`, 1 worker. Exact durations are unit tests that pass the time in or fake the clock (`src/frames.test.ts`, `src/tear.test.ts`, `src/nixie.test.ts`, `src/meter-power.test.ts`, `src/shift/shift.test.ts`); browser timing specs check that a play happened, its order, and the safe side of a limit |
| Heavy rendering | `@render` | CI only |

## Commands
- `make frontend`: `npm ci`, the typecheck, `npm test` and the build
- `make integration`: `make frontend`, then the integration test
- `make browser`: the full Playwright suite. Installs browsers and system packages only in CI
- `make browser-light`: the `browser` recipe without `@timing` and `@render`. Passes `PW_ARGS` through
- `make meter`: renders the meter bar's images with a local browser that has WebGL. Run on purpose, on the Mac, like `make room`. CI does not run it. Run it through `heavy`; running it again at the same commit leaves `git status --short src/assets/meter` empty. `src/meter-layers.test.ts` checks the committed images against the layer list, and `src/meter-device.test.ts` the mapping from a reading to the layers shown
- `make resume`: builds `public/resume.pdf` from `resume/resume.tex` with tectonic. Run on the Mac; the first run downloads a TeX bundle, so it needs the network. CI does not run it. `src/resume.test.ts` checks the PDF exists and the source has no phone number
- `make og-image`: takes `public/og-image.png`, the link preview image, with a local browser that has WebGL (builds the site, serves it with `npm run preview` on `TEST_PORT`). Run on purpose, on the Mac, through `heavy`. CI does not run it. `src/page-image-tags.test.ts` checks the file exists and its PNG header's size matches the head's `og:image` width and height
- `make facts`: every path, command and tag the docs name exists
- A flash limit spec counts the tear's visible snap back (the displacement map's scale reaching 0, `tests/lib/snap.ts`), never the filter coming off. `src/tear-draw.test.ts` checks the view leaves scale 0 on its last frame, whatever the frame rate, and on its stop path (a tear cut short)
- `tests/shift.spec.ts` records the snap back's measured time as a `snap-back-ms` test annotation and a log line, for CI's browser job report
- A browser spec can't import `src/meter-layers.ts` (Playwright's loader refuses JSON modules); `tests/device.spec.ts` reads `src/assets/meter/layers.json` itself
- `tests/boot.spec.ts`'s `slowModel` helper serves the room model from a local server and waits on CDP `Network.dataReceived` for each chunk. That server must answer only `/room.glb`: on the Mac a stray `GET /` sometimes reaches it, and taking it for the model sent later chunks to a dead response, so the wait timed out (a chunk behind, or at 0) in whole-file runs only. The slow-load test needs the whole file to show it: `heavy make browser-light PW_ARGS="tests/boot.spec.ts --repeat-each=5"`
- One spec in the session: `heavy npx playwright test tests/<spec> --workers=1`

## What CI runs
CI runs on every branch except `staging` and `production`, including `main` after each merge. Nothing waits for the run on `main`. With no open PR, the posting steps log that there is nothing to post and pass, except on `main`: there each failure report is added as a new comment on the standing "CI failures on main" issue (created or reopened if needed).
- `frontend`, `backend`, `integration`: the make targets of the same name
- `browser`: the full suite on the GPU, tags included. `tests/gpu.spec.ts` fails it if Chromium falls back to the CPU
- `screenshots`: the overview plus every station, at desktop and phone size, posted to the PR
- `secret-scan`: gitleaks over the full history
- `facts`: `make facts`
- Also on `main`, `release.yml` builds the image and moves `staging`. `promote.yml` moves `production`, run by Adham
