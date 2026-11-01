// Trial T1: compare the node layout of two Graphviz SVG files of the same DOT source.
// Positions are normalized to the bounding box of the nodes, so a different translate
// or margin does not count as a difference. Prints one JSON line.
// Usage: node compare-layout.mjs <viz.svg> <cli.svg>
import { readFileSync } from "node:fs";

const TOL = 0.5; // points

function nodes(svg) {
  const out = new Map();
  const blocks = svg.split(/<g id="node\d+" class="node">/).slice(1);
  for (const b of blocks) {
    const body = b.split("</g>")[0];
    const title = (body.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    if (title === undefined) continue;
    let x;
    let y;
    const ell = body.match(/<ellipse[^>]*?cx="([-\d.]+)"[^>]*?cy="([-\d.]+)"/);
    if (ell) {
      x = Number(ell[1]);
      y = Number(ell[2]);
    } else {
      const poly = body.match(/<polygon[^>]*?points="([^"]+)"/);
      if (!poly) continue;
      const pts = poly[1].trim().split(/\s+/).map((p) => p.split(",").map(Number));
      x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    }
    out.set(title.trim(), { x, y });
  }
  return out;
}

function normalize(map) {
  const xs = [...map.values()].map((p) => p.x);
  const ys = [...map.values()].map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const res = new Map();
  for (const [k, p] of map) res.set(k, { x: p.x - minX, y: p.y - minY });
  return res;
}

const [vizPath, cliPath] = process.argv.slice(2);
const a = normalize(nodes(readFileSync(vizPath, "utf8")));
const b = normalize(nodes(readFileSync(cliPath, "utf8")));

const onlyViz = [...a.keys()].filter((k) => !b.has(k));
const onlyCli = [...b.keys()].filter((k) => !a.has(k));
let matched = 0;
let maxDelta = 0;
const mismatches = [];
for (const [k, p] of a) {
  if (!b.has(k)) continue;
  const q = b.get(k);
  const d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
  maxDelta = Math.max(maxDelta, d);
  if (d <= TOL) matched++;
  else mismatches.push({ node: k, viz: [p.x, p.y].map((v) => +v.toFixed(2)), cli: [q.x, q.y].map((v) => +v.toFixed(2)) });
}

console.log(
  JSON.stringify({
    tolerancePt: TOL,
    vizNodes: a.size,
    cliNodes: b.size,
    matchedWithinTolerance: matched,
    maxDeltaPt: +maxDelta.toFixed(3),
    onlyInViz: onlyViz,
    onlyInCli: onlyCli,
    mismatches: mismatches.slice(0, 10),
    identicalLayout: onlyViz.length === 0 && onlyCli.length === 0 && mismatches.length === 0,
  }),
);
