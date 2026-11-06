/**
 * `cad` to `dxf`: a 2D drawing of the model (design section "CAD"). The test reads the file with its own group-code
 * reader and measures the contours by the shoelace formula, so it does not trust the writer.
 */
import { describe, expect, test } from "bun:test";
import { render as renderDxf } from "../../src/mesh/backend-dxf.ts";
import { dxfByteLength, writeDxf } from "../../src/mesh/dxf.ts";
import { findPair } from "../../src/pairs.ts";
import { OUTPUT_FORMATS } from "../../src/types.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { rejectionOf } from "../support/rejections.ts";
import { testSettings } from "../support/settings.ts";

const request = (doc: unknown, options: Record<string, unknown> = {}, settings = testSettings()): WorkerJob["request"] =>
  ({ type: "cad", format: "dxf", source: JSON.stringify(doc), options, settings }) as WorkerJob["request"];

/** A 20 x 10 x 2 plate with a through hole of radius 2 at (10, 5), and a 4 x 4 boss of height 3 on top. */
const PLATE = {
  version: 1,
  segments: 64,
  model: {
    type: "union",
    children: [
      {
        type: "difference",
        children: [
          { type: "cube", size: [20, 10, 2] },
          { type: "translate", offset: [10, 5, -1], child: { type: "cylinder", radius: 2, height: 4 } },
        ],
      },
      { type: "translate", offset: [1, 1, 2], child: { type: "cube", size: [4, 4, 3] } },
    ],
  },
};

/** The group-code pairs of an ASCII DXF file. */
function pairs(text: string): [number, string][] {
  const lines = text.split("\r\n");
  expect(lines.at(-1)).toBe("");
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([Number(lines[i]!.trim()), lines[i + 1]!]);
  return out;
}

/** The closed polylines of the ENTITIES section, each a list of [x, y] points. */
function polylines(text: string): { closed: boolean; layer: string; points: number[][] }[] {
  const all = pairs(text);
  const result: { closed: boolean; layer: string; points: number[][] }[] = [];
  let current: { closed: boolean; layer: string; points: number[][] } | undefined;
  let point: number[] | undefined;
  let entity = "";
  for (const [code, value] of all) {
    if (code === 0) {
      entity = value;
      if (value === "POLYLINE") result.push((current = { closed: false, layer: "", points: [] }));
      if (value === "VERTEX") current!.points.push((point = [NaN, NaN]));
      continue;
    }
    if (entity === "POLYLINE" && code === 70) current!.closed = (Number(value) & 1) === 1;
    if (entity === "POLYLINE" && code === 8) current!.layer = value;
    if (entity === "VERTEX" && code === 10) point![0] = Number(value);
    if (entity === "VERTEX" && code === 20) point![1] = Number(value);
  }
  return result;
}

const area = (points: number[][]): number =>
  points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length]!;
    return sum + x! * ny! - nx! * y!;
  }, 0) / 2;

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("cad to dxf", () => {
  test("the design lists the pair and the format", () => {
    expect(OUTPUT_FORMATS).toContain("dxf");
    expect(findPair("cad", "dxf")).toEqual({ type: "cad", format: "dxf", stage: "mesh" });
  });

  test("the file is R12 ASCII DXF with a header, an entities section and an end of file", async () => {
    const out = text((await renderDxf(request(PLATE))).bytes);
    const codes = pairs(out);
    expect(codes.slice(0, 4)).toEqual([[0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1009"]]);
    expect(codes).toContainEqual([2, "ENTITIES"]);
    expect(codes.at(-1)).toEqual([0, "EOF"]);
    for (const p of polylines(out)) expect(p.layer).toBe("0");
  });

  test("with no option the drawing is the outline: the plate rectangle and the through hole", async () => {
    const lines = polylines(text((await renderDxf(request(PLATE))).bytes));
    expect(lines.length).toBe(2);
    for (const p of lines) expect(p.closed).toBe(true);
    const areas = lines.map((p) => Math.abs(area(p.points))).sort((a, b) => b - a);
    expect(areas[0]).toBeCloseTo(200, 3);
    expect(areas[1]).toBeCloseTo(Math.PI * 4, 1);
    const xs = lines.flatMap((p) => p.points.map((q) => q[0]!));
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 20]);
  });

  test("option z gives the section at that height", async () => {
    const boss = polylines(text((await renderDxf(request(PLATE, { z: 4 }))).bytes));
    expect(boss.length).toBe(1);
    expect(Math.abs(area(boss[0]!.points))).toBeCloseTo(16, 3);
    const plate = polylines(text((await renderDxf(request(PLATE, { z: 1 }))).bytes));
    expect(plate.length).toBe(2);
  });

  test("a section above the model rejects with E_INPUT", async () => {
    const err = await rejectionOf(renderDxf(request(PLATE, { z: 50 })));
    expect(err).toMatchObject({ code: "E_INPUT" });
    expect((err as Error).message).toBe("the drawing at z = 50 holds no contour");
  });

  test("an unknown option or a z that is not a finite number rejects with E_INPUT", async () => {
    expect(await rejectionOf(renderDxf(request(PLATE, { scale: 2 })))).toMatchObject({ code: "E_INPUT", message: "cad to dxf takes no option scale" });
    expect(await rejectionOf(renderDxf(request(PLATE, { z: "1" })))).toMatchObject({ code: "E_INPUT", message: "option z must be a finite number" });
  });

  test("a model with a colour warns; a model without one does not", async () => {
    const coloured = { ...PLATE, model: { ...PLATE.model, color: [1, 0, 0] } };
    expect((await renderDxf(request(coloured))).warnings).toEqual(["dxf holds no colour and no name; the colours of the model are dropped"]);
    expect((await renderDxf(request(PLATE))).warnings).toBeUndefined();
  });

  test("the same model gives the same bytes", async () => {
    const a = (await renderDxf(request(PLATE))).bytes;
    const b = (await renderDxf(request(PLATE))).bytes;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  test("the size bound is an upper bound of the written size", () => {
    const long = Array.from({ length: 1000 }, (_, i) => [-123456.7891 - i / 7, -0.0000012345678912 * (i + 1)]);
    const contours = [[[0, 0], [123456.789, 0], [-0.000001, -98765.4321]], long];
    expect(writeDxf(contours).byteLength).toBeLessThanOrEqual(dxfByteLength(contours));
  });

  test("an output over maxMemoryMb rejects with E_LIMIT", async () => {
    const err = await rejectionOf(renderDxf(request(PLATE, {}, { ...testSettings(), maxMemoryMb: 0.0001 })));
    expect(err).toMatchObject({ code: "E_LIMIT" });
    expect((err as Error).message).toMatch(/^the dxf output needs \d+ bytes; the limit is \d+ bytes$/);
  });
});
