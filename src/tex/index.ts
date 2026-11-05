/**
 * The runtime of the TeX stage: the virtual file tree, the host functions of the WASM engine, the run function,
 * the DVI reader with the Type 1 and TFM readers, the dvisvgm specials, and the render that joins them.
 * The registry, the bundle manager and the package detection are not part of this surface.
 */
export { TexTree, treeName, type TreeFile } from "./vfs.ts";
export { TexHost, ExitSignal, type HostOptions } from "./host.ts";
export { runProgram, type RunOptions, type RunResult, type EngineSymbols } from "./run.ts";
export { readTfm, type Tfm } from "./tfm.ts";
export { readType1, decryptType1, type Type1Font, type Type1Glyph } from "./type1.ts";
export { dviToSvg, type DviOptions, type DviSvg, type FontFiles } from "./dvi.ts";
export { createSpecials, SPECIAL_UNIT_PER_PT, type Specials, type SpecialPosition, type SpecialResult } from "./specials.ts";
export { renderTex, type TexEngine, type RenderTexOptions, type RenderTexResult } from "./render.ts";
