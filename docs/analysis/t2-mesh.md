# T2 mesh: trial report

## Question

Does `occt-import-js` read a STEP file, an IGES file and a BREP file under Bun 1.4.4 and under Node 22, on Windows, Linux and macOS?

Exit numbers:

- The WASM load time.
- The read time of each sample: the first read and the warm median of 20 reads.
- The triangle count and the mesh count of each sample.
- The peak heap.
- The package size on disk, and the WASM file size.
- The effect of the option `linearUnit` on the coordinates of one STEP sample.
- Whether the reader returns the face colours of a sample.

Design sources: `docs/superpowers/specs/2026-11-01-scieng-engine-design.md`, sections "mesh" and "STEP, IGES, BREP".

## Verdict

**The trial holds for the three samples. The design can use `occt-import-js` 0.0.23 for STEP, IGES and BREP input.**

- All six CI jobs read all three formats. CI run `41388930082`, head commit `a714dd9`. Each job ended with the result `success`.
- The geometry hash of each sample is the same in all six jobs (table 4).
- The option `linearUnit` works as the design states. The default is `millimeter`. The value `meter` divides the coordinates by 1000.
- The reader returns face colours for the STEP sample (9 of 9 faces) and for the IGES sample (6 of 6 faces). The BREP sample has no colours in its source.

Limits:

- The samples are small, from 11 KB to 18 KB. The trial does not measure read time or memory for a large model.
- Bun reports a peak `heapUsed` of about 62 MB. Node reports about 9 MB to 11 MB. The cause of the difference is not measured.
- The numbers come from CI only. The local runs are not in the tables.

## Platform and versions

| Item | Value | Source |
|---|---|---|
| `occt-import-js` | 0.0.23, exact pin | `trials/t2-mesh/package.json`, `package-lock.json` |
| Bun | 1.4.4 | `results/bun-version.txt` in each Bun artifact |
| Node | 22.23.4 on all three systems | `results/node-version.txt` in each artifact |
| Windows | `windows-latest`, x64 | `platform` and `arch` in each JSON line |
| Linux | `ubuntu-latest`, x64 | `platform` and `arch` in each JSON line |
| macOS | `macos-latest`, arm64 | `platform` and `arch` in each JSON line |

The JSON lines do not record the exact operating system build.

## Number tables

Every value comes from the artifacts of CI run `41388930082`. Download them with the commands in the last section.

### Table 1: load time and resources, one row per job

"Load" is the time to import the package and to await its factory. The factory loads the WASM file. "Peak heapUsed" is the largest `process.memoryUsage().heapUsed` value sampled after the load and after each read. "maxRSS" is the value of `process.resourceUsage()`, in kilobytes.

| System | Runtime | Job id | Load (ms) | Peak heapUsed (MB) | Peak arrayBuffers (MB) | Peak RSS (MB) | maxRSS (KB) |
|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 125095834691 | 127.1 | 61.90 | 30.57 | 217.5 | 213196 |
| Windows | Node 22.23.4 | 125095834524 | 149.5 | 9.29 | 0.23 | 256.2 | 250596 |
| Linux | Bun 1.4.4 | 125095834791 | 60.4 | 61.88 | 30.57 | 229.5 | 224272 |
| Linux | Node 22.23.4 | 125095834787 | 57.1 | 10.63 | 0.19 | 305.9 | 298692 |
| macOS (arm64) | Bun 1.4.4 | 125095834716 | 54.2 | 61.88 | 30.57 | 184.7 | 180482 |
| macOS (arm64) | Node 22.23.4 | 125095834930 | 41.0 | 8.90 | 0.26 | 325.7 | 318096 |

The WASM file `dist/occt-import-js.wasm` has 7,604,031 bytes. The package on disk has 11,611,468 bytes. These values are the same in all six jobs.

### Table 2: read time, first read and warm median, in ms

Each cell shows "first read / warm median of 20 reads". The first read includes the first call of each reader in the process.

| System | Runtime | Job id | STEP colour | STEP colour, `millimeter` | STEP colour, `meter` | IGES cube | BREP cylinder |
|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 125095834691 | 165.3 / 37.8 | 26.9 / 25.1 | 30.6 / 30.3 | 82.0 / 24.6 | 8.3 / 7.2 |
| Windows | Node 22.23.4 | 125095834524 | 217.9 / 23.7 | 19.6 / 18.4 | 21.4 / 22.6 | 45.1 / 16.1 | 7.3 / 4.6 |
| Linux | Bun 1.4.4 | 125095834791 | 55.1 / 13.9 | 13.8 / 9.2 | 10.7 / 12.1 | 27.7 / 10.0 | 3.3 / 2.4 |
| Linux | Node 22.23.4 | 125095834787 | 243.5 / 24.1 | 20.6 / 19.4 | 44.5 / 25.3 | 48.6 / 19.5 | 8.0 / 5.8 |
| macOS (arm64) | Bun 1.4.4 | 125095834716 | 115.9 / 15.9 | 24.7 / 11.0 | 14.4 / 14.1 | 54.4 / 11.7 | 5.3 / 3.4 |
| macOS (arm64) | Node 22.23.4 | 125095834930 | 152.0 / 21.7 | 30.8 / 28.0 | 36.0 / 27.8 | 46.0 / 18.0 | 6.7 / 5.2 |

### Table 3: structure of each sample

These values are the same in all six jobs.

| Sample | Reader | File bytes | Meshes | Triangles | Faces | Faces with colour | Meshes with colour | Bounding box, x / y / z (units of the output) |
|---|---|---|---|---|---|---|---|---|
| STEP colour, default | `ReadStepFile` | 18322 | 2 | 292 | 9 | 9 | 0 | [-10, 15] / [0, 10] / [0, 10] |
| STEP colour, `millimeter` | `ReadStepFile` | 18322 | 2 | 292 | 9 | 9 | 0 | [-10, 15] / [0, 10] / [0, 10] |
| STEP colour, `meter` | `ReadStepFile` | 18322 | 2 | 292 | 9 | 9 | 0 | [-0.01, 0.015] / [0, 0.01] / [0, 0.01] |
| IGES cube | `ReadIgesFile` | 11421 | 1 | 12 | 6 | 6 | 1 | [-5, 5] / [0, 10] / [-5, 5] |
| BREP cylinder | `ReadBrepFile` | 11166 | 1 | 228 | 3 | 0 | 0 | [-2, 2] / [-1.997, 1.997] / [0, 10] |

The face colour is in `brep_faces[].color`. In the STEP sample, the mesh `color` is `null`.

### Table 4: geometry hash

The geometry hash is the SHA-256 of the mesh position arrays and index arrays, in the order that the reader returns them. The hash is the same in all six jobs for each sample.

| Sample | Geometry SHA-256 |
|---|---|
| STEP colour, default and `millimeter` | `6dd90f00f12cdc43219a85e6ac67c93cb6fb2e04bfdd653b4efa283acb1e5001` |
| STEP colour, `meter` | `8a05e0d4fa9bf4c37d513bde8d0524f3aa8990a2c570e343f8c637081715e11c` |
| IGES cube | `ae2485d1d669fba3c3c0ed63782a75f5b284386456ea863d53c15294f56928f9` |
| BREP cylinder | `315a2e2333adad7c68569607f7485d3618900126c52cf361394f215c80534ddf` |

The default and `millimeter` hashes are equal. That result shows that `millimeter` is the default unit.

### Table 5: samples

| Sample file | Source | Licence | SHA-256 | Size (bytes) |
|---|---|---|---|---|
| `samples/red_cube_blue_cylinder.step` | `CadQuery/cadquery` at `60e107a6a99fb4cdf405b9c180cb00f8ea0a569b`, path `tests/testdata/red_cube_blue_cylinder.step` | Apache-2.0 (the repository LICENSE file) | `1fd5c7d9325bcfb9863365faf84554f89e7e7a5e86760a0fc8d5db00619d9ef5` | 18322 |
| `samples/cube-10x10mm.igs` | `kovacsv/occt-import-js` at `45619237ab5576f190f11a7c66f76ad93c5690fb`, path `test/testfiles/cube-10x10mm/Cube 10x10.igs` | LGPL-2.1 (the repository LICENSE.md file) | `8bcbc86a044f592ba2a1a18f89a905358a85aa5093c0dd0756771b1b022b4c6f` | 11421 |
| `samples/cylinder1.brep` | `FreeCAD/FreeCAD` at `46ec224b04e20f682f1fa179b4ede39ebf43b3fc`, path `data/tests/ModelRefineTests/cylinder1.brep` | LGPL-2.1 (the repository LICENSE file) | `0b167ee0ffa6d587c411080cc32f2aaf44036fd40c85ca4161687e9e2af06dad` | 11166 |

The file `samples/red_cube_blue_cylinder.step` has nine colour entities. The file `samples/cube-10x10mm.igs` has the name "Cube 10x10" in its header. The file `samples/cylinder1.brep` has the topology header "CASCADE Topology V1".

The file `samples/*` is marked `binary` in `trials/t2-mesh/.gitattributes`. Git does not change its line endings.

## Commands that repeat the run

From the repository root:

```sh
cd trials/t2-mesh
npm ci --no-audit --no-fund
bun measure.mjs > bun.jsonl
node measure.mjs > node.jsonl
```

The script reads `samples.json`, checks the SHA-256 of each sample, and prints one JSON object per line. The lines have the kinds `load`, `read` and `summary`.

The CI workflow is `.github/workflows/trial-t2.yml`. It runs on a push to `trial/t2-mesh`. Download the artifacts of the run with:

```sh
gh run download 41388930082 -R danielsimonjr/sciengjs
```

Job ids of run `41388930082`: Windows Node `125095834524`, Windows Bun `125095834691`, Linux Node `125095834787`, Linux Bun `125095834791`, macOS Node `125095834930`, macOS Bun `125095834716`. All six jobs ended with the result `success`.

## Deviations

1. The script sends the messages of the WASM to an array. The messages are not written to stdout. In all six jobs the array holds 42 messages. The distinct texts are "Total number of loaded entities 36." and an empty string. The trial does not record which read writes each message.
2. The IGES sample has the file name `cube-10x10mm.igs`. The source name is `Cube 10x10.igs`. The space is removed. The bytes are not changed. The SHA-256 is the SHA-256 of the source file.
3. The IGES sample has no licence text of its own. The licence in table 5 is the licence of the repository. The header of the file names "Autodesk Inventor 2019" as the writer. The trial does not check this origin further.
4. The STEP sample uses the Apache-2.0 licence text of the repository. The GitHub API reports the licence as `NOASSERTION`. The LICENSE file names the Apache Public License, version 2.0.
5. The peak heap is a sampled value. The script samples after the load and after each read. The peak between two samples is not measured.
6. Node 22 runs only in CI. The local runs of the trial used Node v26.13.0 and Bun 1.4.4 during development. Their numbers are not in this report.
7. The options of the STEP sample are `null` (default), `{"linearUnit":"millimeter"}` and `{"linearUnit":"meter"}`. The IGES and BREP samples use `null`.
