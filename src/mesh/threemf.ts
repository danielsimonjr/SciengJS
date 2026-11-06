/**
 * The 3MF writer of the mesh stage (design section "CAD"). The output is a 3MF Core package: a ZIP archive with
 * the parts `[Content_Types].xml`, `_rels/.rels` and `3D/3dmodel.model`. The writer stores each part without
 * compression, with a fixed date, so the same meshes always give the same bytes.
 */
import { RenderError } from "../errors.ts";
import { DEFAULT_COLOUR, triangleGroups } from "./glb.ts";
import type { CadMesh } from "./read.ts";

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

const CONTENT_TYPES =
  XML_DECLARATION +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
  "</Types>";

const RELATIONSHIPS =
  XML_DECLARATION +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
  "</Relationships>";

const MODEL_OPEN =
  XML_DECLARATION +
  '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">';

/** The DOS date 1980-01-01 of every ZIP entry. The DOS time is 0. */
const DOS_DATE = 0x0021;
/** The ZIP version that a reader needs for a stored entry. */
const ZIP_VERSION = 20;

/**
 * The bytes that a size bound counts per vertex, per triangle, per mesh, per colour and per code unit of a name
 * (the longest escape, `&quot;`, has six bytes), and the fixed part.
 */
const BOUND = { vertex: 120, triangle: 80, mesh: 200, colour: 100, nameUnit: 6, fixed: 4096 };

/** A character that XML 1.0 does not allow, or a lone surrogate. */
const NOT_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of the ZIP format. */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Escapes the characters that have a meaning in an XML attribute value. A tab and a line end become character
 * references, so a reader keeps them. A character that XML does not allow becomes U+FFFD.
 */
export function escapeXml(text: string): string {
  return text
    .replace(NOT_XML, "\uFFFD")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}

/** The `#RRGGBBFF` text of a colour with channels from 0 to 1. */
function displayColor(colour: readonly number[]): string {
  const hex = colour.map((c) => Math.min(255, Math.max(0, Math.round(c * 255))).toString(16).toUpperCase().padStart(2, "0"));
  return `#${hex.join("")}FF`;
}

/** A float32 coordinate as text, with seven significant digits. */
const coordinate = (value: number): string => String(Number(value.toPrecision(7)));

/** The text of the 3D/3dmodel.model part. */
function modelXml(meshes: CadMesh[]): string {
  const bases: string[] = [];
  const baseOf = new Map<string, number>();
  const objects: string[] = [];
  const items: string[] = [];
  let nextId = 2;
  for (const mesh of meshes) {
    const triangles = mesh.indices.length / 3;
    if (triangles === 0) continue;
    const keyOf = new Array<string>(triangles);
    for (const [key, list] of triangleGroups(mesh)) {
      for (const t of list) keyOf[t] = key;
      if (!baseOf.has(key)) {
        baseOf.set(key, bases.length);
        const colour = key === "default" ? DEFAULT_COLOUR : key.split(",").map(Number);
        const name = key === "default" ? "default" : `face ${key}`;
        bases.push(`<base name="${name}" displaycolor="${displayColor(colour)}"/>`);
      }
    }
    const p = mesh.positions;
    const vertices: string[] = [];
    for (let i = 0; i + 2 < p.length; i += 3) {
      vertices.push(`<vertex x="${coordinate(p[i]!)}" y="${coordinate(p[i + 1]!)}" z="${coordinate(p[i + 2]!)}"/>`);
    }
    const ix = mesh.indices;
    const faces: string[] = [];
    for (let t = 0; t < triangles; t++) {
      const v = 3 * t;
      faces.push(`<triangle v1="${ix[v]}" v2="${ix[v + 1]}" v3="${ix[v + 2]}" pid="1" p1="${baseOf.get(keyOf[t]!)}"/>`);
    }
    const id = nextId++;
    objects.push(
      `<object id="${id}" type="model" name="${escapeXml(mesh.name)}" pid="1" pindex="${baseOf.get(keyOf[0]!)}">` +
        `<mesh><vertices>${vertices.join("")}</vertices><triangles>${faces.join("")}</triangles></mesh></object>`,
    );
    items.push(`<item objectid="${id}"/>`);
  }
  if (objects.length === 0) throw new RenderError("E_INPUT", "the meshes hold no triangles");
  return (
    `${MODEL_OPEN}<resources><basematerials id="1">${bases.join("")}</basematerials>${objects.join("")}</resources>` +
    `<build>${items.join("")}</build></model>`
  );
}

/**
 * An upper bound of the size of the 3MF output of the meshes, in bytes, from the counts only. The backend compares the
 * bound with maxMemoryMb before the writer builds any text.
 */
export function threemfByteLength(meshes: CadMesh[]): number {
  let total = BOUND.fixed;
  for (const mesh of meshes) {
    total += BOUND.mesh + BOUND.nameUnit * mesh.name.length + BOUND.vertex * (mesh.positions.length / 3) + BOUND.triangle * (mesh.indices.length / 3);
    total += BOUND.colour * (mesh.faces.length + 1);
  }
  return total;
}

/**
 * Writes the meshes as one 3MF Core package. The writer skips a mesh with no triangle. If all meshes have no
 * triangle, the function rejects with E_INPUT, because a 3MF build holds at least one item.
 */
export function write3mf(meshes: CadMesh[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts = [
    { name: encoder.encode("[Content_Types].xml"), data: encoder.encode(CONTENT_TYPES) },
    { name: encoder.encode("_rels/.rels"), data: encoder.encode(RELATIONSHIPS) },
    { name: encoder.encode("3D/3dmodel.model"), data: encoder.encode(modelXml(meshes)) },
  ];
  const localSize = parts.reduce((n, f) => n + 30 + f.name.length + f.data.length, 0);
  const centralSize = parts.reduce((n, f) => n + 46 + f.name.length, 0);
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);
  const entries: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];
  let at = 0;
  for (const { name, data } of parts) {
    const crc = crc32(data);
    entries.push({ name, crc, size: data.length, offset: at });
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, ZIP_VERSION, true);
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, crc, true);
    view.setUint32(at + 18, data.length, true);
    view.setUint32(at + 22, data.length, true);
    view.setUint16(at + 26, name.length, true);
    bytes.set(name, at + 30);
    bytes.set(data, at + 30 + name.length);
    at += 30 + name.length + data.length;
  }
  for (const { name, crc, size, offset } of entries) {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, ZIP_VERSION, true);
    view.setUint16(at + 6, ZIP_VERSION, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, crc, true);
    view.setUint32(at + 20, size, true);
    view.setUint32(at + 24, size, true);
    view.setUint16(at + 28, name.length, true);
    view.setUint32(at + 42, offset, true);
    bytes.set(name, at + 46);
    at += 46 + name.length;
  }
  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, centralSize, true);
  view.setUint32(at + 16, localSize, true);
  return bytes;
}
