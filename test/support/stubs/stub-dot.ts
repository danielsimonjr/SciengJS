// Test-only backend. It dispatches on the source text so one module covers the worker cases.
export const FIXED_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>`;

export function render(request: { source: string | Uint8Array; settings?: unknown }): { bytes: Uint8Array; warnings: string[] } {
  const source = typeof request.source === "string" ? request.source : "";
  if (source === "settings") {
    return { bytes: new TextEncoder().encode(JSON.stringify(request.settings)), warnings: [] };
  }
  if (source === "texcore") {
    const files = (request.settings as { texCore?: ReadonlyMap<string, Uint8Array> } | undefined)?.texCore;
    return { bytes: new TextEncoder().encode(JSON.stringify(files === undefined ? null : [...files.keys()])), warnings: [] };
  }
  if (source === "loop") {
    for (;;) {
      // Busy loop on purpose: the worker must be terminated by the time limit.
    }
  }
  if (source === "crash") {
    process.exit(7);
  }
  if (source === "throw") {
    throw new Error("stub failure");
  }
  return { bytes: new TextEncoder().encode(FIXED_SVG), warnings: [] };
}
