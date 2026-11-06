/**
 * `cad` to `md`: a report of the design for manufacture (design section "CAD"). Each model has a known answer
 * that the test computes by hand: a support area, a tilted face, a wall thickness.
 */
import { describe, expect, test } from "bun:test";
import { render as renderDfm } from "../../src/mesh/backend-dfm.ts";
import { findPair } from "../../src/pairs.ts";
import type { WorkerJob } from "../../src/worker/protocol.ts";
import { rejectionOf } from "../support/rejections.ts";
import { testSettings } from "../support/settings.ts";

const request = (model: unknown, options: Record<string, unknown> = {}, settings = testSettings()): WorkerJob["request"] =>
  ({ type: "cad", format: "md", source: JSON.stringify({ version: 1, segments: 64, model }), options, settings }) as WorkerJob["request"];

/** A 20 x 10 x 2 plate with a through hole of radius 2 at (10, 5). */
const PLATE = {
  type: "difference",
  children: [
    { type: "cube", size: [20, 10, 2] },
    { type: "translate", offset: [10, 5, -1], child: { type: "cylinder", radius: 2, height: 4 } },
  ],
};

/** A 2 x 2 x 5 pillar under a 10 x 10 x 1 slab: the slab underside less the pillar top needs support, 96 mm^2. */
const TEE = {
  type: "union",
  children: [
    { type: "translate", offset: [4, 4, 0], child: { type: "cube", size: [2, 2, 5] } },
    { type: "translate", offset: [0, 0, 5], child: { type: "cube", size: [10, 10, 1] } },
  ],
};

/** A 10 mm cube tilted 30 degrees about X: the bottom face is 60 degrees and one side face 30 degrees from the vertical. */
const TILTED = { type: "translate", offset: [0, 0, 20], child: { type: "rotate", angles: [30, 0, 0], child: { type: "cube", size: [10, 10, 10] } } };

/** A 20 x 10 x 10 cup with walls and a floor of the given thickness. */
const cup = (wall: number) => ({
  type: "difference",
  children: [
    { type: "cube", size: [20, 10, 10] },
    { type: "translate", offset: [wall, wall, wall], child: { type: "cube", size: [20 - 2 * wall, 10 - 2 * wall, 20] } },
  ],
});

const text = async (req: WorkerJob["request"]): Promise<string> => new TextDecoder().decode((await renderDfm(req)).bytes);

/** The rows of every Markdown table in the report, each row a list of trimmed cells. */
function rows(md: string): string[][] {
  return md
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("| ---"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()));
}

const row = (md: string, name: string): string[] => {
  const found = rows(md).find((r) => r[0] === name);
  expect(found).toBeDefined();
  return found!;
};

/** The first number in a cell. */
const num = (cell: string): number => Number(/-?\d+(\.\d+)?/.exec(cell)![0]);

describe("cad to md (design for manufacture)", () => {
  test("the design lists the pair", () => {
    expect(findPair("cad", "md")).toEqual({ type: "cad", format: "md", stage: "mesh" });
  });

  test("the measures are the bounding box, the volume and the surface area", async () => {
    const md = await text(request(PLATE));
    expect(md.startsWith("# Design for manufacture\n")).toBe(true);
    expect(row(md, "Size (X x Y x Z)")[1]).toBe("20 x 10 x 2 mm");
    const hole = 0.5 * 64 * 4 * Math.sin((2 * Math.PI) / 64);
    expect(num(row(md, "Volume")[1]!)).toBeCloseTo((200 - hole) * 2, 2);
    const perimeter = 64 * 2 * 2 * Math.sin(Math.PI / 64);
    expect(num(row(md, "Surface area")[1]!)).toBeCloseTo(2 * (200 - hole) + 60 * 2 + perimeter * 2, 2);
  });

  test("a plate on the bed needs no support, and its walls pass at the default minimum wall", async () => {
    const md = await text(request(PLATE));
    expect(row(md, "Overhang").slice(1)).toEqual(["pass", "0 mm² needs support", "45° from the vertical"]);
    expect(row(md, "Minimum wall").slice(1, 2)).toEqual(["pass"]);
    expect(row(md, "Minimum wall")[3]).toBe("0.8 mm");
  });

  test("the underside of a slab on a pillar needs support; the bottom of the pillar stands on the bed", async () => {
    const md = await text(request(TEE));
    const overhang = row(md, "Overhang");
    expect(overhang[1]).toBe("fail");
    expect(num(overhang[2]!)).toBeCloseTo(96, 3);
  });

  test("a support area of less than 1 mm² still fails the overhang check", async () => {
    const ledge = {
      type: "union",
      children: [
        { type: "cube", size: [2, 2, 5] },
        { type: "translate", offset: [0, 0, 5], child: { type: "cube", size: [2.2, 2, 1] } },
      ],
    };
    const overhang = row(await text(request(ledge)), "Overhang");
    expect(overhang[1]).toBe("fail");
    expect(num(overhang[2]!)).toBeCloseTo(0.4, 3);
  });

  test("the overhang angle decides which tilted faces need support", async () => {
    const at = async (overhang: number) => num(row(await text(request(TILTED, { overhang })), "Overhang")[2]!);
    expect(await at(25)).toBeCloseTo(200, 3);
    expect(await at(45)).toBeCloseTo(100, 3);
    expect(await at(70)).toBeCloseTo(0, 3);
  });

  test("a cup with 0.5 mm walls fails the 0.8 mm wall check and passes a 0.4 mm check", async () => {
    const thin = await text(request(cup(0.5)));
    expect(row(thin, "Minimum wall")[1]).toBe("fail");
    expect(thin).toContain("\n## Thin walls\n");
    expect(row(await text(request(cup(0.5), { minWall: 0.4 })), "Minimum wall")[1]).toBe("pass");
    const thick = await text(request(cup(2)));
    expect(row(thick, "Minimum wall")[1]).toBe("pass");
    expect(thick).not.toContain("## Thin walls");
  });

  test("the sections on X and Y find a plate that is thin along Z", async () => {
    const md = await text(request(PLATE, { minWall: 2.5 }));
    const wall = row(md, "Minimum wall");
    expect(wall[1]).toBe("fail");
    const thin = md.split("## Thin walls")[1]!;
    // The first section is at the centre of the first of 32 bands: 20 / 64 = 0.3125 mm.
    expect(thin).toMatch(/^- X = 0\.313 mm: 20 mm² thin$/m);
    expect(thin).toMatch(/^- Y = /m);
    expect(thin).not.toMatch(/^- Z = /m);
  });

  test("a wall far thinner than a quarter of the minimum wall fails; a wall equal to the minimum wall passes", async () => {
    for (const wall of [0.05, 0.1]) expect(row(await text(request(cup(wall))), "Minimum wall")[1]).toBe("fail");
    expect(row(await text(request(cup(0.8))), "Minimum wall")[1]).toBe("pass");
  });

  test("a fin 0.3 mm thick on a block shows in the Y and Z sections at known positions, not in the X sections", async () => {
    const fin = {
      type: "union",
      children: [
        { type: "cube", size: [20, 10, 5] },
        { type: "translate", offset: [18, 0, 5], child: { type: "cube", size: [0.3, 10, 5] } },
      ],
    };
    const md = await text(request(fin));
    // Z sections above the block: 16 of 32 bands of 10 / 32 mm. Y sections: all 32. The fin is 0.3 mm on X.
    expect(row(md, "Minimum wall")[2]).toBe("48 of 96 sections have a thin region");
    const thin = md.split("## Thin walls")[1]!;
    expect(thin).not.toMatch(/^- X = /m);
    expect(thin).toMatch(/^- Y = 0\.156 mm: 1\.49\d mm² thin$/m);
    expect(thin).toMatch(/^- Z = 5\.156 mm: 3 mm² thin$/m);
    expect(thin).toMatch(/^- and 22 more sections on Y$/m);
    expect(thin).toMatch(/^- and 6 more sections on Z$/m);
  });

  test("a model with no solid rejects with E_INPUT", async () => {
    const empty = {
      type: "intersection",
      children: [
        { type: "cube", size: [1, 1, 1] },
        { type: "translate", offset: [5, 0, 0], child: { type: "cube", size: [1, 1, 1] } },
      ],
    };
    expect(await rejectionOf(renderDfm(request(empty)))).toMatchObject({ code: "E_INPUT", message: "the model holds no solid" });
  });

  test("an unknown option or a value out of range rejects with E_INPUT", async () => {
    expect(await rejectionOf(renderDfm(request(PLATE, { z: 1 })))).toMatchObject({ code: "E_INPUT", message: "cad to md takes no option z" });
    for (const overhang of [0, 90, -5, "45", Number.NaN]) {
      expect(await rejectionOf(renderDfm(request(PLATE, { overhang })))).toMatchObject({
        code: "E_INPUT",
        message: "option overhang must be a number larger than 0 and smaller than 90",
      });
    }
    for (const minWall of [0, -1, "1", Number.POSITIVE_INFINITY]) {
      expect(await rejectionOf(renderDfm(request(PLATE, { minWall })))).toMatchObject({
        code: "E_INPUT",
        message: "option minWall must be a finite number larger than 0",
      });
    }
  });

  test("the same model gives the same bytes, and a model with a colour gives no warning", async () => {
    const a = await renderDfm(request({ ...TEE, color: [1, 0, 0] }));
    const b = await renderDfm(request({ ...TEE, color: [1, 0, 0] }));
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
    expect(a.warnings).toBeUndefined();
  });

  test("a model over maxCadFacets rejects with E_LIMIT", async () => {
    const err = await rejectionOf(renderDfm(request(PLATE, {}, { ...testSettings(), maxCadFacets: 10 })));
    expect(err).toMatchObject({ code: "E_LIMIT" });
  });
});
