import type { CadMeasures } from "./cad-build.ts";
import { WALL_SECTIONS } from "./cad-build.ts";

/** The options of the report of the design for manufacture. */
export interface DfmOptions {
  /** The overhang angle in degrees from the vertical. */
  overhang: number;
  /** The minimum wall in millimetres. */
  minWall: number;
}

/** The default options of the report. */
export const DFM_DEFAULTS: DfmOptions = { overhang: 45, minWall: 0.8 };

/** The largest number of thin sections that the report lists on each axis. */
const LISTED_SECTIONS = 10;

/**
 * The area of the faces that need support when the model is printed upwards along +Z. A face needs support when
 * its normal points down and the face is more than the overhang angle from the vertical. A face with each vertex
 * on the lowest plane stands on the bed and needs no support.
 */
export function supportArea(positions: Float32Array, triangles: Uint32Array, minZ: number, overhang: number): number {
  const limit = -Math.sin((overhang * Math.PI) / 180);
  const bed = minZ + 1e-6 * Math.max(1, Math.abs(minZ));
  let total = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]! * 3;
    const b = triangles[t + 1]! * 3;
    const c = triangles[t + 2]! * 3;
    if (positions[a + 2]! <= bed && positions[b + 2]! <= bed && positions[c + 2]! <= bed) continue;
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length > 0 && nz / length < limit) total += length / 2;
  }
  return total;
}

/** A number with at most three decimals, and no negative zero. */
function fixed(value: number): string {
  const rounded = Number(value.toFixed(3));
  return String(rounded === 0 ? 0 : rounded);
}

/** Writes the report of the design for manufacture as GitHub Flavored Markdown. */
export function writeDfmReport(measures: CadMeasures, options: DfmOptions): Uint8Array {
  const size = measures.max.map((high, i) => fixed(high - measures.min[i]!)).join(" x ");
  const support = supportArea(measures.positions, measures.triangles, measures.min[2]!, options.overhang);
  const supportText = fixed(support);
  const sections = 3 * WALL_SECTIONS;
  const lines = [
    "# Design for manufacture",
    "",
    "| Measure | Value |",
    "| --- | --- |",
    `| Size (X x Y x Z) | ${size} mm |`,
    `| Volume | ${fixed(measures.volume)} mm³ |`,
    `| Surface area | ${fixed(measures.area)} mm² |`,
    "",
    "| Check | Result | Value | Limit |",
    "| --- | --- | --- | --- |",
    `| Overhang | ${support > 0 ? "fail" : "pass"} | ${supportText} mm² needs support | ${fixed(options.overhang)}° from the vertical |`,
    `| Minimum wall | ${measures.thin.length === 0 ? "pass" : "fail"} | ${measures.thin.length} of ${sections} sections have a thin region | ${fixed(options.minWall)} mm |`,
  ];
  if (measures.thin.length > 0) {
    lines.push("", "## Thin walls", "");
    for (const axis of ["X", "Y", "Z"] as const) {
      const onAxis = measures.thin.filter((section) => section.axis === axis);
      for (const s of onAxis.slice(0, LISTED_SECTIONS)) lines.push(`- ${axis} = ${fixed(s.at)} mm: ${fixed(s.area)} mm² thin`);
      if (onAxis.length > LISTED_SECTIONS) lines.push(`- and ${onAxis.length - LISTED_SECTIONS} more sections on ${axis}`);
    }
  }
  return new TextEncoder().encode(lines.join("\n") + "\n");
}
