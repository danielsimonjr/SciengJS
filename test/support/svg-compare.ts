/**
 * Normalizes an SVG text for comparison. Test support only: nothing in src/ imports this file.
 *
 * Steps, in order:
 * 1. drop the XML declaration, the doctype and the comments;
 * 2. renumber each id, and each reference to it, as id1, id2, ... in order of first appearance;
 * 3. sort the attributes of each start tag by name;
 * 4. round each number in an attribute value to three decimals, and drop trailing zeros;
 * 5. collapse the whitespace between tags.
 */

const NUMBER = /(?<![A-Za-z#_\d.])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|(?<![A-Za-z#_\d.])-?\.\d+/g;
const ID_ATTR = /\bid="([^"]+)"/g;
const TAG = /<([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
const ATTR = /([\w:-]+)="([^"]*)"/g;

function roundNumber(token: string): string {
  const value = Number(token);
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function renumberIds(svg: string): string {
  const map = new Map<string, string>();
  for (const match of svg.matchAll(ID_ATTR)) {
    const id = match[1] as string;
    if (!map.has(id)) map.set(id, `id${map.size + 1}`);
  }
  let out = svg.replace(ID_ATTR, (_all, id: string) => `id="${map.get(id) ?? id}"`);
  out = out.replace(/url\(#([^)]+)\)/g, (_all, id: string) => `url(#${map.get(id) ?? id})`);
  out = out.replace(/href="#([^"]+)"/g, (_all, id: string) => `href="#${map.get(id) ?? id}"`);
  return out;
}

function normalizeTags(svg: string): string {
  return svg.replace(TAG, (_all, name: string, attrText: string, selfClose: string) => {
    const attrs: [string, string][] = [];
    for (const match of attrText.matchAll(ATTR)) {
      const [, key, value] = match as unknown as [string, string, string];
      attrs.push([key, value.replace(NUMBER, roundNumber)]);
    }
    attrs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const body = attrs.map(([k, v]) => ` ${k}="${v}"`).join("");
    return `<${name}${body}${selfClose}>`;
  });
}

export function normalizeSvg(svg: string): string {
  let out = svg.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = renumberIds(out);
  out = normalizeTags(out);
  out = out.replace(/>\s+</g, "><").trim();
  return out;
}

export interface SvgComparison {
  equal: boolean;
  /** Text around the first difference, when the two differ. */
  diff?: string;
}

export function compareSvg(actual: string, expected: string): SvgComparison {
  const a = normalizeSvg(actual);
  const e = normalizeSvg(expected);
  if (a === e) return { equal: true };
  let i = 0;
  while (i < a.length && i < e.length && a[i] === e[i]) i += 1;
  const from = Math.max(0, i - 30);
  return {
    equal: false,
    diff: `first difference at ${i}: actual "${a.slice(from, i + 30)}" expected "${e.slice(from, i + 30)}"`,
  };
}
