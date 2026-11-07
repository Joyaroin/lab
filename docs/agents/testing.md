# Testing facts

Checked against the code on 2026-11-07, at 1257325.

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
- `make browser`: the full Playwright suite. Installs browsers and system packages on every run
- `make browser-light`: the `browser` recipe without `@timing` and `@render`. Passes `PW_ARGS` through
- `make facts`: every path, command and tag the docs name exists
- One spec on the VM: `heavy npx playwright test tests/<spec> --workers=1`

## What CI runs
- `frontend`, `backend`, `integration`: the make targets of the same name
- `browser`: the full suite on the GPU, tags included. `tests/gpu.spec.ts` fails it if Chromium falls back to the CPU
- `screenshots`: every station at desktop and phone size, posted to the PR
- `secret-scan`: gitleaks over the full history
- `facts`: `make facts`
- On `main`, `release.yml` builds the image and moves `staging`. `promote.yml` moves `production`, run by Adham
