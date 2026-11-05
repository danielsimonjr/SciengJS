import { describe, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
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

/** A fixture whose one mutant runs the test body that is given. The mutant applies when the source holds MUTATED. */
function makeProbeFixture(
  testBody: string,
  mutant = { original: "export const value = 1;", replacement: "export const value = 2; // MUTATED" },
  source = "export const value = 1;\n",
): string {
  const root = mkdtempSync(join(tmpdir(), "sciengjs-mutation-probe-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "test", "mutation"), { recursive: true });
  writeFileSync(join(root, "src", "value.ts"), source);
  writeFileSync(
    join(root, "test", "probe.test.ts"),
    [
      'import { expect, test } from "bun:test";',
      'import { readFileSync } from "node:fs";',
      'import { join } from "node:path";',
      'const mutated = readFileSync(join(import.meta.dir, "..", "src", "value.ts"), "utf8").includes("MUTATED");',
      testBody,
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
          test: "test/probe.test.ts",
          original: mutant.original,
          replacement: mutant.replacement,
          equivalent: null,
        },
      ],
    }),
  );
  return root;
}

/** Runs the runner on a probe fixture, and returns the markdown report that it writes. */
function reportOfProbe(root: string, extraArgs: string[] = []): string {
  const report = join(root, "report.md");
  const run = spawnSync(process.execPath, [RUNNER, `--root=${root}`, `--report=${report}`, ...extraArgs], {
    env: { ...process.env, BUN_BIN: process.execPath },
    encoding: "utf8",
    timeout: WAIT_MS * 2,
  });
  if (run.status !== 0) throw new Error(`the runner exited with ${run.status}: ${run.stderr}`);
  return readFileSync(report, "utf8");
}

/** Runs the runner on a probe fixture, and returns the result that the markdown report gives its one mutant. */
function resultOfProbe(testBody: string, extraArgs: string[] = []): string {
  const root = makeProbeFixture(testBody);
  try {
    const row = /\| value \| src\/value\.ts:1 \| (\w+) \|/.exec(reportOfProbe(root, extraArgs));
    if (row === null) throw new Error("the report has no result row");
    return row[1]!;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("run-mutants never counts a timeout as a kill", () => {
  test("an assertion failure is still a kill (control)", () => {
    expect(resultOfProbe('test("assert", () => { if (mutated) expect(1).toBe(2); });')).toBe("killed");
  }, WAIT_MS);

  test("a test that bun stops at its own time limit is a timeout, not a kill", () => {
    const body = 'test("hangs", () => { if (mutated) return new Promise(() => {}); }, 500);';
    expect(resultOfProbe(body)).toBe("timeout");
  }, WAIT_MS);

  test("a timeout is not a kill even when an assertion failed earlier in the same run", () => {
    const body = [
      'test("assert", () => { if (mutated) expect(1).toBe(2); });',
      'test("hangs", () => { if (mutated) return new Promise(() => {}); }, 500);',
    ].join("\n");
    expect(resultOfProbe(body)).toBe("timeout");
  }, WAIT_MS);

  test("a run that the runner stops at its time limit is a timeout, not a survivor", () => {
    const body = 'test("spins", () => { if (mutated) { while (true) {} } });';
    expect(resultOfProbe(body, ["--timeout-ms=2000"])).toBe("timeout");
  }, WAIT_MS);
});

describe("the report gives the full text of each mutant", () => {
  test("a mutant that changes a second line shows both lines of its text", () => {
    const root = makeProbeFixture(
      'test("unused", () => { if (mutated) expect(1).toBe(2); });',
      { original: "export const value = 1;\n// the second line", replacement: "export const value = 1;\n// the changed line" },
      "export const value = 1;\n// the second line\n",
    );
    try {
      const report = reportOfProbe(root);
      expect(report).toContain("// the second line");
      expect(report).toContain("// the changed line");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, WAIT_MS);
});

describe("a mutant with a line break matches a file with either line end", () => {
  for (const eol of ["\n", "\r\n"]) {
    test(`a two-line mutant applies to a source with ${eol === "\n" ? "LF" : "CRLF"} line ends`, () => {
      const root = makeProbeFixture(
        'test("assert", () => { if (mutated) expect(1).toBe(2); });',
        { original: "export const value = 1;\n// the second line", replacement: "export const value = 1; // MUTATED\n// the second line" },
        `export const value = 1;${eol}// the second line${eol}`,
      );
      try {
        expect(reportOfProbe(root)).toContain("| value | src/value.ts:1 | killed |");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, WAIT_MS);
  }
});

describe("a kill is an assertion failure or an error that the code throws", () => {
  test("an assertion failure is counted as an assertion kill", () => {
    const root = makeProbeFixture('test("assert", () => { if (mutated) expect(1).toBe(2); });');
    try {
      const report = reportOfProbe(root);
      expect(report).toContain("- failure: assertion");
      expect(report).toContain("(1 by an assertion, 0 by an error)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, WAIT_MS);

  test("an error that the code throws is counted as an error kill", () => {
    const root = makeProbeFixture('test("throws", () => { if (mutated) throw new Error("boom"); });');
    try {
      const report = reportOfProbe(root);
      expect(report).toContain("| value | src/value.ts:1 | killed |");
      expect(report).toContain("- failure: error");
      expect(report).toContain("(0 by an assertion, 1 by an error)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, WAIT_MS);
});

describe("the leftovers of an interrupted run are never committed", () => {
  test("a backup and a hash file are ignored by git", () => {
    const repo = resolve(import.meta.dir, "..", "..");
    for (const leftover of [`src/value.ts${BACKUP_SUFFIX}`, `src/value.ts${HASH_SUFFIX}`]) {
      const check = spawnSync("git", ["check-ignore", "-q", "--no-index", leftover], { cwd: repo });
      expect(check.status).toBe(0);
    }
  });
});
