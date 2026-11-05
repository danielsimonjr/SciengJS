/** The SVG unit of the specials of dvisvgm: the big point (72 bp = 72.27 pt). */
export const SPECIAL_UNIT_PER_PT = 72 / 72.27;

/** The position of a special on the page, in SVG units, and the size of one TeX point in these units. */
export interface SpecialPosition {
  x: number;
  y: number;
  unit: number;
}

/** What a special gives to the page: SVG text, a box for the bounds, or nothing. */
export interface SpecialResult {
  /** SVG text for the page. */
  svg?: string;
  /** The box `[x0, y0, x1, y1]` that joins the bounds of the page. */
  box?: number[];
}

/** The reader of the dvisvgm specials. */
export interface Specials {
  /** Turns one special into SVG text, a box or `null`. */
  special(text: string, at: SpecialPosition): SpecialResult | null;
  /** The first words of the specials that the reader did not handle, in order and without repeats. */
  ignored(): string[];
  /**
   * Tells whether the page is inside a raw group with a `transform` attribute. A pgf picture moves its text
   * with such a group, so the DVI position of a glyph there is not its place on the page.
   */
  transformed(): boolean;
}

const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

// The rounding removes float noise, so 10 stays "10".
const fmt = (v: number): string => String(round4(v));

function fill(text: string, at: SpecialPosition): string {
  return text.replace(/\{\?x\}/g, fmt(at.x)).replace(/\{\?y\}/g, fmt(at.y)).replace(/\{\?nl\}/g, "\n");
}

function firstWord(text: string): string {
  return text.trim().split(/\s+/)[0]!;
}

/**
 * Creates a reader for the `dvisvgm:raw`, `rawdef`, `rawset`, `endrawset`, `rawput` and `bbox` specials
 * and for the `color push` and `color pop` specials. The reader keeps the named raw sets between calls.
 */
export function createSpecials(): Specials {
  const sets = new Map<string, string>();
  let active: string | null = null;
  const ignoredList: string[] = [];
  // One entry for each open group on the page: true when the group has a transform attribute.
  const groups: boolean[] = [];

  function track(r: SpecialResult | null): SpecialResult | null {
    if (r?.svg === undefined) return r;
    for (const m of r.svg.matchAll(/<g(\s[^>]*)?>|<\/g>/g)) {
      if (m[0] === "</g>") groups.pop();
      else groups.push(/transform\s*=/.test(m[1] ?? ""));
    }
    return r;
  }

  function remember(word: string | undefined): void {
    if (word && !ignoredList.includes(word)) ignoredList.push(word);
  }

  // The numbers of dvisvgm:bbox are in TeX points.
  function bbox(arg: string, at: SpecialPosition): SpecialResult | null {
    const t = arg.trim();
    const toks = t.length === 0 ? [] : t.split(/\s+/);
    const head = toks[0];
    if (head === "lock" || head === "unlock" || head === "fix" || head === "new") return null;
    if (toks.length < 2) return null;
    const w = Number(toks[0]);
    const h = Number(toks[1]);
    const d = toks.length > 2 ? Number(toks[2]) : 0;
    if (![w, h, d].every(Number.isFinite)) return null;
    // The box runs W wide from the point, H high above and D deep below it.
    return { box: [round4(at.x), round4(at.y - h * at.unit), round4(at.x + w * at.unit), round4(at.y + d * at.unit)] };
  }

  function dvisvgm(rest: string, first: string, at: SpecialPosition): SpecialResult | null {
    const m = rest.match(/^\s*(\S+)(?:\s([\s\S]*))?$/);
    if (m === null) {
      remember(first);
      return null;
    }
    const cmd = m[1];
    const arg = m[2] === undefined ? "" : m[2];
    if (cmd === "raw") {
      if (active !== null) {
        // Inside a capture the text is stored unreplaced.
        sets.set(active, sets.get(active) + arg);
        return null;
      }
      return { svg: fill(arg, at) };
    }
    if (cmd === "rawdef") return { svg: "<defs>" + fill(arg, at) + "</defs>" };
    if (cmd === "rawset") {
      const name = firstWord(arg);
      if (name !== "" && active === null) {
        active = name;
        sets.set(name, "");
      }
      return null;
    }
    if (cmd === "endrawset") {
      active = null;
      return null;
    }
    if (cmd === "rawput") {
      const name = firstWord(arg);
      const stored = name === "" ? undefined : sets.get(name);
      // A set that still captures is not ready for a put. The placeholders are replaced at the time of the put.
      if (stored === undefined || name === active) return null;
      return { svg: fill(stored, at) };
    }
    if (cmd === "bbox") return bbox(arg, at);
    remember(first);
    return null;
  }

  function color(words: string[]): SpecialResult | null {
    if (words[1] === "pop") return { svg: "</g>" };
    if (words[1] !== "push") {
      remember(words[0]);
      return null;
    }
    const chan = (v: number): number => Math.round(v * 255);
    const model = words[2];
    let rgb: number[] | null = null;
    if (model === "rgb" && words.length >= 6) {
      const v = words.slice(3, 6).map(Number);
      if (v.every(Number.isFinite)) rgb = v.map(chan);
    } else if (model === "gray" && words.length >= 4) {
      const v = Number(words[3]);
      if (Number.isFinite(v)) rgb = [chan(v), chan(v), chan(v)];
    } else if (model === "cmyk" && words.length >= 7) {
      const v = words.slice(3, 7).map(Number);
      if (v.every(Number.isFinite)) {
        const [c, m, y, k] = v as [number, number, number, number];
        rgb = [chan((1 - c) * (1 - k)), chan((1 - m) * (1 - k)), chan((1 - y) * (1 - k))];
      }
    }
    if (rgb === null) {
      remember(words[0]);
      return null;
    }
    return { svg: '<g fill="rgb(' + rgb.join(",") + ')">' };
  }

  return {
    special(text, at) {
      const lead = text.match(/^\s*dvisvgm:/);
      if (lead !== null) return track(dvisvgm(text.slice(lead[0].length), text.trim().split(/\s+/)[0]!, at));
      const words = text.trim().split(/\s+/);
      if (words[0] === "color") return track(color(words));
      remember(words[0]);
      return null;
    },
    ignored: () => ignoredList.slice(),
    transformed: () => groups.some((g) => g),
  };
}
