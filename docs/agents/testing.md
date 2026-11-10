# Testing facts

Checked against the code on 2026-11-09, at 5de46d9.

## Kinds of test
| Kind | How to select it | Where it runs |
|---|---|---|
| Unit | `npm test` | Builder and CI |
| Light browser | `make browser-light PW_ARGS=<spec>` for the specs it touched. `make browser-light` alone only for a change to shared code, through `heavy` | Builder and CI |
| Timing | `@timing` | CI only. In the session only to measure or break-check, through `heavy`, 1 worker. Exact durations are unit tests with a fake clock (`src/frames.test.ts`, `src/tear.test.ts`, `src/nixie.test.ts`, `src/meter-power.test.ts`, `src/shift/shift.test.ts`); browser timing specs check that a play happened, its order, and the safe side of a limit |
| Heavy rendering | `@render` | CI only |

## Commands
- `make frontend`: `npm ci`, the typecheck, `npm test` and the build
- `make integration`: `make frontend`, then the integration test
- `make browser`: the full Playwright suite. Installs browsers and system packages only in CI
- `make browser-light`: the `browser` recipe without `@timing` and `@render`. Passes `PW_ARGS` through
- `make meter`: renders the meter bar's images with a local browser that has WebGL. Run on purpose, on the Mac, like `make room`. CI does not run it. Run it through `heavy`; running it again at the same commit leaves `git status --short src/assets/meter` empty. `src/meter-layers.test.ts` checks the committed images against the layer list, and `src/meter-device.test.ts` the mapping from a reading to the layers shown
- `make facts`: every path, command and tag the docs name exists
- A flash limit spec counts the tear's visible snap back (the displacement map's scale reaching 0, `tests/lib/snap.ts`), never the filter coming off. `src/tear-draw.test.ts` checks the view leaves scale 0 on its last frame, whatever the frame rate, and on its stop path (a tear cut short)
- `tests/shift.spec.ts` records the snap back's measured time as a `snap-back-ms` test annotation and a log line, for CI's browser job report
- A browser spec can't import `src/meter-layers.ts` (Playwright's loader refuses JSON modules); `tests/device.spec.ts` reads `src/assets/meter/layers.json` itself
- One spec in the session: `heavy npx playwright test tests/<spec> --workers=1`

## What CI runs
CI runs on every branch except `staging` and `production`, including `main` after each merge. Nothing waits for the run on `main`. With no open PR, the posting steps log that there is nothing to post and pass, except on `main`: there each failure report is added as a new comment on the standing "CI failures on main" issue (created or reopened if needed).
- `frontend`, `backend`, `integration`: the make targets of the same name
- `browser`: the full suite on the GPU, tags included. `tests/gpu.spec.ts` fails it if Chromium falls back to the CPU
- `screenshots`: the overview plus every station, at desktop and phone size, posted to the PR
- `secret-scan`: gitleaks over the full history
- `facts`: `make facts`
- Also on `main`, `release.yml` builds the image and moves `staging`. `promote.yml` moves `production`, run by Adham
