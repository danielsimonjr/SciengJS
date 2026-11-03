import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RASTER = fileURLToPath(new URL("../../src/raster/index.ts", import.meta.url)).replaceAll("\\", "/");

// A fresh process shows the first start of the WASM. Other tests in this process have started it already.
const SCRIPT = `
import { svgToPng } from ${JSON.stringify(RASTER)};
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';
const steps = [];
try {
  await svgToPng(svg, { scale: 1, maxMemoryMb: 64, readWasm: () => { throw new Error("no wasm file"); } });
  steps.push("first: resolved");
} catch (err) {
  steps.push("first: " + err.message);
}
try {
  const png = await svgToPng(svg, { scale: 1, maxMemoryMb: 64 });
  steps.push("second: png " + (png.byteLength > 20));
} catch (err) {
  steps.push("second: " + err.message);
}
console.log(JSON.stringify(steps));
`;

describe("svgToPng first start", () => {
  test("a failed start rejects once and does not stay cached: the next render starts the WASM again", () => {
    const run = spawnSync(process.execPath, ["-e", SCRIPT], { encoding: "utf8", timeout: 60000 });
    expect(run.status).toBe(0);
    const steps = JSON.parse(run.stdout.trim().split("\n").pop() as string) as string[];
    expect(steps[0]).toBe("first: no wasm file");
    expect(steps[1]).toBe("second: png true");
  });
});
