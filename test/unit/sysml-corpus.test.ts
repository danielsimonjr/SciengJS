import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSysmlSvg } from "../../src/sysml/render.ts";
import { compareSvg } from "../support/svg-compare.ts";
import { svgProperties, type SysmlApproval } from "../support/sysml-corpus.ts";

const CORPUS = fileURLToPath(new URL("../corpus/sysml", import.meta.url));
const sources = readdirSync(CORPUS).filter((f) => f.endsWith(".sysml")).sort();
const approval = JSON.parse(readFileSync(join(CORPUS, "approval.json"), "utf8")) as SysmlApproval;

/** The structure of each sample, written by hand from the source: the node titles and the edge count. */
const STRUCTURE: Record<string, { nodes: string[]; edges: number }> = {
  "bdd-packages.sysml": { nodes: ["Controller", "Sensor", "Valve"], edges: 2 },
  "bdd-ports-interfaces.sysml": { nodes: ["Tank", "Engine", "Drivetrain", "FuelPort", "PowerPort", "FuelLine"], edges: 2 },
  "bdd-specialization.sysml": { nodes: ["Vehicle", "Car", "Truck", "Pickup"], edges: 3 },
  "bdd-vehicle.sysml": { nodes: ["Vehicle", "Engine", "Wheel", "Seat"], edges: 3 },
  "ibd-inherited.sysml": { nodes: ["part:sensor", "part:logger", "port:uplink"], edges: 2 },
  "ibd-vehicle.sysml": { nodes: ["part:tank", "part:engine", "part:gearbox", "port:refuel", "port:wheels"], edges: 4 },
  "requirements-basic.sysml": {
    nodes: ["req:MassLimit", "req:RangeTarget", "req:vehicleMass", "req:vehicleRange", "elem:Vehicle"],
    edges: 4,
  },
  "requirements-nested.sysml": {
    nodes: [
      "req:Safety", "req:BrakeSafety", "req:vehicleSafety", "req:vehicleSafety.braking",
      "req:vehicleSafety.braking.stopDistance", "req:vehicleSafety.lighting", "elem:Vehicle.brake", "elem:Vehicle.lamps",
    ],
    edges: 9,
  },
};

describe("SysML corpus", () => {
  test("every source has an expected SVG, and every expected SVG has a source", () => {
    const expected = readdirSync(CORPUS).filter((f) => f.endsWith(".expected.svg")).sort();
    expect(sources.map((f) => f.replace(/\.sysml$/, ".expected.svg"))).toEqual(expected);
  });

  test("the corpus holds at least eight sources and covers the three views", () => {
    expect(sources.length).toBeGreaterThanOrEqual(8);
    const views = new Set(approval.entries.map((e) => (e.options.view as string | undefined) ?? "bdd"));
    expect([...views].sort()).toEqual(["bdd", "ibd", "requirements"]);
  });

  test("the approval manifest lists each source once, with a boolean approval", () => {
    expect(approval.entries.map((e) => e.source).sort()).toEqual(sources);
    for (const entry of approval.entries) expect(typeof entry.approved).toBe("boolean");
  });

  for (const entry of approval.entries) {
    test(`${entry.source} is approved by the reviewer; set approved to true in test/corpus/sysml/approval.json`, () => {
      expect(entry.approved).toBe(true);
    });

    test(`${entry.source} has the hand-written structure and matches its expected SVG with no warning`, async () => {
      const source = readFileSync(join(CORPUS, entry.source), "utf8");
      const r = await renderSysmlSvg(source, entry.options);
      const props = svgProperties(r.svg);
      const want = STRUCTURE[entry.source]!;
      expect([...props.nodes].sort()).toEqual([...want.nodes].sort());
      expect(props.edges).toBe(want.edges);
      const expected = readFileSync(join(CORPUS, entry.source.replace(/\.sysml$/, ".expected.svg")), "utf8");
      const cmp = compareSvg(r.svg, expected);
      if (!cmp.equal) throw new Error(`${entry.source}: ${cmp.diff}`);
      expect(r.warnings).toEqual([]);
    });
  }
});
