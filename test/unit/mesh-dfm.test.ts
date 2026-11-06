/**
 * `cad` to `md`: a report of the design for manufacture (design section "CAD"). Each model has a known answer
 * that the test computes by hand: a support area, a tilted face, a wall thickness, a slot width and a gap.
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

/** A cube of the given size turned by the given angles, lifted 20 mm above the bed. */
const turnedCube = (angles: number[], size = 10) => ({ type: "translate", offset: [0, 0, 20], child: { type: "rotate", angles, child: { type: "cube", size: [size, size, size] } } });

/** A 20 x 10 x 10 cup with walls and a floor of the given thickness. */
const cup = (wall: number) => ({
  type: "difference",
  children: [
    { type: "cube", size: [20, 10, 10] },
    { type: "translate", offset: [wall, wall, wall], child: { type: "cube", size: [20 - 2 * wall, 10 - 2 * wall, 20] } },
  ],
});

/** A fin 0.3 mm thick on top of a block: the corners where the fin meets the block are concave, not gaps. */
const FIN = {
  type: "union",
  children: [
    { type: "cube", size: [20, 10, 5] },
    { type: "translate", offset: [18, 0, 5], child: { type: "cube", size: [0.3, 10, 5] } },
  ],
};

/** The plate with a slot of the given width, 3 mm deep, cut into the edge y = 0 at x = 10. */
const slotted = (width: number) => ({
  type: "difference",
  children: [
    { type: "cube", size: [20, 10, 2] },
    { type: "translate", offset: [10 - width / 2, -1, -1], child: { type: "cube", size: [width, 4, 4] } },
  ],
});

/** The plate with a through hole of the given diameter at (10, 5). */
const drilled = (diameter: number) => ({
  ...PLATE,
  children: [PLATE.children[0], { type: "translate", offset: [10, 5, -1], child: { type: "cylinder", radius: diameter / 2, height: 4 } }],
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

  test("a plate on the bed needs no support, and its walls and gaps pass at the defaults", async () => {
    const md = await text(request(PLATE));
    expect(row(md, "Overhang").slice(1)).toEqual(["pass", "0 mm² needs support", "45° from the vertical"]);
    expect(row(md, "Minimum wall").slice(1, 2)).toEqual(["pass"]);
    expect(row(md, "Minimum wall")[3]).toBe("0.8 mm");
    expect(row(md, "Minimum gap").slice(1)).toEqual(["pass", "0 of 96 sections have a narrow gap", "0.5 mm"]);
    expect(md).not.toContain("## Narrow gaps");
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
    const md = await text(request(FIN));
    // Z sections above the block: 16 of 32 bands of 10 / 32 mm. Y sections: all 32. The fin is 0.3 mm on X.
    expect(row(md, "Minimum wall")[2]).toBe("48 of 96 sections have a thin region");
    const thin = md.split("## Thin walls")[1]!;
    expect(thin).not.toMatch(/^- X = /m);
    expect(thin).toMatch(/^- Y = 0\.156 mm: 1\.49\d mm² thin$/m);
    expect(thin).toMatch(/^- Z = 5\.156 mm: 3 mm² thin$/m);
    expect(thin).toMatch(/^- and 22 more sections on Y$/m);
    expect(thin).toMatch(/^- and 6 more sections on Z$/m);
  });

  test("a solid block passes the gap check", async () => {
    const md = await text(request({ type: "cube", size: [10, 10, 10] }));
    expect(row(md, "Minimum gap").slice(1)).toEqual(["pass", "0 of 96 sections have a narrow gap", "0.5 mm"]);
  });

  test("a 0.3 mm slot cut into an edge fails at 0.5 mm and passes at 0.2 mm; the Y and Z sections find it, not the X sections", async () => {
    const md = await text(request(slotted(0.3)));
    expect(row(md, "Minimum gap").slice(1, 3)).toEqual(["fail", "42 of 96 sections have a narrow gap"]);
    const narrow = md.split("## Narrow gaps")[1]!;
    expect(narrow).not.toMatch(/^- X = /m);
    expect(narrow).toMatch(/^- Y = 0\.156 mm: 0\.57\d mm² narrow$/m);
    expect(narrow).toMatch(/^- Z = 0\.031 mm: 0\.89 mm² narrow$/m);
    expect(narrow).toMatch(/^- and 22 more sections on Z$/m);
    expect(narrow).not.toMatch(/more sections on Y/);
    const fine = await text(request(slotted(0.3), { minGap: 0.2 }));
    expect(row(fine, "Minimum gap")[1]).toBe("pass");
    expect(fine).not.toContain("## Narrow gaps");
    expect(row(md, "Minimum wall")[1]).toBe("pass");
  });

  test("a slot equal to the minimum gap passes; a slot narrower by 0.1 mm fails", async () => {
    expect(row(await text(request(slotted(0.5))), "Minimum gap")[1]).toBe("pass");
    const md = await text(request(slotted(0.5), { minGap: 0.6 }));
    expect(row(md, "Minimum gap").slice(1, 3)).toEqual(["fail", "42 of 96 sections have a narrow gap"]);
  });

  test("a hole of diameter 0.4 mm fails: every Z section and the two Y sections that cross it", async () => {
    const md = await text(request(drilled(0.4)));
    expect(row(md, "Minimum gap").slice(1, 3)).toEqual(["fail", "34 of 96 sections have a narrow gap"]);
    const narrow = md.split("## Narrow gaps")[1]!;
    expect(narrow).toMatch(/^- Z = 0\.031 mm: 0\.125 mm² narrow$/m);
    expect(narrow).toMatch(/^- Y = 4\.844 mm: 0\.48\d mm² narrow$/m);
    expect(narrow).not.toMatch(/^- X = /m);
    expect(row(md, "Minimum wall")[1]).toBe("pass");
  });

  test("two blocks 0.3 mm apart fail at 0.5 mm and pass at 0.3 mm", async () => {
    const pair = {
      type: "union",
      children: [
        { type: "cube", size: [5, 5, 5] },
        { type: "translate", offset: [5.3, 0, 0], child: { type: "cube", size: [5, 5, 5] } },
      ],
    };
    const md = await text(request(pair));
    expect(row(md, "Minimum gap").slice(1, 3)).toEqual(["fail", "64 of 96 sections have a narrow gap"]);
    expect(md).toMatch(/^- Y = 0\.078 mm: 1\.479 mm² narrow$/m);
    expect(md).toMatch(/^- Z = 0\.078 mm: 1\.479 mm² narrow$/m);
    expect(row(await text(request(pair, { minGap: 0.3 })), "Minimum gap")[1]).toBe("pass");
  });

  test("a hairline slot 0.01 mm wide fails the gap check; a hairline fin 0.01 mm thick fails the wall check; a 0.3 mm hole fails the gap check", async () => {
    const slit = {
      type: "difference",
      children: [
        { type: "cube", size: [20, 10, 2] },
        { type: "translate", offset: [10 - 0.005, -1, -1], child: { type: "cube", size: [0.01, 4, 4] } },
      ],
    };
    expect(row(await text(request(slit)), "Minimum gap")[1]).toBe("fail");
    const fin = { ...FIN, children: [FIN.children[0], { type: "translate", offset: [18, 0, 5], child: { type: "cube", size: [0.01, 10, 5] } }] };
    expect(row(await text(request(fin)), "Minimum wall")[1]).toBe("fail");
    // A hole of diameter 0.3 mm has no side longer than 0.75 of the minimum gap: the inscribed disc finds it.
    expect(row(await text(request(drilled(0.3))), "Minimum gap")[1]).toBe("fail");
  });

  test("concave corners are not gaps", async () => {
    expect(row(await text(request(TEE)), "Minimum gap")[1]).toBe("pass");
    expect(row(await text(request(FIN)), "Minimum gap")[1]).toBe("pass");
    expect(row(await text(request(cup(2))), "Minimum gap")[1]).toBe("pass");
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
    for (const minGap of [0, -1, "1", Number.POSITIVE_INFINITY]) {
      expect(await rejectionOf(renderDfm(request(PLATE, { minGap })))).toMatchObject({
        code: "E_INPUT",
        message: "option minGap must be a finite number larger than 0",
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

  test("a plain cube turned on one axis has no thin wall and no narrow gap", async () => {
    const md = await text(request(TILTED));
    expect(row(md, "Minimum wall").slice(1, 2)).toEqual(["pass"]);
    expect(row(md, "Minimum wall")[2]).toBe("0 of 96 sections have a thin region");
    expect(row(md, "Minimum gap").slice(1)).toEqual(["pass", "0 of 96 sections have a narrow gap", "0.5 mm"]);
    const at45 = await text(request(turnedCube([45, 0, 0])));
    expect(row(at45, "Minimum wall").slice(1, 2)).toEqual(["pass"]);
    expect(row(at45, "Minimum wall")[2]).toBe("0 of 96 sections have a thin region");
  });

  test("a plain cube turned on two axes passes", async () => {
    for (const angles of [[30, 30, 0], [45, 35.264, 0]]) {
      const md = await text(request(turnedCube(angles)));
      expect(row(md, "Minimum wall").slice(1, 3)).toEqual(["pass", "0 of 96 sections have a thin region"]);
    }
    const small = await text(request(turnedCube([30, 30, 0], 5)));
    expect(row(small, "Minimum wall").slice(1, 3)).toEqual(["pass", "0 of 96 sections have a thin region"]);
  });

  test("a pillar under a slab turned on two axes passes both checks", async () => {
    const md = await text(request({ type: "rotate", angles: [30, 30, 0], child: TEE }));
    expect(row(md, "Minimum wall")[1]).toBe("pass");
    expect(row(md, "Minimum gap")[1]).toBe("pass");
  });

  test("a 2 mm rod lying along X passes the wall check", async () => {
    const rod = { type: "rotate", angles: [0, 90, 0], child: { type: "cylinder", radius: 1, height: 20 } };
    expect(row(await text(request(rod)), "Minimum wall")[1]).toBe("pass");
  });

  test("a cup with 0.5 mm walls turned on one axis still fails the wall check", async () => {
    const md = await text(request({ type: "rotate", angles: [30, 0, 0], child: cup(0.5) }));
    expect(row(md, "Minimum wall")[1]).toBe("fail");
    expect(row(md, "Minimum wall")[2]).toBe("90 of 96 sections have a thin region");
  });

  test("a pair of blocks and a slot turned on two axes still fail the gap check on the Y sections", async () => {
    const pair = {
      type: "union",
      children: [
        { type: "cube", size: [5, 5, 5] },
        { type: "translate", offset: [5.3, 0, 0], child: { type: "cube", size: [5, 5, 5] } },
      ],
    };
    const pairMd = await text(request({ type: "rotate", angles: [30, 30, 0], child: pair }));
    expect(row(pairMd, "Minimum gap")[1]).toBe("fail");
    expect(pairMd).toMatch(/^- Y = /m);
    const slotMd = await text(request({ type: "rotate", angles: [30, 30, 0], child: slotted(0.3) }));
    expect(row(slotMd, "Minimum gap")[1]).toBe("fail");
  });

  test("a 0.3 mm fin 1 mm tall on a block fails in the Y sections and the five Z sections through the fin", async () => {
    const fin = {
      type: "union",
      children: [
        { type: "cube", size: [20, 10, 5] },
        { type: "translate", offset: [18, 0, 5], child: { type: "cube", size: [0.3, 10, 1] } },
      ],
    };
    const md = await text(request(fin));
    expect(row(md, "Minimum wall")[2]).toBe("37 of 96 sections have a thin region");
    expect(md.split("## Thin walls")[1]!).not.toMatch(/^- X = /m);
  });

  test("a tab 0.1 mm thick and 0.5 mm long on a block passes the wall check", async () => {
    const tab = {
      type: "union",
      children: [
        { type: "cube", size: [20, 10, 5] },
        { type: "translate", offset: [20, 4.95, 0], child: { type: "cube", size: [0.5, 0.1, 0.5] } },
      ],
    };
    expect(row(await text(request(tab)), "Minimum wall").slice(1, 3)).toEqual(["pass", "0 of 96 sections have a thin region"]);
  });

  test("a 0.3 mm square pin and a 0.4 mm round pin on a block fail the wall check, square to the axes and turned", async () => {
    const block = { type: "cube", size: [20, 10, 5] };
    const square = { type: "union", children: [block, { type: "translate", offset: [10, 5, 5], child: { type: "cube", size: [0.3, 0.3, 5] } }] };
    const round = { type: "union", children: [block, { type: "translate", offset: [10, 5, 5], child: { type: "cylinder", radius: 0.2, height: 5 } }] };
    expect(row(await text(request(square)), "Minimum wall")[2]).toBe("17 of 96 sections have a thin region");
    for (const pin of [square, round]) {
      expect(row(await text(request(pin)), "Minimum wall")[1]).toBe("fail");
      expect(row(await text(request({ type: "rotate", angles: [20, 30, 0], child: pin })), "Minimum wall")[1]).toBe("fail");
    }
  }, 30000);

  test("a 0.3 mm wall that leans 60 degrees on a block fails the wall check in 53 sections", async () => {
    const lean = {
      type: "union",
      children: [
        { type: "cube", size: [20, 10, 5] },
        { type: "translate", offset: [0, 5, 5], child: { type: "rotate", angles: [60, 0, 0], child: { type: "cube", size: [20, 0.3, 4] } } },
      ],
    };
    expect(row(await text(request(lean)), "Minimum wall").slice(1, 3)).toEqual(["fail", "53 of 96 sections have a thin region"]);
  });

  test("a square hole of 0.3 mm through a plate fails the gap check in 33 sections", async () => {
    const holed = { type: "difference", children: [{ type: "cube", size: [20, 10, 2] }, { type: "translate", offset: [10, 5, -1], child: { type: "cube", size: [0.3, 0.3, 4] } }] };
    expect(row(await text(request(holed)), "Minimum gap").slice(1, 3)).toEqual(["fail", "33 of 96 sections have a narrow gap"]);
  });

  test("a separate 0.3 mm plate 1.5 mm square fails the wall check in the X and Y sections", async () => {
    const md = await text(request({ type: "cube", size: [1.5, 1.5, 0.3] }));
    expect(row(md, "Minimum wall").slice(1, 3)).toEqual(["fail", "64 of 96 sections have a thin region"]);
  });

  test("a short 0.3 mm wall on a block turned on two axes fails the wall check", async () => {
    const wall = { type: "union", children: [{ type: "cube", size: [20, 10, 5] }, { type: "translate", offset: [18, 0, 5], child: { type: "cube", size: [0.3, 0.5, 5] } }] };
    expect(row(await text(request(wall)), "Minimum wall")[1]).toBe("fail");
    expect(row(await text(request({ type: "rotate", angles: [20, 30, 0], child: wall })), "Minimum wall")[1]).toBe("fail");
  });

  test("a 0.3 mm plate turned 60 degrees about X fails the wall check", async () => {
    const plate = { type: "translate", offset: [0, 0, 20], child: { type: "rotate", angles: [60, 0, 0], child: { type: "cube", size: [20, 10, 0.3] } } };
    const md = await text(request(plate));
    expect(row(md, "Minimum wall")[1]).toBe("fail");
    expect(row(md, "Minimum wall")[2]).toBe("96 of 96 sections have a thin region");
  });
});
