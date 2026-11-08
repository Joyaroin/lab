# Testing facts

Checked against the code on 2026-11-08, at 59e6a4d.

## Kinds of test
| Kind | How to select it | Where it runs |
|---|---|---|
| Unit | `npm test` | Builder and CI |
| Light browser | `make browser PW_ARGS=<spec>` for the specs it touched. `make browser-light` only for a change to shared code, through `heavy` | Builder and CI |
| Timing | `@timing` | CI only. On the VM only to measure or break-check, through `heavy`, 1 worker |
| Heavy rendering | `@render` | CI only |

## Commands
- `make frontend`: `npm ci`, the typecheck, `npm test` and the build
- `make integration`: `make frontend`, then the integration test
- `make browser`: the full Playwright suite. Installs browsers and system packages only in CI
- `make browser-light`: the `browser` recipe without `@timing` and `@render`. Passes `PW_ARGS` through
- `make facts`: every path, command and tag the docs name exists
- A flash limit spec counts the tear's visible snap back (the displacement map's scale reaching 0, `tests/lib/snap.ts`), never the filter coming off
- `tests/shift.spec.ts` records the snap back's measured time as a `snap-back-ms` test annotation and a log line, for CI's browser job report
- One spec on the VM: `heavy npx playwright test tests/<spec> --workers=1`

## What CI runs
CI runs on every branch except `staging` and `production`, including `main` after each merge. Nothing waits for the run on `main`. With no open PR, the posting steps log that there is nothing to post and pass.
- `frontend`, `backend`, `integration`: the make targets of the same name
- `browser`: the full suite on the GPU, tags included. `tests/gpu.spec.ts` fails it if Chromium falls back to the CPU
- `screenshots`: every station at desktop and phone size, posted to the PR
- `secret-scan`: gitleaks over the full history
- `facts`: `make facts`
- Also on `main`, `release.yml` builds the image and moves `staging`. `promote.yml` moves `production`, run by Adham
