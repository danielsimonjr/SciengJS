# T2 mesh: trial report

## Question

Does `occt-import-js` read a STEP file, an IGES file and a BREP file under Bun 1.4.4 and under Node 22, on Windows, Linux and macOS?

Exit numbers:

- The memory before the import, after the import and after the factory. These show the cost of the WASM load.
- The WASM load time.
- The read time of each sample: the first read and the warm median. Small samples use 20 warm reads. The large sample uses 5.
- The triangle count and the mesh count of each sample.
- The peak heap and the peak RSS, for the run and for each sample.
- The package size on disk, and the WASM file size.
- The effect of the option `linearUnit` on the coordinates of one STEP sample.
- Whether the reader returns the face colours of a sample.
- Whether the reader reads a STEP file of realistic size (1 MB to 20 MB).

Design sources: `docs/superpowers/specs/2026-11-01-scieng-engine-design.md`, sections "mesh" and "STEP, IGES, BREP".

## Verdict

**The trial holds. The design can use `occt-import-js` 0.0.23 for STEP, IGES and BREP input.**

- All six CI jobs read all four samples: three small files and one large STEP file. Each job ended with the result `success`. The numbers come from CI run `41389917486`, head commit `6845c68`.
- The geometry hash of each sample is the same in all six jobs (table 5). This includes the large file.
- The option `linearUnit` works as the design states. The default is `millimeter`. The value `meter` divides the coordinates by 1000.
- The reader returns face colours for the STEP sample (9 of 9 faces) and for the IGES sample (6 of 6 faces). The BREP sample has no colours in its source. The large STEP sample has no face colours.
- The large STEP sample (1,793,282 bytes, 8,772 triangles) reads in about 0.75 s to 1.3 s per read under both runtimes. Its warm median is 5 reads on each job.

Limits:

- The Bun `heapUsed` value is about 62 MB to 67 MB. The Node value is about 9 MB to 20 MB. Table 1 shows that the WASM instance accounts for about 30 MB in Bun at the factory. The second rise to about 62 MB happens during the reads. The cause of the second rise is not identified (section "Memory").
- The Node RSS is higher than the Bun RSS during the reads. The cause is not measured.
- Only one large file is measured. The large file is 1.8 MB. No file of 20 MB is measured.
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

Every value comes from the artifacts of CI run `41389917486`. Download them with the commands in the last section.

### Table 1: memory before and after the load, and the load time

Each memory cell shows "heapUsed / RSS" in MB. The third column adds the external array buffers, in MB, as `arrayBuffers`. "Before import" is the first measurement in the process. "After factory" is after the `await` of the package factory.

| System | Runtime | Job id | Before import | After import | After factory | Load (ms) | Peak heapUsed / peak RSS, run (MB) | maxRSS (KB) |
|---|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 125098816511 | 1.6 / 22.1 | 1.6 / 26.3 | 31.5 / 124.0 / arrayBuffers 30.0 | 116.1 | 66.9 / 234.8 | 238676 |
| Windows | Node 22.23.4 | 125098816841 | 5.1 / 32.7 | 5.5 / 42.0 | 6.9 / 54.2 / arrayBuffers 0.0 | 118.1 | 19.1 / 256.5 | 250548 |
| Linux | Bun 1.4.4 | 125098816808 | 1.5 / 23.1 | 1.6 / 28.4 | 31.5 / 127.7 / arrayBuffers 30.0 | 99.5 | 66.9 / 231.2 | 236856 |
| Linux | Node 22.23.4 | 125098816779 | 5.0 / 47.5 | 5.3 / 58.5 | 6.7 / 75.4 / arrayBuffers 0.0 | 85.5 | 19.2 / 324.2 | 316564 |
| macOS (arm64) | Bun 1.4.4 | 125098816845 | 1.5 / 7.1 | 1.6 / 11.1 | 31.5 / 100.5 / arrayBuffers 30.0 | 134.8 | 66.8 / 159.4 | 160546 |
| macOS (arm64) | Node 22.23.4 | 125098816755 | 4.7 / 43.4 | 5.1 / 54.9 | 6.5 / 78.4 / arrayBuffers 0.0 | 36.9 | 19.8 / 328.9 | 321184 |

The WASM file `dist/occt-import-js.wasm` has 7,604,031 bytes. The package on disk has 11,611,468 bytes. These values are the same in all six jobs.

### Table 2: read time, first read and warm median, in ms

Each cell shows "first read / warm median". The first read includes the first call of each reader in the process. The large sample has 5 warm reads. The other samples have 20.

| System | Runtime | STEP colour | STEP colour, `millimeter` | STEP colour, `meter` | IGES cube | BREP cylinder | STEP large (1.8 MB) |
|---|---|---|---|---|---|---|---|
| Windows | Bun 1.4.4 | 113.1 / 25.9 | 21.3 / 19.3 | 24.9 / 24.4 | 64.8 / 21.5 | 7.9 / 5.2 | 1296.1 / 994.3 |
| Windows | Node 22.23.4 | 266.7 / 29.1 | 24.3 / 25.0 | 29.4 / 30.9 | 56.8 / 22.1 | 9.1 / 6.2 | 1322.0 / 1318.2 |
| Linux | Bun 1.4.4 | 127.8 / 26.1 | 19.9 / 17.3 | 18.5 / 19.7 | 48.4 / 17.3 | 5.8 / 4.5 | 1098.6 / 1054.4 |
| Linux | Node 22.23.4 | 117.9 / 16.9 | 16.9 / 14.6 | 20.9 / 17.9 | 32.8 / 13.3 | 5.2 / 3.8 | 768.6 / 751.7 |
| macOS (arm64) | Bun 1.4.4 | 222.1 / 32.9 | 28.1 / 17.8 | 23.2 / 19.3 | 48.7 / 21.9 | 10.2 / 6.5 | 1081.2 / 900.7 |
| macOS (arm64) | Node 22.23.4 | 272.1 / 23.7 | 16.9 / 18.3 | 22.4 / 23.7 | 43.3 / 16.2 | 7.7 / 5.2 | 1210.5 / 1096.2 |

### Table 3: peak heapUsed and peak RSS of each sample, in MB

Each cell shows "peak heapUsed / peak RSS" for the reads of one sample. The values are the largest values sampled during that sample. They are not the peaks between two samples.

| Sample | Windows Bun | Windows Node | Linux Bun | Linux Node | macOS Bun | macOS Node |
|---|---|---|---|---|---|---|
| STEP colour | 31.5 / 215.8 | 8.8 / 232.0 | 31.5 / 206.8 | 8.9 / 227.0 | 31.5 / 144.9 | 8.3 / 286.1 |
| STEP colour, `millimeter` | 31.5 / 195.1 | 9.1 / 256.5 | 31.5 / 198.2 | 8.9 / 305.9 | 31.5 / 159.4 | 8.5 / 316.9 |
| STEP colour, `meter` | 61.9 / 215.3 | 9.1 / 249.8 | 61.9 / 218.8 | 9.0 / 316.5 | 61.9 / 147.8 | 8.7 / 317.3 |
| IGES cube | 61.9 / 214.3 | 9.0 / 83.3 | 61.9 / 211.8 | 8.5 / 324.2 | 61.9 / 148.3 | 8.8 / 321.7 |
| BREP cylinder | 61.9 / 215.2 | 9.3 / 74.1 | 61.9 / 209.2 | 10.6 / 252.4 | 61.9 / 148.5 | 8.9 / 297.0 |
| STEP large (1.8 MB) | 66.9 / 234.8 | 19.1 / 109.0 | 66.9 / 231.2 | 19.2 / 280.3 | 66.8 / 158.6 | 19.8 / 328.9 |

The Bun heapUsed value changes from about 31.5 MB to about 61.9 MB during the third STEP sample. The value does not fall again in the run.

### Table 4: structure of each sample

These values are the same in all six jobs.

| Sample | Reader | File bytes | Meshes | Triangles | Faces | Faces with colour | Meshes with colour | Bounding box, x / y / z (units of the output) |
|---|---|---|---|---|---|---|---|---|
| STEP colour, default | `ReadStepFile` | 18322 | 2 | 292 | 9 | 9 | 0 | [-10, 15] / [0, 10] / [0, 10] |
| STEP colour, `millimeter` | `ReadStepFile` | 18322 | 2 | 292 | 9 | 9 | 0 | [-10, 15] / [0, 10] / [0, 10] |
| STEP colour, `meter` | `ReadStepFile` | 18322 | 2 | 292 | 9 | 9 | 0 | [-0.01, 0.015] / [0, 0.01] / [0, 0.01] |
| IGES cube | `ReadIgesFile` | 11421 | 1 | 12 | 6 | 6 | 1 | [-5, 5] / [0, 10] / [-5, 5] |
| BREP cylinder | `ReadBrepFile` | 11166 | 1 | 228 | 3 | 0 | 0 | [-2, 2] / [-1.997, 1.997] / [0, 10] |
| STEP large | `ReadStepFile` | 1793282 | 1 | 8772 | 37 | 0 | 0 | [3.125, 8.145] / [2.5, 4] / [0, 2] |

The face colour is in `brep_faces[].color`. In the STEP sample, the mesh `color` is `null`.

### Table 5: geometry hash

The geometry hash is the SHA-256 of the mesh position arrays and index arrays, in the order that the reader returns them. The hash is the same in all six jobs for each sample.

| Sample | Geometry SHA-256 |
|---|---|
| STEP colour, default and `millimeter` | `6dd90f00f12cdc43219a85e6ac67c93cb6fb2e04bfdd653b4efa283acb1e5001` |
| STEP colour, `meter` | `8a05e0d4fa9bf4c37d513bde8d0524f3aa8990a2c570e343f8c637081715e11c` |
| IGES cube | `ae2485d1d669fba3c3c0ed63782a75f5b284386456ea863d53c15294f56928f9` |
| BREP cylinder | `315a2e2333adad7c68569607f7485d3618900126c52cf361394f215c80534ddf` |
| STEP large | `dfc14d1d39a5fc1c79fe6eef76e12f9dc9c26bcced805c0d07f05bc8bda6174d` |

The default and `millimeter` hashes are equal. That result shows that `millimeter` is the default unit.

### Table 6: samples

The three small samples are committed in `trials/t2-mesh/samples/`. The licence texts are in `trials/t2-mesh/samples/LICENSES/`. The file `trials/t2-mesh/samples/README.md` maps each file to its source, commit, path, licence and copyright holder.

| Sample file | Source | Licence | SHA-256 | Size (bytes) |
|---|---|---|---|---|
| `samples/red_cube_blue_cylinder.step` | `CadQuery/cadquery` at `60e107a6a99fb4cdf405b9c180cb00f8ea0a569b`, path `tests/testdata/red_cube_blue_cylinder.step` | Apache-2.0 | `1fd5c7d9325bcfb9863365faf84554f89e7e7a5e86760a0fc8d5db00619d9ef5` | 18322 |
| `samples/cube-10x10mm.igs` | `kovacsv/occt-import-js` at `45619237ab5576f190f11a7c66f76ad93c5690fb`, path `test/testfiles/cube-10x10mm/Cube 10x10.igs` | LGPL-2.1 | `8bcbc86a044f592ba2a1a18f89a905358a85aa5093c0dd0756771b1b022b4c6f` | 11421 |
| `samples/cylinder1.brep` | `FreeCAD/FreeCAD` at `46ec224b04e20f682f1fa179b4ede39ebf43b3fc`, path `data/tests/ModelRefineTests/cylinder1.brep` | LGPL-2.0-or-later | `0b167ee0ffa6d587c411080cc32f2aaf44036fd40c85ca4161687e9e2af06dad` | 11166 |

The large sample is not committed. The workflow downloads the file at the start of each job from `Open-Cascade-SAS/OCCT` at commit `7fd59977dfb3a75f75670474b59dfc0f3f5f90ba`, path `data/step/linkrods.step`. The job fails if the SHA-256 differs.

| Sample file | Source | Licence | SHA-256 | Size (bytes) |
|---|---|---|---|---|
| `samples-large/linkrods.step` (downloaded, not committed) | `Open-Cascade-SAS/OCCT` at `7fd59977dfb3a75f75670474b59dfc0f3f5f90ba`, path `data/step/linkrods.step` | LGPL-2.1 (repository licence) | `3674e4b01ee0e983c81ed170f0574cda201ad08e0f7b46e05e4f4613400fd5f7` | 1793282 |

Licence texts are in `trials/t2-mesh/samples/LICENSES/`. The Apache-2.0 text comes from the CadQuery repository. The LGPL-2.1 texts come from the occt-import-js and OCCT repositories. The LGPL-2.0 text comes from the FreeCAD repository. The file `THIRD_PARTY_NOTICES.md` names the samples.

### Search for an IGES file with a clear origin

The trial searched these sources for another IGES file:

- The occt-import-js test files. Only the cube sample exists.
- The CadQuery and FreeCAD trees. They hold no IGES file.
- The OCCT data folder. It holds two IGES files, with a header that names MATRA-DATAVISION as the writer. Both are larger than the small sample range.
- A code search for IGES files. The results were test files of other projects. The `f3d-app/f3d` files are Git LFS pointers and were not checked further.

No IGES file with a clearer origin was found. The occt-import-js cube file stays. Its header names "Autodesk Inventor 2019" as the writer. The file is a test file of the occt-import-js project, and its repository licence applies.

## Memory

The Bun and Node peak values differ, as table 3 shows. The baseline in table 1 explains part of the gap.

- Before the import, both runtimes hold about 1.5 MB (Bun) or about 5 MB (Node) of heapUsed.
- The factory adds about 30 MB of `arrayBuffers` under Bun. That value is the WASM linear memory. Under Node, the same memory does not appear in `arrayBuffers`. Under Node, the heapUsed value rises by about 1.8 MB and the RSS rises by about 22 MB to 35 MB.
- Under Bun, heapUsed rises to about 31.5 MB at the factory. Under Bun, heapUsed rises to about 61.9 MB during the reads. The reads do not increase the heap after the second rise.
- Local probes on the development host used `Bun.gc(true)` after the factory. Those probes show heapUsed of about 61 MB after the collection. A fresh Bun process without the module shows heapUsed of 0.13 MB after the same collection. The second rise is therefore tied to the module, not to the runtime.
- The cause of the second rise is not identified. The trial does not measure the Bun allocator or the WASM memory layout.
- The RSS shows a different pattern. During the reads, the Node RSS peak is higher than the Bun RSS peak. The Node peak is 250 MB to 330 MB. The Bun peak is 145 MB to 235 MB. The cause is not measured.

The conclusion is partial. The WASM memory explains about 30 MB of the Bun figure at the factory. The rise to about 62 MB during the reads is not explained.

## Commands that repeat the run

From the repository root:

```sh
cd trials/t2-mesh
npm ci --no-audit --no-fund
mkdir -p samples-large
curl --fail --location https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/7fd59977dfb3a75f75670474b59dfc0f3f5f90ba/data/step/linkrods.step --output samples-large/linkrods.step
bun measure.mjs > bun.jsonl
node measure.mjs > node.jsonl
```

The script reads `samples.json`, checks the SHA-256 of each sample, and prints one JSON object per line. The lines have the kinds `baseline`, `load`, `read` and `summary`.

The CI workflow is `.github/workflows/trial-t2.yml`. It runs on a push to `trial/t2-mesh`. Download the artifacts of the run with:

```sh
gh run download 41389917486 -R danielsimonjr/sciengjs
```

Job ids of run `41389917486`: Windows Bun `125098816511`, Windows Node `125098816841`, Linux Bun `125098816808`, Linux Node `125098816779`, macOS Bun `125098816845`, macOS Node `125098816755`. All six jobs ended with the result `success`.

## Deviations

1. The script stores the WASM messages in an array. The messages are not written to stdout. In all six jobs the array holds 42 messages. The distinct texts are "Total number of loaded entities 36." and an empty string. The trial does not record which read operation writes each message.
2. The IGES sample has the file name `cube-10x10mm.igs`. The source name is `Cube 10x10.igs`. The space is removed. The bytes are not changed. The SHA-256 is the SHA-256 of the source file.
3. The IGES sample has no licence text of its own. The repository licence applies. The header of the file names "Autodesk Inventor 2019" as the writer.
4. The OCCT commit of the large sample has no licence file at its root. The LGPL-2.1 text in `samples/LICENSES/LGPL-2.1.occt.txt` comes from a later commit of the same repository, `53706f78a8640c4407bdcc6752df13a270b159f2`.
5. The peak values are sampled values. The script reads the memory after the load and after each read. The peak between two samples is not measured.
6. Node 22 runs only in CI. The local runs of the trial used Node v26.13.0 and Bun 1.4.4 during development. Their numbers are not in this report.
7. The options of the STEP sample are `null` (default), `{"linearUnit":"millimeter"}` and `{"linearUnit":"meter"}`. The IGES, BREP and large STEP samples use `null`.
8. The large sample uses 5 warm reads. The small samples use 20. The brief set this count.
9. The Node RSS peak during the reads is high in the CI runs. The trial does not measure the cause.
