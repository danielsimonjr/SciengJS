# Trial T2 sample files

These files are test data for trial T2 (mesh). They are not part of the engine package.

## Files

| File | Format | Source repository | Commit | Path in the repository | Licence | Copyright holder | SHA-256 |
|---|---|---|---|---|---|---|---|
| `red_cube_blue_cylinder.step` | STEP | `CadQuery/cadquery` | `60e107a6a99fb4cdf405b9c180cb00f8ea0a569b` | `tests/testdata/red_cube_blue_cylinder.step` | Apache-2.0 (`LICENSES/Apache-2.0.cadquery.txt`) | Parametric Products Intellectual Holdings, LLC (the copyright line in the repository licence file) | `1fd5c7d9325bcfb9863365faf84554f89e7e7a5e86760a0fc8d5db00619d9ef5` |
| `cube-10x10mm.igs` | IGES | `kovacsv/occt-import-js` | `45619237ab5576f190f11a7c66f76ad93c5690fb` | `test/testfiles/cube-10x10mm/Cube 10x10.igs` (renamed here) | LGPL-2.1 (`LICENSES/LGPL-2.1.occt-import-js.md`), the repository licence | The occt-import-js project. The repository names no separate holder for this file | `8bcbc86a044f592ba2a1a18f89a905358a85aa5093c0dd0756771b1b022b4c6f` |
| `cylinder1.brep` | BREP | `FreeCAD/FreeCAD` | `46ec224b04e20f682f1fa179b4ede39ebf43b3fc` | `data/tests/ModelRefineTests/cylinder1.brep` | LGPL-2.0-or-later (`LICENSES/LGPL-2.0.freecad.txt`), the repository licence. See the licence statements below | The FreeCAD project. The repository names no separate holder for this file | `0b167ee0ffa6d587c411080cc32f2aaf44036fd40c85ca4161687e9e2af06dad` |

The file `cube-10x10mm.igs` has the header writer "Autodesk Inventor 2019". The file is a test file of the occt-import-js repository. The repository licence applies to the file. The file has no licence of its own.

The large STEP sample `linkrods.step` is not in git. The trial downloads it into `samples-large/` at the job start, from the URL in `samples.json`. The file is shown here for the record only.

| File | Source repository | Commit | Path | Licence | Originator named in the file | SHA-256 | Size (bytes) |
|---|---|---|---|---|---|---|---|
| `samples-large/linkrods.step` (not committed) | `Open-Cascade-SAS/OCCT` | `7fd59977dfb3a75f75670474b59dfc0f3f5f90ba` | `data/step/linkrods.step` | LGPL-2.1 (`LICENSES/LGPL-2.1.occt.txt`, from the repository at `53706f78a8640c4407bdcc6752df13a270b159f2`) | MATRA-DATAVISION (the file header). The copyright holder is not stated | `3674e4b01ee0e983c81ed170f0574cda201ad08e0f7b46e05e4f4613400fd5f7` | 1793282 |

The OCCT commit `7fd59977` has no licence file at its root. The licence text comes from the same repository at a later commit.

## Licence texts

| File | Source | Commit | SHA-256 |
|---|---|---|---|
| `LICENSES/Apache-2.0.cadquery.txt` | `CadQuery/cadquery` `LICENSE` | `60e107a6a99fb4cdf405b9c180cb00f8ea0a569b` | `dcbd92ef5aed869b740fc8e7272555ed9e2456d42a46b9f2c1c82389ffd3555f` |
| `LICENSES/LGPL-2.1.occt-import-js.md` | `kovacsv/occt-import-js` `LICENSE.md` | `45619237ab5576f190f11a7c66f76ad93c5690fb` | `20c17d8b8c48a600800dfd14f95d5cb9ff47066a9641ddeab48dc54aec96e331` |
| `LICENSES/LGPL-2.0.freecad.txt` | `FreeCAD/FreeCAD` `copying.lib` (GNU Library General Public License, Version 2, June 1991) | `46ec224b04e20f682f1fa179b4ede39ebf43b3fc` | `1e9e036b55d0959c9df8434c37adacfab318dd181a0c3df38e9df29c5bc7a706` |
| `LICENSES/LGPL-2.1.occt.txt` | `Open-Cascade-SAS/OCCT` `LICENSE_LGPL_21.txt` | `53706f78a8640c4407bdcc6752df13a270b159f2` | `e237fa56668030e928551ddd60f05df5fe957f75eab874bbd017e085ed722e7c` |

## FreeCAD licence statements

The licence of the FreeCAD sample is LGPL-2.0-or-later. The sources state:

- `README` at the repository root: "It is 100% Open Source (LGPL2+ license)".
- `src/App/Application.cpp`, line 7: "it under the terms of the GNU Library General Public License (LGPL)".
- `src/App/Application.cpp`, line 8: "as published by the Free Software Foundation; either version 2 of the License,".
- `src/App/Application.cpp`, line 9: "or (at your option) any later version."
- `copying.lib`, line 2: "GNU LIBRARY GENERAL PUBLIC LICENSE Version 2, June 1991".

The file `cylinder1.brep` has no licence header of its own.

## Search for an IGES file with a clear origin

The trial searched these sources for another IGES file:

- The `occt-import-js` test files hold only `cube-10x10mm`.
- The `CadQuery/cadquery` and `FreeCAD/FreeCAD` trees hold no IGES file.
- The `Open-Cascade-SAS/OCCT` data folder holds two IGES files, `data/iges/hammer.iges` (about 1.04 MB) and `data/iges/bearing.iges` (about 1.28 MB). Their header names MATRA-DATAVISION as the writer, which is the same kind of origin as the current file. Both are larger than the sample size range of the trial.
- A code search for `*.igs` files. The results were test files of other projects. The `f3d-app/f3d` files are Git LFS pointers in the API and were not checked further.

No IGES file with a clearer origin was found. The current file stays.
