import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

/**
 * The Bun global, called or read as a property. The match needs no word character or dot before it,
 * so a name such as `MyBun.x` does not match. Comments are scanned too: a comment is not an exemption.
 */
export const BUN_GLOBAL = /(?<![\w$.])Bun\./;

export interface BunHit {
  file: string;
  line: number;
  text: string;
}

/** Scans every .ts file under `root`, at any depth, for the Bun global. Returns each hit with its line. */
export function scanForBunGlobal(root: string): BunHit[] {
  const hits: BunHit[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".ts")) {
        readFileSync(full, "utf8")
          .split(/\r?\n/)
          .forEach((text, index) => {
            if (BUN_GLOBAL.test(text)) {
              hits.push({ file: relative(root, full), line: index + 1, text: text.trim() });
            }
          });
      }
    }
  };
  walk(root);
  return hits;
}

/** Writes a scratch tree under the system temp folder. The caller removes it with removeTree. */
export function makePlantedTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "sciengjs-bun-scan-"));
  for (const [name, text] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text, "utf8");
  }
  return root;
}

export function removeTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/** Throws when any .ts file under `root` holds the Bun global. The lint test calls it on src/. */
export function assertNoBunGlobal(root: string): void {
  const hits = scanForBunGlobal(root);
  if (hits.length > 0) {
    const lines = hits.map((h) => `${h.file}:${h.line}: ${h.text}`).join("\n");
    throw new Error(`the Bun global is not allowed here (the design uses only Node and web APIs):\n${lines}`);
  }
}
