import { describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RUNNER = resolve(import.meta.dir, "run-mutants.mjs");
const BACKUP_SUFFIX = ".mutation-backup";
const HASH_SUFFIX = ".mutation-hash";
const WAIT_MS = 60000;
const POLL_MS = 100;

/** A small project: one source file, and a test that runs slowly while the mutant is applied. */
function makeFixture(): { root: string; source: string } {
  const root = mkdtempSync(join(tmpdir(), "sciengjs-mutation-fixture-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test", "mutation"), { recursive: true });
  const source = join(root, "src", "value.ts");
  writeFileSync(source, "export const value = 1;\n// the original source, with a second line\n");
  writeFileSync(
    join(root, "test", "slow.test.ts"),
    [
      'import { test } from "bun:test";',
      'import { readFileSync } from "node:fs";',
      'import { join } from "node:path";',
      'const source = readFileSync(join(import.meta.dir, "..", "src", "value.ts"), "utf8");',
      'test("slow while a mutant is applied", async () => {',
      '  if (source.includes("MUTATED")) await new Promise((resolve) => setTimeout(resolve, 8000));',
      "});",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "test", "mutation", "mutants.json"),
    JSON.stringify({
      mutants: [
        {
          id: "value",
          file: "src/value.ts",
          test: "test/slow.test.ts",
          original: "export const value = 1;",
          replacement: "export const value = 2; // MUTATED",
          equivalent: null,
        },
      ],
    }),
  );
  return { root, source };
}

/** Starts the runner on a fixture. Its output is collected, and its exit is awaited with the signal name. */
function startRunner(root: string): { child: ChildProcess; output: () => string; exited: Promise<{ code: number | null; signal: string | null }> } {
  const child = spawn(process.execPath, [RUNNER, `--root=${root}`], {
    env: { ...process.env, BUN_BIN: process.execPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout?.on("data", (chunk) => (out += chunk));
  child.stderr?.on("data", (chunk) => (out += chunk));
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolveExit) =>
    child.once("close", (code, signal) => resolveExit({ code, signal })),
  );
  return { child, output: () => out, exited };
}

async function waitUntil(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, POLL_MS));
  }
}

const isMutated = (source: string) => (): boolean => readFileSync(source, "utf8").includes("MUTATED");

describe("run-mutants does not overwrite an edit that it did not make", () => {
  test(
    "an edit made after a hard kill is kept, and the next run exits non-zero before it runs a mutant",
    async () => {
      const { root, source } = makeFixture();
      try {
        const first = startRunner(root);
        await waitUntil(isMutated(source), "the mutant to be applied");
        first.child.kill("SIGKILL");
        await first.exited;
        const edit = "export const value = 7; // a deliberate edit after the hard kill\n";
        writeFileSync(source, edit);

        const second = startRunner(root);
        const { code } = await second.exited;
        expect(code).not.toBe(0);
        expect(readFileSync(source, "utf8")).toBe(edit);
        expect(existsSync(source + BACKUP_SUFFIX)).toBe(true);
        expect(existsSync(source + HASH_SUFFIX)).toBe(true);
        expect(second.output()).toContain(source + BACKUP_SUFFIX);
        expect(second.output()).toContain(source + HASH_SUFFIX);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    WAIT_MS * 2,
  );
});

describe("run-mutants restores the source when the run is interrupted", () => {
  test.skipIf(process.platform === "win32")(
    "SIGINT during a mutant restores the source bytes, names the signal, and exits non-zero",
    async () => {
      const { root, source } = makeFixture();
      try {
        const original = readFileSync(source);
        const run = startRunner(root);
        await waitUntil(isMutated(source), "the mutant to be applied");
        run.child.kill("SIGINT");
        const { code } = await run.exited;
        expect(code).not.toBe(0);
        expect(run.output()).toContain("stopped (SIGINT)");
        expect(readFileSync(source).equals(original)).toBe(true);
        expect(existsSync(source + BACKUP_SUFFIX)).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    WAIT_MS * 2,
  );

  test(
    "a hard kill leaves a backup, and the next run restores the source before it runs anything",
    async () => {
      const { root, source } = makeFixture();
      try {
        const original = readFileSync(source);
        const first = startRunner(root);
        await waitUntil(isMutated(source), "the mutant to be applied");
        // A hard kill cannot run a handler. On Windows this is the only way to stop the runner.
        first.child.kill("SIGKILL");
        await first.exited;
        expect(readFileSync(source, "utf8")).toContain("MUTATED");
        expect(existsSync(source + BACKUP_SUFFIX)).toBe(true);

        const second = startRunner(root);
        const { code } = await second.exited;
        expect(second.output()).toContain("restored 1 file(s)");
        expect(code).toBe(0);
        expect(readFileSync(source).equals(original)).toBe(true);
        expect(existsSync(source + BACKUP_SUFFIX)).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    WAIT_MS * 3,
  );
});
