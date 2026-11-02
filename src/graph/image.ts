/** One image attribute that the scanner removed: the line of its key and the file name of its value. */
export interface ImageRemoval {
  line: number;
  file: string;
}

/** The source without its image attributes, and one entry for each attribute that was removed. */
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
  return tokens;
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

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let k = 0; k < index; k++) {
    if (source[k] === "\n") {
      line++;
    }
  }
  return line;
}

/** Removes each image attribute of a DOT source and reports its line and file name. Comments, quoted strings and HTML strings keep their text. */
export function stripImageAttributes(source: string): StripResult {
  const tokens = tokenize(source);
  const ranges: Range[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i];
    const isKey = (key.kind === "ident" || key.kind === "string") && key.text === "image";
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
    ranges.push({ start: key.start, end, line: lineOf(source, key.start), file: value.text });
    i += 2;
  }
  const chars = source.split("");
  for (const range of ranges) {
    for (let k = range.start; k < range.end; k++) {
      chars[k] = source[k] === "\n" ? "\n" : " ";
    }
  }
  const removed: ImageRemoval[] = ranges.map((range) => ({ line: range.line, file: range.file }));
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
