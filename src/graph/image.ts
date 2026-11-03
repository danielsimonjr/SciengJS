/** The attribute keys that name an external resource. The scanner removes each of them. */
const EXTERNAL_KEYS: readonly string[] = ["image", "stylesheet"];

/** One attribute that the scanner removed: its key, the line of the key and the text of its value. */
export interface ImageRemoval {
  key: string;
  line: number;
  file: string;
}

/** The source without its external-resource attributes, and one entry for each attribute that was removed. */
export interface StripResult {
  source: string;
  removed: ImageRemoval[];
}

type TokenKind = "ident" | "string" | "html" | "char";

interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

interface Range {
  start: number;
  end: number;
  key: string;
  line: number;
  file: string;
}

function isSpace(c: string): boolean {
  return c === " " || c === "\t" || c === "\r" || c === "\n" || c === "\f" || c === "\v";
}

// DOT identifiers take every byte from 0x80 upward, so every non-ASCII character counts as a letter.
function isWordChar(c: string): boolean {
  return (
    (c >= "a" && c <= "z") ||
    (c >= "A" && c <= "Z") ||
    (c >= "0" && c <= "9") ||
    c === "." ||
    c === "_" ||
    c >= "\u0080"
  );
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const len = source.length;
  let i = 0;
  while (i < len) {
    const c = source[i];
    if (isSpace(c)) {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < len && source[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < len && !(source[i] === "*" && source[i + 1] === "/")) {
        i++;
      }
      if (i < len) {
        i += 2;
      }
      continue;
    }
    if (c === "#" && (i === 0 || source[i - 1] === "\n")) {
      while (i < len && source[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (c === '"') {
      const start = i;
      i++;
      let text = "";
      while (i < len) {
        const ch = source[i];
        if (ch === "\\" && i + 1 < len) {
          text += source[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') {
          i++;
          break;
        }
        text += ch;
        i++;
      }
      tokens.push({ kind: "string", text, start, end: i });
      continue;
    }
    if (c === "<") {
      const start = i;
      i++;
      let text = "";
      let depth = 1;
      while (i < len && depth > 0) {
        const ch = source[i];
        if (ch === "<") {
          depth++;
        } else if (ch === ">") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        text += ch;
        i++;
      }
      tokens.push({ kind: "html", text, start, end: i });
      continue;
    }
    if (isWordChar(c)) {
      const start = i;
      let text = "";
      while (i < len && isWordChar(source[i])) {
        text += source[i];
        i++;
      }
      tokens.push({ kind: "ident", text, start, end: i });
      continue;
    }
    tokens.push({ kind: "char", text: c, start: i, end: i + 1 });
    i++;
  }
  return joinConcatenations(tokens);
}

// DOT joins quoted strings with "+". The joined text is one string token.
function joinConcatenations(tokens: Token[]): Token[] {
  const joined: Token[] = [];
  for (const token of tokens) {
    const last = joined[joined.length - 1];
    const prior = joined[joined.length - 2];
    if (token.kind === "string" && last?.kind === "char" && last.text === "+" && prior?.kind === "string") {
      joined.length -= 2;
      joined.push({ kind: "string", text: prior.text + token.text, start: prior.start, end: token.end });
      continue;
    }
    joined.push(token);
  }
  return joined;
}

function skipTrivia(source: string, from: number): number {
  const len = source.length;
  let j = from;
  while (j < len) {
    const c = source[j];
    if (isSpace(c)) {
      j++;
      continue;
    }
    if (c === "/" && source[j + 1] === "/") {
      j += 2;
      while (j < len && source[j] !== "\n") {
        j++;
      }
      continue;
    }
    if (c === "/" && source[j + 1] === "*") {
      j += 2;
      while (j < len && !(source[j] === "*" && source[j + 1] === "/")) {
        j++;
      }
      if (j < len) {
        j += 2;
      }
      continue;
    }
    break;
  }
  return j;
}

/** Counts the lines from a known position, so that a scan with many hits reads the source once. */
class LineCounter {
  private index = 0;
  private line = 1;

  constructor(private readonly source: string) {}

  /** The line of an index. The indexes of the calls must not decrease. */
  at(index: number): number {
    for (; this.index < index; this.index++) {
      if (this.source[this.index] === "\n") {
        this.line++;
      }
    }
    return this.line;
  }
}

/** Removes each image and stylesheet attribute of a DOT source and reports its key, line and value. Comments, quoted strings and HTML strings keep their text. */
export function stripImageAttributes(source: string): StripResult {
  const tokens = tokenize(source);
  const ranges: Range[] = [];
  const lines = new LineCounter(source);
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i];
    const isKey = (key.kind === "ident" || key.kind === "string") && EXTERNAL_KEYS.includes(key.text);
    if (!isKey) {
      continue;
    }
    const eq = tokens[i + 1];
    if (!eq || eq.kind !== "char" || eq.text !== "=") {
      continue;
    }
    const value = tokens[i + 2];
    if (!value || (value.kind !== "ident" && value.kind !== "string" && value.kind !== "html")) {
      continue;
    }
    let end = value.end;
    const sep = skipTrivia(source, value.end);
    if (sep < source.length && (source[sep] === "," || source[sep] === ";")) {
      end = sep + 1;
    }
    ranges.push({ start: key.start, end, key: key.text, line: lines.at(key.start), file: value.text });
    i += 2;
  }
  const chars = source.split("");
  for (const range of ranges) {
    for (let k = range.start; k < range.end; k++) {
      chars[k] = source[k] === "\n" ? "\n" : " ";
    }
  }
  const removed: ImageRemoval[] = ranges.map((range) => ({ key: range.key, line: range.line, file: range.file }));
  return { source: chars.join(""), removed };
}

function findImageClose(svg: string, from: number): number {
  const len = svg.length;
  let idx = svg.indexOf("</image", from);
  while (idx !== -1) {
    const c = svg.charAt(idx + 7);
    if (c === ">") {
      return idx + 8;
    }
    if (c !== "" && isSpace(c)) {
      let m = idx + 7;
      while (m < len && isSpace(svg[m])) {
        m++;
      }
      if (m < len && svg[m] === ">") {
        return m + 1;
      }
    }
    idx = svg.indexOf("</image", idx + 7);
  }
  return -1;
}

function imageRemovalEnd(svg: string, start: number): number {
  const len = svg.length;
  let j = start + 6;
  let quote: string | null = null;
  while (j < len) {
    const c = svg[j];
    if (quote !== null) {
      if (c === quote) {
        quote = null;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      break;
    }
    j++;
  }
  if (j >= len) {
    return len;
  }
  let k = j - 1;
  while (k >= 0 && isSpace(svg[k])) {
    k--;
  }
  if (k >= start && svg[k] === "/") {
    return j + 1;
  }
  const close = findImageClose(svg, j + 1);
  return close === -1 ? len : close;
}

/** Removes each SVG image element, with its attributes and its closing tag, and counts the removed elements. */
export function dropImageElements(svg: string): { svg: string; dropped: number } {
  const len = svg.length;
  let out = "";
  let copied = 0;
  let i = 0;
  let dropped = 0;
  while (i < len) {
    if (svg.startsWith("<image", i)) {
      const next = svg.charAt(i + 6);
      if (next === "/" || next === ">" || isSpace(next)) {
        const removeEnd = imageRemovalEnd(svg, i);
        out += svg.slice(copied, i);
        dropped++;
        copied = removeEnd;
        i = removeEnd;
        continue;
      }
    }
    i++;
  }
  out += svg.slice(copied);
  return { svg: out, dropped };
}

/** Removes each xml-stylesheet processing instruction of an SVG and counts the removed instructions. */
export function dropStylesheetInstructions(svg: string): { svg: string; dropped: number } {
  let dropped = 0;
  const out = svg.replace(/<\?xml-stylesheet[^>]*?\?>(\r?\n)?/g, () => {
    dropped++;
    return "";
  });
  return { svg: out, dropped };
}
