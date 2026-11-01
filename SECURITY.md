# Security

## Reporting a vulnerability

Open a private security advisory on [GitHub](https://github.com/danielsimonjr/sciengjs/security/advisories/new). Do not open a public issue for a security problem. The maintainers try to acknowledge a report within 7 days.

## Scope

The engine renders sources that can come from an untrusted author. The section "Security" of the [design](docs/superpowers/specs/2026-11-01-scieng-engine-design.md) gives the risks and the control for each risk.

The engine is not a sandbox for a hostile process. A host that renders hostile input at scale runs the engine in a container.
