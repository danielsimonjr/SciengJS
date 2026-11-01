# Contributing to sciengjs

## Before you start

- Read the [design](docs/superpowers/specs/2026-11-01-scieng-engine-design.md) and the [build plan](docs/superpowers/plans/2026-11-01-scieng-engine-build.md).
- Find the increment that your change belongs to. A change outside the plan needs an issue first.

## Development

The setup, build and test commands arrive with increment I0 of the build plan.

## The rules of a change

1. Write the failing test first. See it fail. Then write the code.
2. Keep one change in one commit.
3. Add an entry under `## [Unreleased]` in `CHANGELOG.md`, in the same commit.
4. Write each document in ASD-STE100 Simplified Technical English. Run `repo-tools ste` on each changed document.
5. Run the gates of the build plan (section "Gates common to every increment") before you open a pull request.
6. Add no runtime dependency without approval in the issue or the pull request.
7. Use the pull request template. Fill in each item.

## Security problems

Do not open a public issue. See [`SECURITY.md`](SECURITY.md).

## Licence

You agree that your contribution uses the MIT licence of this repository.
