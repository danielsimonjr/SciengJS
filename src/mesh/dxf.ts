/**
 * The DXF writer of the mesh stage (design section "CAD"). The output is ASCII DXF of release R12 (AC1009): a
 * header with the release, and one closed POLYLINE on layer 0 for each contour. The lines end with CR LF.
 */

/** The bytes that a size bound counts per point, per contour, and the fixed part. */
const BOUND = { point: 120, contour: 200, fixed: 1024 };

/** A coordinate as text, with ten significant digits. */
const coordinate = (value: number): string => String(Number(value.toPrecision(10)));

/** The lines of one group: the code, right-aligned in three characters, and the value. */
const group = (code: number, value: string): string => `${String(code).padStart(3)}\r\n${value}\r\n`;

/** An upper bound of the size of the DXF output of the contours, in bytes, from the counts only. */
export function dxfByteLength(contours: number[][][]): number {
  return contours.reduce((n, c) => n + BOUND.contour + BOUND.point * c.length, BOUND.fixed);
}

/** Writes the contours as one DXF file. Each contour is a list of [x, y] points, closed back to its first point. */
export function writeDxf(contours: number[][][]): Uint8Array {
  const parts: string[] = [group(0, "SECTION"), group(2, "HEADER"), group(9, "$ACADVER"), group(1, "AC1009"), group(0, "ENDSEC")];
  parts.push(group(0, "SECTION"), group(2, "ENTITIES"));
  for (const contour of contours) {
    parts.push(group(0, "POLYLINE"), group(8, "0"), group(66, "1"), group(10, "0"), group(20, "0"), group(30, "0"), group(70, "1"));
    for (const [x, y] of contour) {
      parts.push(group(0, "VERTEX"), group(8, "0"), group(10, coordinate(x!)), group(20, coordinate(y!)), group(30, "0"));
    }
    parts.push(group(0, "SEQEND"), group(8, "0"));
  }
  parts.push(group(0, "ENDSEC"), group(0, "EOF"));
  return new TextEncoder().encode(parts.join(""));
}
