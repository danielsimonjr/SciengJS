// Mutation audit runner. It reads the mutants of a JSON config, applies one mutant at a time to its file,
// runs the test file of the mutant, and restores the original file. A mutant is killed only when bun reports
// a failing test (a "(fail)" line) and exits non-zero. A passing baseline runs before the first mutant and
// after the last one; the run stops when a baseline fails. A run that times out is never a kill: the runner's
// own limit and bun's per-test limit each give the result "timeout".
//
// Each file is copied to a backup (the file name plus BACKUP_SUFFIX) before a mutant is written. The SHA-256
// of the mutated text goes to a hash file (the file name plus HASH_SUFFIX). The backup restores the file on
// every exit path: normal end, SIGINT, SIGTERM, an uncaught exception, and process exit. A restore happens only
// when the file still holds the recorded mutation. A hard kill (for example SIGKILL, or TerminateProcess on
// Windows) cannot run a handler, so the next start restores such a file before it runs anything else. A file
// that differs from the recorded mutation is left alone, and the run exits non-zero so that a person decides.
//
// Options (flag, then environment variable, then default):
//   --root=<dir>         MUTATION_ROOT        the repository root (default: the current directory)
//   --config=<file>      MUTATION_CONFIG      the mutant list, relative to the root (default: test/mutation/mutants.json)
//   --report=<file>      MUTATION_REPORT      a markdown report with the full text of each mutant (default: none)
//   --timeout-ms=<n>     MUTATION_TIMEOUT_MS  the longest run of one bun test, in milliseconds (default: 300000)
//   BUN_BIN                                   the bun executable (default: bun)
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const BACKUP_SUFFIX = ".mutation-backup";
const HASH_SUFFIX = ".mutation-hash";

const args = process.argv.slice(2);
function option(name, envName, fallback) {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  if (hit !== undefined) return hit.slice(name.length + 3);
  return process.env[envName] ?? fallback;
}

const root = resolve(option("root", "MUTATION_ROOT", process.cwd()));
const configPath = resolve(root, option("config", "MUTATION_CONFIG", "test/mutation/mutants.json"));
const reportPath = option("report", "MUTATION_REPORT", "");
const timeoutMs = Number(option("timeout-ms", "MUTATION_TIMEOUT_MS", "300000"));
const bun = process.env.BUN_BIN ?? "bun";

// A missing or unreadable config fails loudly. There is no built-in list to fall back to.
const config = JSON.parse(readFileSync(configPath, "utf8"));
const mutants = config.mutants;
if (!Array.isArray(mutants) || mutants.length === 0) {
  throw new Error(`no mutants in ${configPath}`);
}

const backupOf = (path) => `${path}${BACKUP_SUFFIX}`;
const hashOf = (path) => `${path}${HASH_SUFFIX}`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Restores each file that a backup covers, but only when the file still holds the mutation that this runner
 * wrote, which the hash file records. A file that differs is not touched: the run reports both paths and leaves
 * the backup and the hash file in place for a person to decide. Returns the number of files restored and the
 * conflicts. Safe to call more than once.
 */
function restoreFromBackups({ quiet = false } = {}) {
  let restored = 0;
  const conflicts = [];
  for (const m of mutants) {
    const path = resolve(root, m.file);
    if (!existsSync(backupOf(path))) continue;
    const current = existsSync(path) ? sha256(readFileSync(path)) : "";
    // A file that already equals its backup is an original: only the leftovers go.
    if (current === sha256(readFileSync(backupOf(path)))) {
      rmSync(backupOf(path), { force: true });
      rmSync(hashOf(path), { force: true });
      continue;
    }
    const expected = existsSync(hashOf(path)) ? readFileSync(hashOf(path), "utf8").trim() : "";
    if (expected === "" || current !== expected) {
      conflicts.push({ path, backup: backupOf(path), hash: hashOf(path) });
      continue;
    }
    copyFileSync(backupOf(path), path);
    rmSync(backupOf(path), { force: true });
    rmSync(hashOf(path), { force: true });
    restored += 1;
  }
  if (!quiet) {
    for (const c of conflicts) {
      console.error(
        `left ${c.path} alone: it differs from the mutation that an earlier run wrote. ` +
          `The original is in ${c.backup}, and the mutation hash is in ${c.hash}. ` +
          "Keep your edit, or copy the original back. Then delete both files.",
      );
    }
  }
  return { restored, conflicts };
}

// The child that runs now. A stop signal kills it, so no bun test outlives the runner.
let activeChild = null;

function stop(reason, code) {
  if (activeChild !== null) activeChild.kill("SIGKILL");
  restoreFromBackups();
  console.error(`mutation run stopped (${reason}); the source files are restored`);
  process.exit(code);
}

process.on("SIGINT", () => stop("SIGINT", 1));
process.on("SIGTERM", () => stop("SIGTERM", 1));
process.on("uncaughtException", (err) => {
  console.error(err);
  stop("uncaught exception", 1);
});
process.on("exit", () => restoreFromBackups({ quiet: true }));

// bun prints this text under a test that it stopped at its own time limit.
const BUN_TIME_LIMIT = /timed out after \d+ms/;

function runBun(testFile) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(bun, ["test", testFile], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    activeChild = child;
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    let stoppedByRunner = false;
    const timer = setTimeout(() => {
      stoppedByRunner = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("error", (err) => {
      clearTimeout(timer);
      activeChild = null;
      rejectRun(err);
    });
    child.once("close", (status) => {
      clearTimeout(timer);
      activeChild = null;
      resolveRun({
        passed: status === 0,
        failedLine: /\(fail\)/.test(out),
        timedOut: stoppedByRunner || BUN_TIME_LIMIT.test(out),
      });
    });
  });
}

async function baseline(testFiles) {
  for (const testFile of testFiles) {
    if (!(await runBun(testFile)).passed) return "FAIL";
  }
  return "pass";
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function lineAt(text, number) {
  return (text.split("\n")[number - 1] ?? "").replace(/\r$/, "");
}

async function main() {
  // A leftover from an interrupted run is restored only when it still holds that run's mutation.
  const { restored, conflicts } = restoreFromBackups();
  if (restored > 0) console.error(`restored ${restored} file(s) that an interrupted run had mutated`);
  if (conflicts.length > 0) {
    console.error("the run did not start: resolve the files named above first");
    process.exit(1);
  }

  const testFiles = [...new Set(mutants.map((m) => m.test))];
  const before = await baseline(testFiles);
  if (before !== "pass") {
    console.error("baseline failed before the first mutant; no mutant was run");
    process.exit(1);
  }

  const results = [];
  for (const m of mutants) {
    const path = resolve(root, m.file);
    const original = readFileSync(path, "utf8");
    const hits = original.split(m.original).length - 1;
    if (hits !== 1) {
      results.push({ ...m, result: "invalid", detail: `the original text occurs ${hits} times` });
      continue;
    }
    const index = original.indexOf(m.original);
    const mutated = original.slice(0, index) + m.replacement + original.slice(index + m.original.length);
    const line = lineNumber(original, index);
    copyFileSync(path, backupOf(path));
    const mutatedBytes = Buffer.from(mutated, "utf8");
    writeFileSync(hashOf(path), sha256(mutatedBytes));
    try {
      writeFileSync(path, mutatedBytes);
      const run = await runBun(m.test);
      // A timeout is never a kill, even when a test failed earlier in the same run.
      const result = run.timedOut ? "timeout" : !run.passed && run.failedLine ? "killed" : "survived";
      results.push({
        ...m,
        line,
        originalLine: lineAt(original, line),
        mutatedLine: lineAt(mutated, line),
        result,
      });
    } finally {
      const { conflicts } = restoreFromBackups();
      if (conflicts.length > 0) throw new Error("a mutated file changed during the run; the run stops");
    }
  }

  const after = await baseline(testFiles);
  const valid = results.filter((r) => r.result !== "invalid");
  const scored = valid.filter((r) => r.equivalent === null);
  const killed = scored.filter((r) => r.result === "killed").length;
  const equivalent = valid.filter((r) => r.equivalent !== null).length;
  const timeouts = scored.filter((r) => r.result === "timeout").length;
  const summary = `killed ${killed} of ${scored.length} non-equivalent mutants; ${timeouts} timed out (never a kill); ${equivalent} equivalent excluded; ${results.length - valid.length} invalid`;

  if (reportPath !== "") {
    const lines = [
      "# Mutation report",
      "",
      `Baseline before: ${before}. Baseline after: ${after}.`,
      "",
      `Summary: ${summary}.`,
      "",
      "| id | file:line | result | equivalent reason |",
      "|---|---|---|---|",
    ];
    for (const r of results) {
      const where = r.line !== undefined ? `${r.file}:${r.line}` : r.file;
      lines.push(`| ${r.id} | ${where} | ${r.result} | ${r.equivalent ?? ""} |`);
    }
    lines.push("", "## Mutants", "");
    for (const r of results) {
      lines.push(`### ${r.id}: ${r.result}`, "", `- file: ${r.file}`, `- test: ${r.test}`);
      if (r.line !== undefined) lines.push(`- line: ${r.line}`);
      if (r.equivalent !== null) lines.push(`- equivalent: ${r.equivalent}`);
      if (r.detail !== undefined) lines.push(`- detail: ${r.detail}`);
      if (r.line !== undefined) {
        lines.push("", "original line:", "", "```", r.originalLine, "```", "", "mutated line:", "", "```", r.mutatedLine, "```");
      }
      lines.push("");
    }
    writeFileSync(reportPath, lines.join("\n"));
  }

  console.log(JSON.stringify({ before, after, summary, results: results.map(({ id, result, equivalent }) => ({ id, result, equivalent })) }, null, 2));
  if (before !== "pass" || after !== "pass") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  stop("error", 1);
});
