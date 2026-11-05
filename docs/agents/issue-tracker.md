# Issue tracker: Forgejo

Issues and specs for this repo live as Forgejo issues. Use the `tea` CLI for all operations.

## Conventions

- **Create an issue**: `tea issues create --title "..." --description-file -`, with the body on stdin. Add `--labels "..."` for labels.
- **Read an issue**: `tea issues <number> --comments`.
- **List issues**: `tea issues --state open --labels "..." --output json`.
- **Comment on an issue**: `tea comment <number> "..."`.
- **Apply / remove labels**: `tea issues edit <number> --add-labels "..."` / `--remove-labels "..."`.
- **Close**: comment first, then `tea issues close <number>`.
- **Pull requests**: `tea pulls create --title "..." --description "..." --head <branch> --base main`. `tea pulls`, `tea pulls <number>` and `tea comment <number>` read and comment. Only the orchestrator runs `tea pulls merge`.
- **Anything else**: `tea api <path>`.

Infer the repo from `git remote -v`. `tea` does this automatically when run inside a clone.

Forgejo shares one number space across issues and PRs, so a bare `#42` may be either.

## When a skill says "publish to the issue tracker"

Create a Forgejo issue.

## When a skill says "blocked by"

List the blockers in the issue body as `#<number>`, as the ticket template shows.
