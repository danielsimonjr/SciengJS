import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const THIS_FILE = "test/unit/no-sandbox-flag.test.ts";
/** The one line outside this file that may name the flag: the doc comment of the forced flags. */
const ALLOWED = [{ file: "src/browser/flags.ts", line: " * `--no-sandbox`. The renderer keeps the Chrome sandbox on." }];
const FLAG = ["no", "sandbox"].join("-");

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|mjs|js|json|html)$/.test(name)) out.push(path);
  }
  return out;
}

test("no file in src/ or test/ names the flag that turns the browser sandbox off", () => {
  const hits: string[] = [];
  for (const path of [...filesUnder(join(ROOT, "src")), ...filesUnder(join(ROOT, "test"))]) {
    const file = relative(ROOT, path).split("\\").join("/");
    if (file === THIS_FILE) continue;
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (!line.includes(FLAG)) return;
        if (ALLOWED.some((allowed) => allowed.file === file && allowed.line === line)) return;
        hits.push(`${file}:${i + 1}`);
      });
  }
  expect(hits).toEqual([]);
});
