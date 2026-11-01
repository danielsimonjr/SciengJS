# sciengjs

A local rendering engine for science and engineering diagrams, in TypeScript.

sciengjs renders DOT, Mermaid, LaTeX math, TikZ, plots, SysML v2, STEP, IGES, BREP, CAD documents and HTML to SVG, PNG, PDF, HTML or Markdown. It runs on the local machine. It sends no source to a web service.

- npm: `@danielsimonjr/sciengjs`
- Adapter: [`scieng-mcp`](https://github.com/danielsimonjr/scieng-mcp) gives the engine to an agent harness as MCP tools, slash commands and a skill.

## Documents

| Document | Content |
|---|---|
| [Design](docs/superpowers/specs/2026-11-01-scieng-engine-design.md) | the API, the stages, each input type, the configuration, the runtime, the security controls and the tests |
| [Build plan](docs/superpowers/plans/2026-11-01-scieng-engine-build.md) | the trial builds and the increments, each with one scope, one gate and one release |

The code arrives through the increments of the build plan.

## Licence

MIT. See [`LICENSE`](LICENSE). The borrowed engines keep their own licences. The design lists each licence.
