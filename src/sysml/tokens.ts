import { inputError } from "../errors.ts";

/** The kind of a SysML token. */
export type TokenKind = "name" | "number" | "string" | "symbol";

/** One token of a SysML source, with its one-based line and column. A string token holds its text without quotes. */
export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly line: number;
  readonly column: number;
}

/** The symbols of the subset, longest first, so that `:>`, `::` and `..` are one token each. */
const SYMBOLS = [":>", "::", "..", "{", "}", ";", ":", "[", "]", ".", "=", "*"] as const;

const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /[0-9]+(?:\.[0-9]+)?/y;

/**
 * Splits a SysML source into tokens. Comments and white space are skipped. An unclosed comment, an unclosed string
 * and a character outside the token set reject with E_INPUT and the line.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  let line = 1;
  let lineStart = 0;

  while (at < source.length) {
    const ch = source[at]!;
    if (ch === "\n") {
      at += 1;
      line += 1;
      lineStart = at;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      at += 1;
      continue;
    }
    if (source.startsWith("//", at)) {
      const end = source.indexOf("\n", at);
      at = end < 0 ? source.length : end;
      continue;
    }
    if (source.startsWith("/*", at)) {
      const end = source.indexOf("*/", at + 2);
      if (end < 0) throw inputError(line, "the comment is not closed by */");
      for (let k = at; k < end; k += 1) {
        if (source[k] === "\n") {
          line += 1;
          lineStart = k + 1;
        }
      }
      at = end + 2;
      continue;
    }
    const column = at - lineStart + 1;
    if (ch === '"') {
      let text = "";
      let k = at + 1;
      for (;;) {
        const c = source[k];
        if (c === undefined || c === "\n") throw inputError(line, "the string is not closed by a double quote");
        if (c === '"') break;
        if (c === "\\" && (source[k + 1] === '"' || source[k + 1] === "\\")) {
          text += source[k + 1];
          k += 2;
          continue;
        }
        text += c;
        k += 1;
      }
      tokens.push({ kind: "string", value: text, line, column });
      at = k + 1;
      continue;
    }
    const word = match(NAME, source, at);
    if (word !== undefined) {
      tokens.push({ kind: "name", value: word, line, column });
      at += word.length;
      continue;
    }
    const number = match(NUMBER, source, at);
    if (number !== undefined) {
      tokens.push({ kind: "number", value: number, line, column });
      at += number.length;
      continue;
    }
    const symbol = SYMBOLS.find((s) => source.startsWith(s, at));
    if (symbol === undefined) {
      throw inputError(line, `the character "${String.fromCodePoint(source.codePointAt(at)!)}" is outside the subset`);
    }
    tokens.push({ kind: "symbol", value: symbol, line, column });
    at += symbol.length;
  }
  return tokens;
}

/** The text of a sticky pattern at a position, or undefined. */
function match(pattern: RegExp, source: string, at: number): string | undefined {
  pattern.lastIndex = at;
  return pattern.exec(source)?.[0];
}
