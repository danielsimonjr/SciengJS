<!-- repo-map:no-verification -->
# sciengjs public API

## Entry point `.`

### `render(req, config?)`

Renders one source to one format.

| Parameter | Type | Meaning |
|---|---|---|
| `req` | `RenderRequest` | The input type, the source, the output format and the options. |
| `config` | `Partial<SciengConfig>`, optional | Call options. They override the environment, the file and the defaults. |

Returns `Promise<RenderResult>`. The result holds `bytes`, `mime`, `backend`, `warnings` and, when present, `assets`.

Rejects with `RenderError`. The codes are: `E_INPUT`, `E_UNSUPPORTED`, `E_LIMIT`, `E_TIMEOUT`, `E_STAGE_MISSING`, `E_CONFIG`, `E_INTEGRITY` and `E_INTERNAL`. The render never falls back to another format.

### `capabilities(config?)`

Lists each supported pair with its stage and its readiness.

Returns `Promise<Capability[]>`. Each entry holds `type`, `format`, `stage`, `ready` and, when the pair is not ready, `reason`.

### `loadConfig(options?, deps?)`

Resolves the configuration. Returns `Promise<SciengConfig>`. It rejects with `E_CONFIG`.

### `RenderError`

| Member | Type | Meaning |
|---|---|---|
| `name` | `"RenderError"` | The error name. |
| `code` | `RenderErrorCode` | One of the eight codes. |
| `message` | `string` | The message. |
| `line` | `number \| undefined` | The one-based source line, when the failure has one. |
| `column` | `number \| undefined` | The one-based source column, when the failure has one. |

### Types

| Type | Values |
|---|---|
| `InputType` | `dot`, `mermaid`, `math`, `tikz`, `plot`, `sysml`, `step`, `iges`, `brep`, `cad`, `html` |
| `OutputFormat` | `svg`, `png`, `pdf`, `html`, `md`, `glb`, `stl` |
| `RenderRequest` | `{ type, source, format, options? }`. The `source` is text, or bytes for `step`, `iges` and `brep`. |
| `RenderResult` | `{ bytes, mime, backend, warnings, assets? }` |
| `RenderAsset` | `{ name, bytes, mime }` |
| `Capability` | `{ type, format, stage, ready, reason? }` |
| `SciengConfig` | The seven configuration keys, with `browser` optional. |
| `NetworkPolicy` | `none`, `tex-bundles`, `tex-bundles,images` |

## Subpaths

| Subpath | Status in increment I0 |
|---|---|
| `./graph` | Stub. It exports nothing. |
| `./mermaid` | Stub. |
| `./math` | Stub. |
| `./tex` | Stub. |
| `./plot` | Stub. |
| `./sysml` | Stub. |
| `./mesh` | Stub. |
| `./browser` | Stub. |
| `./html` | Stub. |
| `./raster` | Stub. |

Each stage fills its subpath in its own increment. A caller that imports a subpath loads no WASM file.
