# This project

## Where things live
- `origin` is Forgejo. GitHub is a read-only public copy of `main`: never push or open anything there.
- Specs, tickets and PRs are on Forgejo. Use `tea`, as `docs/agents/issue-tracker.md` describes.
- Run `make setup` once per clone. It stops pushes to `main`.

## Checks
`make frontend`, `make backend`, `make integration`, `make browser` and `make facts`.
`make facts` checks that every path, command and tag these docs name exists, so update a doc in the same PR as the change that makes it wrong.

## Deploys
Merging to `main` deploys to staging. Staging follows the `staging` branch, which only `release.yml`
moves. Production follows the `production` branch, which only the
`promote` workflow moves. Adham runs it.
Everything in `deploy/` is what Argo CD runs. Don't edit `image.tag` by hand: the workflows own it.

## Agent skills
- Issue tracker: `docs/agents/issue-tracker.md`
- Triage labels: `docs/agents/triage-labels.md`
- Domain docs: `docs/agents/domain.md`
