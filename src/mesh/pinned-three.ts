import { createHash } from "node:crypto";
import { THREE_MODULES } from "../browser/pinned.ts";
import type { PinnedBytes } from "../browser/render.ts";
import { readAsset } from "../assets.ts";
import { RenderError } from "../errors.ts";

/**
 * Reads the pinned Three.js files from the assets folder and checks the SHA-256 of each. A missing file rejects with
 * E_STAGE_MISSING. A file with other bytes rejects with E_INTEGRITY, so a changed copy never runs in a page.
 */
export function pinnedThree(assetsUrl: string): ReadonlyMap<string, PinnedBytes> {
  const map = new Map<string, PinnedBytes>();
  for (const m of THREE_MODULES) {
    const bytes = readAsset(assetsUrl, m.file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== m.sha256) {
      throw new RenderError("E_INTEGRITY", `${m.file} has the SHA-256 ${hash}, not the pinned ${m.sha256}`);
    }
    map.set(m.url, { bytes, mime: m.mime });
  }
  return map;
}
