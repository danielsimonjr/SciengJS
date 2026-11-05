/** The text helpers of the adapters that write DOT: the source text, the XML filter and the two DOT escapes. */

/** The text of a request. The function reads a byte source as UTF-8. */
export function sourceText(source: string | Uint8Array): string {
  return typeof source === "string" ? source : new TextDecoder().decode(source);
}

/**
 * Replaces each code point that XML 1.0 forbids with U+FFFD.
 * Valid text, including surrogate pairs, stays unchanged.
 */
export function xmlSafe(text: string): string {
  return text.replace(
    /[^\u{9}\u{A}\u{D}\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu,
    "\u{FFFD}",
  );
}

/** Escapes text for a quoted DOT string: XML-safe, with each backslash and double quote escaped. */
export function escapeDot(text: string): string {
  return xmlSafe(text).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

/** Escapes text for a field of a DOT record label: XML-safe, with each record symbol escaped. */
export function escapeRecord(text: string): string {
  return xmlSafe(text).replace(/\\/g, "\\\\").replace(/[{}|<>"]/g, "\\$&");
}
