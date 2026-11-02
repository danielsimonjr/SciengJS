// The SVG unit of the specials of dvisvgm: the big point (72 bp = 72.27 pt).
export const unitPerPt = 72 / 72.27;
// Reader of the dvisvgm specials.
// One call turns one special into an SVG fragment, a box or nothing.

// Round a number to four decimals and keep it a number.
const round4 = (v) => Math.round(v * 1e4) / 1e4;

// Print a number for SVG. The rounding kills float noise, so 10 stays "10".
const fmt = (v) => String(round4(v));

// Replace the placeholders with the current position and a newline.
function fill(text, at) {
  return String(text)
    .replace(/\{\?x\}/g, fmt(at.x))
    .replace(/\{\?y\}/g, fmt(at.y))
    .replace(/\{\?nl\}/g, '\n');
}

// First word of a text, used for the names of raw sets.
function firstWord(text) {
  return String(text).trim().split(/\s+/)[0];
}

export function createSpecials() {
  const sets = new Map(); // raw sets stored under their names
  let active = null; // name of the set that captures right now
  const ignoredList = []; // first words of the specials we do not handle

  // Record an ignored word in order, without duplicates.
  function remember(word) {
    if (word && !ignoredList.includes(word)) ignoredList.push(word);
  }

  // Handle dvisvgm:bbox with the numbers in TeX points.
  function bbox(arg, at) {
    const t = arg.trim();
    const toks = t.length === 0 ? [] : t.split(/\s+/);
    const head = toks[0];
    if (head === 'lock' || head === 'unlock' || head === 'fix' || head === 'new') return null;
    if (toks.length < 2) return null;
    const w = Number(toks[0]);
    const h = Number(toks[1]);
    const d = toks.length > 2 ? Number(toks[2]) : 0;
    if (![w, h, d].every(Number.isFinite)) return null;
    // The box runs W wide from the point, H high above and D deep below it.
    return {
      box: [
        round4(at.x),
        round4(at.y - h * at.unit),
        round4(at.x + w * at.unit),
        round4(at.y + d * at.unit),
      ],
    };
  }

  // Dispatch the command word that follows "dvisvgm:".
  function dvisvgm(rest, first, at) {
    const m = rest.match(/^\s*(\S+)(?:\s([\s\S]*))?$/);
    if (m === null) {
      remember(first);
      return null;
    }
    const cmd = m[1];
    const arg = m[2] === undefined ? '' : m[2];
    if (cmd === 'raw') {
      if (active !== null) {
        // Inside a capture the text is stored unreplaced.
        sets.set(active, sets.get(active) + arg);
        return null;
      }
      return { svg: fill(arg, at) };
    }
    if (cmd === 'rawdef') {
      return { svg: '<defs>' + fill(arg, at) + '</defs>' };
    }
    if (cmd === 'rawset') {
      const name = firstWord(arg);
      if (name !== '' && active === null) {
        active = name;
        sets.set(name, '');
      }
      return null;
    }
    if (cmd === 'endrawset') {
      active = null;
      return null;
    }
    if (cmd === 'rawput') {
      const name = firstWord(arg);
      const stored = name === '' ? undefined : sets.get(name);
      // A set that still captures is not ready for a put.
      if (stored === undefined || name === active) return null;
      // The placeholders are replaced at the time of the put.
      return { svg: fill(stored, at) };
    }
    if (cmd === 'bbox') {
      return bbox(arg, at);
    }
    // An unknown dvisvgm command is only noted as ignored.
    remember(first);
    return null;
  }

  // Handle color push with the rgb, gray and cmyk models, and color pop.
  function color(words) {
    if (words[1] === 'pop') {
      return { svg: '</g>' };
    }
    if (words[1] !== 'push') {
      remember(words[0]);
      return null;
    }
    const chan = (v) => Math.round(v * 255);
    const model = words[2];
    let rgb = null;
    if (model === 'rgb' && words.length >= 6) {
      const v = words.slice(3, 6).map(Number);
      if (v.every(Number.isFinite)) rgb = v.map(chan);
    } else if (model === 'gray' && words.length >= 4) {
      const v = Number(words[3]);
      if (Number.isFinite(v)) rgb = [chan(v), chan(v), chan(v)];
    } else if (model === 'cmyk' && words.length >= 7) {
      const v = words.slice(3, 7).map(Number);
      if (v.every(Number.isFinite)) {
        const [c, m, y, k] = v;
        rgb = [chan((1 - c) * (1 - k)), chan((1 - m) * (1 - k)), chan((1 - y) * (1 - k))];
      }
    }
    if (rgb === null) {
      remember(words[0]);
      return null;
    }
    return { svg: '<g fill="rgb(' + rgb.join(',') + ')">' };
  }

  // Turn one special into a result object, a box or null.
  function special(text, at) {
    const raw = String(text);
    const lead = raw.match(/^\s*dvisvgm:/);
    if (lead !== null) {
      // Keep the payload after the prefix and read the command word from it.
      return dvisvgm(raw.slice(lead[0].length), raw.trim().split(/\s+/)[0], at);
    }
    const words = raw.trim().split(/\s+/);
    if (words[0] === 'color') {
      return color(words);
    }
    // Any other special is only noted as ignored.
    remember(words[0]);
    return null;
  }

  // The ignored words in the order of their first appearance.
  function ignored() {
    return ignoredList.slice();
  }

  return { special, ignored };
}
