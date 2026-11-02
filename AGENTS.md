# AGENTS.md

> Agent-facing context for sciengjs. For human onboarding, see README.md.

> ACFS: v1

## Context File Suite

This project uses the Agentic Context File Suite (ACFS). The following files exist:

- `README.md` — Project identity (human-facing)
- `AGENTS.md` — This file. Cross-agent behavior rules.
- `CLAUDE.md` — Claude-specific invariants (if present). Complements this file.
- `memory/MEMORY.md` — Index of what you have learned. Read on session start.
- `CHANGELOG.md` — Project history. Consult before making breaking changes.

### Memory Protocol
- On session start: read `memory/MEMORY.md`
- When you learn something worth keeping: write to `memory/topics/<type>.md`
  and update `memory/MEMORY.md` index
- When you correct or delete a memory: log the mutation in `memory/CHANGELOG.memory.md`
- Keep `memory/MEMORY.md` under 200 lines; promote detail to topic files
- **Interop:** Claude Code's user-scoped auto-memory at
  `~/.claude/projects/<hash>/memory/` coexists with this project memory.
  User-scoped wins on conflict. Don't duplicate entries — write facts about
  *this project* here; write facts about *the user across projects* there.

## Environment Setup

Install Bun 1.4.4 and Node 22 or later. Run `bun install --frozen-lockfile` in the repository root.

The page checker tests need a Chrome or Chromium executable. Set `SCIENG_BROWSER` to the absolute path of the executable. Without the executable, those tests skip with a printed reason. In CI, the tests never skip.

## Build & Test Commands

| Command | Purpose |
|---|---|
| `bun test` | Run the full suite. |
| `bun run typecheck` | Typecheck `src/` and `test/`. |
| `bun run build` | Emit the ESM package into `dist/`. |
| `bun run smoke` | Pack the build, install the tarball in a fresh folder and run the Node smoke test. |
| `repo-tools check . --docs=docs/architecture` | Check the drift gate of the architecture documents. |
| `repo-tools docs check src` | Check the doc comments of `src/`. |
| `repo-tools ste <file>` | Check one document in Simplified Technical English. |

Each increment runs the gates in the "Gates common to every increment" section.

## Code Conventions

- The source uses `node:` modules, WASM and web APIs that Node 22 and Bun both provide.
- The source uses no `Bun.*` API in `src/`. A lint rule enforces this rule.
- Every document uses ASD-STE100 Simplified Technical English. `repo-tools ste` checks it.

## Architecture Constraints

- The design in `docs/superpowers/specs/` is the authority for the API, the stages and the security controls. To change the design, edit the design file in its own commit.
- Add no runtime dependency without approval. The design names the approved engines.
- The engine sends no source to a web service. A network request needs `allowNetwork` in the configuration.
- The engine knows nothing about MCP. MCP code goes in `scieng-mcp`.

## File Boundaries

- GENERATED (do not edit): the reports that `repo-tools map` writes into `docs/architecture/`. Edit the generator, then run it again.
- READ ONLY: `LICENSE`.
- No personal names and no machine names in prose. Use roles: "the user", "the model host", "the release machine".
- This repository is public. A commit message or a PR body holds no session URL and no session trailer.

## Testing Protocol

- Write the failing test first. See it fail. Then write the code.
- A task is done when the typecheck, the full test suite and the doc gates pass. The build plan lists the gates.
- Give a new parser or numeric routine a mutation audit with a baseline. Count only mutants that a test assertion kills.
- Record the junior helper pass in each commit or PR body: `junior chain run: yes, N of M accepted (<model>)`, or the reason for no run.

## MCP Servers

None. The adapter `scieng-mcp` is a separate repository.

## Context File Maintenance

| File | Update trigger | Who updates |
|---|---|---|
| `README.md` | Major project changes | Human |
| `AGENTS.md` | New conventions, tools, or agent feedback | Human + agent |
| `MEMORY.md` | Every session (auto) + manual corrections | Agent (auto) |
| `CHANGELOG.md` | Every release + memory mutations | Human + agent |
