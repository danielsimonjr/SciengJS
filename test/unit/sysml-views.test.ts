import { describe, expect, test } from "bun:test";
import { RenderError } from "../../src/errors.ts";
import { parseSysml } from "../../src/sysml/parse.ts";
import { readSysmlOptions, sysmlToDot } from "../../src/sysml/views.ts";
import { renderSysmlSvg } from "../../src/sysml/render.ts";

const VEHICLE = `
package Vehicles {
  port def FuelPort { attribute rate : Real; }
  interface def FuelLine;
  part def Engine { attribute power : Real = 150; port fuel : FuelPort; }
  part def Tank { port out : FuelPort; }
  part def Vehicle {
    attribute mass : Real = 1200;
    part engine : Engine;
    part tank : Tank [1..2];
    port refuel : FuelPort;
    connect tank.out to refuel;
    interface line : FuelLine connect tank.out to engine.fuel;
  }
  part def Truck :> Vehicle;
  requirement def Range { attribute km = 500; requirement fuel; }
  requirement longRange : Range;
  satisfy Range by Vehicle.tank;
  satisfy longRange by Truck;
}`;

function dot(options: Record<string, unknown>, source = VEHICLE): string {
  const model = parseSysml(source, false);
  return sysmlToDot(model, readSysmlOptions(options));
}

function lines(text: string, part: string): string[] {
  return text.split("\n").filter((l) => l.includes(part));
}

function rejection(fn: () => unknown): RenderError {
  try {
    fn();
  } catch (err) {
    if (err instanceof RenderError) return err;
    throw err;
  }
  throw new Error("expected a RenderError, but the call returned");
}

describe("sysml options", () => {
  test("view defaults to bdd; root is read for ibd; lenient is read", () => {
    expect(readSysmlOptions({})).toEqual({ view: "bdd", root: undefined, lenient: false });
    expect(readSysmlOptions({ view: "ibd", root: "V", lenient: true })).toEqual({ view: "ibd", root: "V", lenient: true });
    expect(readSysmlOptions({ view: "requirements" }).view).toBe("requirements");
  });

  test("an unknown view, ibd without root, root with another view and an unknown key reject", () => {
    expect(rejection(() => readSysmlOptions({ view: "flow" })).message).toContain("view");
    expect(rejection(() => readSysmlOptions({ view: "ibd" })).message).toContain("root");
    expect(rejection(() => readSysmlOptions({ root: "V" })).message).toContain("root");
    expect(rejection(() => readSysmlOptions({ root: 3, view: "ibd" })).message).toContain("root");
    const err = rejection(() => readSysmlOptions({ scale: 2 }));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toBe("sysml takes no option scale");
  });

  test("a root that names no part def rejects with E_INPUT", () => {
    const err = rejection(() => dot({ view: "ibd", root: "FuelPort" }));
    expect(err.code).toBe("E_INPUT");
    expect(err.message).toContain("FuelPort names no part def");
  });
});

describe("sysml bdd view", () => {
  const text = dot({});

  test("each part def, port def and interface def is a record node with its kind in ASCII", () => {
    expect(lines(text, "shape=record").length).toBe(1);
    expect(text).toContain('"Vehicle" [label="{part def\\nVehicle|mass : Real = 1200\\l|port refuel : FuelPort\\l}"];');
    expect(text).toContain('"Engine" [label="{part def\\nEngine|power : Real = 150\\l|port fuel : FuelPort\\l}"];');
    expect(text).toContain('"FuelPort" [label="{port def\\nFuelPort|rate : Real\\l}"];');
    expect(text).toContain('"FuelLine" [label="{interface def\\nFuelLine}"];');
    expect(text).toContain('"Truck" [label="{part def\\nTruck}"];');
    expect(lines(text, "[label=").length).toBe(6);
  });

  test("a part usage draws a composition edge and :> draws a triangle edge", () => {
    expect(text).toContain('"Vehicle" -> "Engine" [dir=both, arrowtail=diamond, arrowhead=none, headlabel="engine"];');
    expect(text).toContain('"Vehicle" -> "Tank" [dir=both, arrowtail=diamond, arrowhead=none, headlabel="tank [1..2]"];');
    expect(text).toContain('"Truck" -> "Vehicle" [arrowhead=empty];');
    expect(lines(text, "->").length).toBe(3);
  });

  test("requirements are not in the bdd view", () => {
    expect(text).not.toContain("Range");
    expect(text).not.toContain("satisfy");
  });

  test("record symbols in a value are escaped", () => {
    const t = dot({}, 'part def A { attribute s = "a|b{c}<d>"; }');
    expect(t).toContain('s = \\"a\\|b\\{c\\}\\<d\\>\\"\\l');
  });
});

describe("sysml ibd view", () => {
  const text = dot({ view: "ibd", root: "Vehicle" });

  test("the root is a cluster with its parts and ports", () => {
    expect(text).toContain("subgraph cluster_root {");
    expect(text).toContain('label="Vehicle";');
    expect(text).toContain('"part:engine" [shape=record, label="{engine : Engine|{<fuel> fuel}}"];');
    expect(text).toContain('"part:tank" [shape=record, label="{tank : Tank [1..2]|{<out> out}}"];');
    expect(text).toContain('"port:refuel" [shape=box, label="refuel : FuelPort"];');
  });

  test("each connect and interface is an edge between two ports", () => {
    expect(text).toContain('"part:tank":"out" -> "port:refuel" [dir=none];');
    expect(text).toContain('"part:tank":"out" -> "part:engine":"fuel" [dir=none, label="line : FuelLine"];');
    expect(lines(text, "->").length).toBe(2);
  });

  test("a part gets the ports of the bases of its type, and a part with no port has a plain label", () => {
    const t = dot({ view: "ibd", root: "S" }, "port def P; part def A { port a : P; } part def B :> A; part def C; part def S { part b : B; part c : C; }");
    expect(t).toContain('"part:b" [shape=record, label="{b : B|{<a> a}}"];');
    expect(t).toContain('"part:c" [shape=record, label="{c : C}"];');
  });

  test("the root inherits the parts, ports and connections of its bases", () => {
    const t = dot({ view: "ibd", root: "Truck" });
    expect(t).toContain('label="Truck";');
    expect(t).toContain('"part:engine"');
    expect(lines(t, "->").length).toBe(2);
  });
});

describe("sysml requirements view", () => {
  const text = dot({ view: "requirements" });

  test("each requirement def and usage is a record node", () => {
    expect(text).toContain('"req:Range" [shape=record, label="{requirement def\\nRange|km = 500\\l}"];');
    expect(text).toContain('"req:Range.fuel" [shape=record, label="{requirement\\nfuel}"];');
    expect(text).toContain('"req:longRange" [shape=record, label="{requirement\\nlongRange : Range}"];');
  });

  test("containment, typing and satisfy draw their edges", () => {
    expect(text).toContain('"req:Range" -> "req:Range.fuel" [dir=both, arrowtail=odot, arrowhead=none];');
    expect(text).toContain('"req:longRange" -> "req:Range" [style=dashed, arrowhead=normal];');
    expect(text).toContain('"elem:Vehicle.tank" -> "req:Range" [style=dashed, arrowhead=open, label="<<satisfy>>"];');
    expect(text).toContain('"elem:Truck" -> "req:longRange" [style=dashed, arrowhead=open, label="<<satisfy>>"];');
  });

  test("each satisfy path is a node", () => {
    expect(text).toContain('"elem:Vehicle.tank" [shape=box, label="tank : Tank"];');
    expect(text).toContain('"elem:Truck" [shape=record, label="{part def\\nTruck}"];');
  });

  test(":> between requirement defs draws a triangle edge", () => {
    const t = dot({ view: "requirements" }, "requirement def A; requirement def B :> A;");
    expect(t).toContain('"req:B" -> "req:A" [arrowhead=empty];');
  });
});

describe("sysml render to svg", () => {
  test("each view renders to an SVG through the graph stage", async () => {
    for (const options of [{}, { view: "ibd", root: "Vehicle" }, { view: "requirements" }]) {
      const out = await renderSysmlSvg(VEHICLE, options);
      expect(out.svg.startsWith("<?xml") || out.svg.startsWith("<svg")).toBe(true);
      expect(out.warnings).toEqual([]);
    }
  });

  test("lenient warnings come with the svg", async () => {
    const out = await renderSysmlSvg("part def A; action x;", { lenient: true });
    expect(out.warnings).toEqual(['line 1: skipped the unsupported statement "action"']);
  });
});
